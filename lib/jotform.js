'use strict';
// Question labels are the integration contract. No private keys enter the browser.
let cachedQuestions=null,cacheUntil=0;
const requiredLabels=['School ESIS','School Name','School Region','School Contact Name','School Contact Email','School Contact Phone','Teacher eSIS','Teacher Name','Teacher Email','Teacher Phone','Registration Type','Registration Pathway','Training Region','Session Date','Session Time','Request Status','Portal Registration ID','School Submission ID','Record Source','School Registered Pathways','School Requested Pathways','School Pathways Reviewed','Coordinator Action','Coordinator Full Name - Arabic','Coordinator eSIS/PASS Number','Coordinator Position/Designation','Coordinator Emirates ID','Coordinator Primary Email','Teacher Full Name - Arabic','Teacher Position/Designation','Session ID','Notes'];
function settings(){
  const key=process.env.JOTFORM_API_KEY,formId=process.env.JOTFORM_FORM_ID;
  const base=(process.env.JOTFORM_API_BASE||'https://api.jotform.com').replace(/\/$/,'');
  if(!key||!/^\d+$/.test(formId||'')) throw new Error('Jotform configuration is missing.');
  if(!['https://api.jotform.com','https://eu-api.jotform.com','https://hipaa-api.jotform.com'].includes(base)) throw new Error('Invalid Jotform API base.');
  return {key,formId,base};
}
async function api(path,options={}) {
  const {key,base}=settings();
  let response,body;
  try {response=await fetch(base+path,{...options,headers:{APIKEY:key,...options.headers},signal:AbortSignal.timeout(14000)});}
  catch {throw Object.assign(new Error('Jotform connection unavailable'),{uncertain:options.method==='POST'});}
  try {body=await response.json();} catch {throw Object.assign(new Error('Unreadable Jotform response'),{uncertain:options.method==='POST'});}
  if(!response.ok || Number(body.responseCode)>=400) {
    const status=Number(body.responseCode)||response.status;
    throw Object.assign(new Error('Jotform request failed'),{uncertain:options.method==='POST' && status>=500});
  }
  return body.content;
}
function byLabel(qs,label){return Object.entries(qs).map(([qid,q])=>({qid,...q})).find(q=>String(q.text||'').trim().toLowerCase()===label.toLowerCase());}
async function questions(force=false) {
  if(!force && cachedQuestions && Date.now()<cacheUntil) return cachedQuestions;
  const {formId}=settings();
  const qs=await api('/form/'+formId+'/questions');
  if(!qs || typeof qs!=='object') throw new Error('Jotform schema unavailable.');
  const missing=requiredLabels.filter(label=>!byLabel(qs,label));
  if(missing.length) throw Object.assign(new Error('Missing Jotform labels: '+missing.join(', ')),{missingLabels:missing});
  cachedQuestions=qs;cacheUntil=Date.now()+300000;return qs;
}
function append(params,q,value) {
  if(!q||value===undefined||value===null||value==='') return;
  const key=`submission[${q.qid}]`;
  if(q.type==='control_datetime') {
    const [year,month,day]=String(value).split('-');
    params.append(key+'[year]',year);params.append(key+'[month]',month);params.append(key+'[day]',day);return;
  }
  if(q.type==='control_checkbox') {for(const v of Array.isArray(value)?value:[value])params.append(key+'[]',String(v));return;}
  if(q.type==='control_fullname') {params.append(key+'[first]',String(value));params.append(key+'[last]','');return;}
  if(q.type==='control_phone') {params.append(key+'[full]',String(value));return;}
  params.append(key,Array.isArray(value)?value.join(', '):String(value));
}
function answers(batch,record) {
  const c=batch.coordinator,t=record.teacher;
  return {
    'School ESIS':batch.schoolEsis,'School Name':batch.schoolName,'School Region':batch.schoolRegion,
    'School Contact Name':c.nameEnglish,'School Contact Email':c.workEmail,'School Contact Phone':c.mobile,
    'Teacher eSIS':t.esis,'Teacher Name':t.nameEnglish,'Teacher Email':t.workEmail,'Teacher Phone':t.mobile,
    'Registration Type':record.registrationType,'Original Nomination Pathway':record.pathway==='Oral History'&&t.pathways.includes('Applied Arts')?'Applied Arts':t.pathways.includes(record.pathway)?record.pathway:'Not Originally Nominated',
    'Registration Pathway':record.pathway,'Training Region':record.region,'Session Date':record.date,'Session Time':record.time,
    'Venue':record.venue,'Request Status':'Pending review','Portal Registration ID':record.id,
    'School Submission ID':batch.requestId,'Record Source':'Hybrid Portal','School Registered Pathways':batch.originalPathways,
    'School Requested Pathways':batch.pathways,'School Pathways Reviewed':'Yes','Coordinator Action':c.action,
    'Coordinator Full Name - Arabic':c.nameArabic,'Coordinator eSIS/PASS Number':c.esis,'Coordinator Position/Designation':c.position,
    'Coordinator Emirates ID':c.emiratesId,'Coordinator Primary Email':c.primaryEmail,
    'Teacher Full Name - Arabic':t.nameArabic,'Teacher Position/Designation':t.position,'Session ID':record.sessionId,
    'Notes':['Workshop registration request only. Attendance is subject to availability, review and a confirmation email from NAE Team.',record.sessionLanguage?'Session language: '+record.sessionLanguage:'',batch.schoolNameArabic?'School name (Arabic): '+batch.schoolNameArabic:'',batch.acknowledgements?.onceOnly===true&&batch.acknowledgements?.emailConfirmation===true?'Acknowledgements accepted ('+batch.acknowledgements.language+'; '+batch.acknowledgements.version+'):\n1. '+batch.acknowledgements.statements.onceOnly+'\n2. '+batch.acknowledgements.statements.emailConfirmation:'Legacy request: the two separate acknowledgements were not recorded.'].filter(Boolean).join('\n')
  };
}
async function submit(batch,record,qs) {
  const params=new URLSearchParams();
  for(const [label,value] of Object.entries(answers(batch,record))) append(params,byLabel(qs,label),value);
  const {formId}=settings();
  const result=await api('/form/'+formId+'/submissions',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:params});
  if(!result?.submissionID) throw Object.assign(new Error('Jotform submission ID missing'),{uncertain:true});
  return String(result.submissionID);
}
module.exports={questions,submit,answers,append,byLabel,requiredLabels,api,settings};
