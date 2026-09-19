'use strict';
const crypto = require('node:crypto');
const data = require('../data/registration-data.json');
const i18n = require('../public/i18n');
const officialPathways = ['Literary Arts','Performing Arts','Visual Arts','Digital Arts','Applied Arts'];
const bySchool = new Map(data.schools.map(s => [s.schoolEsis.toLowerCase(), s]));
const bySession = new Map(data.sessions.map(s => [s.id, s]));
class InputError extends Error { constructor(message, status=400, code='INVALID_REQUEST') { super(message); this.status=status; this.code=code; } }
const txt=(value,max=200)=>String(value??'').trim().slice(0,max);
const identity=value=>i18n.digits(txt(value,80)).replace(/\s+/g,'').toUpperCase();
const email=value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const getSchool=esis=>bySchool.get(txt(esis,80).toLowerCase());
const getSession=id=>bySession.get(id);
const isLocalPreview=()=>!process.env.VERCEL && process.env.LOCAL_PREVIEW_ONLY==='true';
function publicSchool(school) {
  return {schoolEsis:school.schoolEsis,schoolName:school.schoolName,schoolNameArabic:school.schoolNameArabic,region:school.region,
    registeredPathways:school.registeredPathways,
    coordinator:{listed:Boolean(school.coordinator.nameEnglish),nameEnglish:school.coordinator.nameEnglish,nameArabic:school.coordinator.nameArabic,verified:school.coordinator.verified===true},
    teachers:school.teachers.map(t=>({id:t.id,nameEnglish:t.nameEnglish,nameArabic:t.nameArabic,esis:t.esis,pathways:t.pathways}))};
}
function publicSession(s) { const {venue,...safe}=s; return safe; }
function eligibleSessions(school, pathways) {
  return data.sessions.filter(s=>{
    if(s.pathway==='Oral History') return true;
    if(!pathways.includes(s.pathway)) return false;
    if(s.pathway==='Performing Arts') return s.region==='Abu Dhabi';
    return school.region==='Al Dhafra' || s.region===school.region;
  });
}
function requireFields(input, fields, label) {
  const out={};
  for(const field of fields) {
    out[field]=txt(input?.[field],field.includes('Email')?254:160);
    if(['esis','emiratesId','mobile'].includes(field)) out[field]=i18n.digits(out[field]);
    if(!out[field]) throw new InputError(`${label}: please complete all required fields.`);
  }
  if(out.workEmail && !email(out.workEmail)) throw new InputError(`${label}: enter a valid work email.`);
  if(out.primaryEmail && !email(out.primaryEmail)) throw new InputError(`${label}: enter a valid primary email.`);
  if(out.mobile && !/^\+?[0-9 ()-]{7,30}$/.test(out.mobile)) throw new InputError(`${label}: enter a valid contact mobile.`);
  if(out.mobile && !/^[0-9]{7,15}$/.test(out.mobile.replace(/\D/g,''))) throw new InputError(`${label}: enter a valid contact mobile.`);
  if(out.esis) out.esis=identity(out.esis);
  if(out.emiratesId) {
    out.emiratesId=out.emiratesId.replace(/[\s-]/g,'');
    if(!/^784\d{12}$/.test(out.emiratesId)) throw new InputError('Enter a 15-digit Emirates ID starting with 784.');
  }
  return out;
}
function resolveCoordinator(school, input) {
  const onFile=school.coordinator;
  if(onFile.verified) {
    if(input?.action!=='verified') throw new InputError('This school already has a verified coordinator on file.');
    return {...onFile,action:'Verified on file'};
  }
  if(onFile.nameEnglish && input?.action==='confirm') return {...onFile,verified:false,action:'Confirmed by school'};
  if(input?.action!== (onFile.nameEnglish?'change':'add')) throw new InputError('Confirm the listed coordinator or provide a new coordinator.');
  const entered=requireFields(input,['nameEnglish','nameArabic','esis','position','emiratesId','workEmail','primaryEmail','mobile'],'Coordinator');
  return {...entered,verified:false,action:onFile.nameEnglish?'Change requested':'New coordinator submitted'};
}
function stableHash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function validateRequest(body) {
  if(!body || typeof body!=='object' || Array.isArray(body)) throw new InputError('Invalid request.');
  const school=getSchool(body.schoolEsis);
  if(!school) throw new InputError('Choose a school from the list.');
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId||'')) throw new InputError('Please refresh the page before submitting.');
  if(body.pathwaysReviewed!==true) throw new InputError('Please review and verify your school pathways.');
  if(body.acknowledgements?.onceOnly!==true || body.acknowledgements?.emailConfirmation!==true) throw new InputError('Please accept both acknowledgements before submitting.',400,'ACKNOWLEDGEMENTS_REQUIRED');
  const language=i18n.language(body.language);
  const acknowledgements={onceOnly:true,emailConfirmation:true,version:i18n.policyVersion,language,statements:{onceOnly:i18n.policy[language].onceOnly,emailConfirmation:i18n.policy[language].emailConfirmation}};
  if(!Array.isArray(body.pathways) || body.pathways.some(p=>!officialPathways.includes(p))) throw new InputError('Invalid school pathway selection.');
  const pathways=officialPathways.filter(p=>body.pathways.includes(p));
  const coordinator=resolveCoordinator(school,body.coordinator);
  const choices=body.selections;
  if(!Array.isArray(choices)||!choices.length||choices.length>data.sessions.length) throw new InputError('Select a teacher for at least one workshop session.');
  const allowed = new Set(eligibleSessions(school,pathways).map(s=>s.id));
  const seenSessions=new Set();
  const seenRegionalPathways=new Set();
  const roster=new Map(school.teachers.map(t=>[t.id,t]));
  const newTeachers=new Map();
  const newIds=new Set();
  if(!Array.isArray(body.addedTeachers)||body.addedTeachers.length>50) throw new InputError('Invalid additional teacher list.');
  for(const t of body.addedTeachers) {
    if(!/^A-[a-zA-Z0-9-]{1,80}$/.test(t?.id||'') || newTeachers.has(t.id)) throw new InputError('Duplicate or invalid additional teacher.');
    // Unused drafts are not collected or stored.
    if(!choices.some(c=>c.teacherId===t.id)) continue;
    const validated=requireFields(t,['nameEnglish','nameArabic','esis','position','workEmail','mobile'],'Teacher');
    if(newIds.has(validated.esis)) throw new InputError('The same eSIS/PASS number was entered more than once. Reuse the existing teacher.');
    const known=school.teachers.find(x=>x.esis && identity(x.esis)===validated.esis);
    if(known && known.nameEnglish.toLowerCase()!==validated.nameEnglish.toLowerCase()) throw new InputError('That eSIS/PASS number belongs to a teacher already listed for this school. Select the listed teacher.');
    newIds.add(validated.esis); newTeachers.set(t.id,{...validated,id:t.id,pathways:known?.pathways||[]});
  }
  const records=[];
  for(const choice of choices) {
    if(!allowed.has(choice?.sessionId)) throw new InputError('A selected session does not match your school pathways or region.');
    if(seenSessions.has(choice.sessionId)) throw new InputError('Only one teacher from your school can be requested for each session.');
    seenSessions.add(choice.sessionId);
    const session=getSession(choice.sessionId);
    if(school.region==='Al Dhafra' && ['Literary Arts','Digital Arts','Visual Arts'].includes(session.pathway)) {
      if(seenRegionalPathways.has(session.pathway)) throw new InputError(`Choose either Abu Dhabi or Al Ain for ${session.pathway}. Only one regional session can be requested for this pathway.`);
      seenRegionalPathways.add(session.pathway);
    }
    const listed=roster.get(choice.teacherId);
    let teacher;
    if(listed) {
      if(session.pathway!=='Oral History' && !listed.pathways.includes(session.pathway)) throw new InputError('This listed teacher is not registered for the selected pathway. Use the add-teacher option to request a different assignment.');
      const esis=listed.esis||identity(body.teacherIdentifiers?.[listed.id]);
      if(!esis) throw new InputError('Enter the missing eSIS/PASS number for the selected teacher.');
      if(!listed.esis && school.teachers.some(t=>t.id!==listed.id && identity(t.esis)===esis)) throw new InputError('The entered eSIS/PASS number already belongs to another listed teacher.');
      teacher={...listed,esis};
    } else {
      teacher=newTeachers.get(choice.teacherId);
      if(teacher && session.pathway!=='Oral History' && teacher.pathways.includes('Applied Arts') && !teacher.pathways.includes(session.pathway)) throw new InputError('This listed teacher is not eligible for this workshop. Please choose a different teacher.');
      if(!teacher) throw new InputError('Please select or add a teacher for the session.');
    }
    const recordId='REQ-'+stableHash([body.requestId,session.id]).slice(0,24).toUpperCase();
    records.push({id:recordId,sessionId:session.id,pathway:session.pathway,region:session.region,date:session.date,time:session.time,
      venue:session.venue,teacher,registrationType:listed?'Listed Teacher':'Added Teacher',status:'Pending review'});
  }
  const identities=new Map();
  for(const record of records) {
    const key=identity(record.teacher.esis),name=record.teacher.nameEnglish.toLowerCase();
    if(identities.has(key)&&identities.get(key)!==name) throw new InputError('The same eSIS/PASS number cannot be used for two different teachers.');
    identities.set(key,name);
  }
  records.sort((a,b)=>a.sessionId.localeCompare(b.sessionId));
  const payload={schemaVersion:3,schoolEsis:school.schoolEsis,schoolName:school.schoolName,schoolNameArabic:school.schoolNameArabic,schoolRegion:school.region,language,acknowledgements,
    originalPathways:school.registeredPathways,pathways,pathwaysReviewed:true,coordinator,records,acknowledgement:true};
  return {requestId:body.requestId.toLowerCase(),schoolEsis:school.schoolEsis,payload,hash:stableHash(payload)};
}
module.exports={data,officialPathways,InputError,txt,email,identity,getSchool,getSession,publicSchool,publicSession,eligibleSessions,resolveCoordinator,validateRequest,isLocalPreview};
