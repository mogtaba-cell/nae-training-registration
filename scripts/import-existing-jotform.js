'use strict';
// READ-ONLY unless --import is supplied. Never changes Jotform records.
// v2.1 groups ALL legacy session records for a school into ONE school request.
const crypto=require('node:crypto');
const {getSchool,data,identity}=require('../lib/domain');
const store=require('../lib/store'),jf=require('../lib/jotform');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function uuid(value){const h=hash(value).slice(0,32).split('');h[12]='4';h[16]='8';const s=h.join('');return [s.slice(0,8),s.slice(8,12),s.slice(12,16),s.slice(16,20),s.slice(20)].join('-');}
function answer(row,label){return Object.values(row.answers||{}).find(a=>String(a.text||'').trim().toLowerCase()===label.toLowerCase())?.answer??'';}
function date(value){if(value&&typeof value==='object'&&value.year&&value.month&&value.day)return `${value.year}-${String(value.month).padStart(2,'0')}-${String(value.day).padStart(2,'0')}`;const raw=String(value);return /^\d{4}-\d{2}-\d{2}$/.test(raw)?raw:'';}
function prepare(rows,formId){
  const schools=new Map(),seen=new Map(),problems=[];
  for(const row of rows){
    if(['DELETED','TRASHED'].includes(String(row.status||'')))continue;
    // v2+ requests already have a primary database. Do not import these as new.
    if(String(answer(row,'Portal Registration ID')).startsWith('REQ-'))continue;
    const school=getSchool(String(answer(row,'School ESIS')));
    const session=data.sessions.find(s=>s.pathway===answer(row,'Registration Pathway')&&s.region===answer(row,'Training Region')&&s.date===date(answer(row,'Session Date')));
    const teacherEsis=String(answer(row,'Teacher eSIS')),teacherName=String(answer(row,'Teacher Name'));
    if(!school||!session||!teacherEsis||!teacherName){problems.push('Submission '+row.id+': unmatched school, session/date, or teacher.');continue;}
    const pair=school.schoolEsis+'|'+session.id;
    if(seen.has(pair))problems.push('Duplicate school/session in '+seen.get(pair)+' and '+row.id+'. Resolve genuine/test duplicates before importing.');
    seen.set(pair,row.id);
    const recordId='LEGACY-'+row.id,listed=school.teachers.find(t=>identity(t.esis)===identity(teacherEsis));
    const teacher={id:listed?.id||recordId,esis:teacherEsis,nameEnglish:teacherName,nameArabic:listed?.nameArabic||'',position:listed?.position||'',workEmail:String(answer(row,'Teacher Email'))||listed?.workEmail||'',mobile:String(answer(row,'Teacher Phone'))||listed?.mobile||'',pathways:listed?.pathways||[]};
    const record={id:recordId,sessionId:session.id,pathway:session.pathway,region:session.region,date:session.date,time:session.time,venue:session.venue,teacher,registrationType:listed?'Listed Teacher':'Added Teacher',status:'Pending review'};
    if(!schools.has(school.schoolEsis))schools.set(school.schoolEsis,{school,records:[],links:[]});
    schools.get(school.schoolEsis).records.push(record);schools.get(school.schoolEsis).links.push({recordId,jotformId:String(row.id)});
  }
  const prepared=[...schools.values()].map(({school,records,links})=>{
    records.sort((a,b)=>a.sessionId.localeCompare(b.sessionId));
    const payload={schemaVersion:2,source:'Legacy Jotform import',schoolEsis:school.schoolEsis,schoolName:school.schoolName,schoolRegion:school.region,originalPathways:school.registeredPathways,pathways:school.registeredPathways,pathwaysReviewed:false,coordinator:{...school.coordinator,action:school.coordinator.verified?'Verified on file':'Imported legacy contact'},records,acknowledgement:false};
    return {requestId:uuid('legacy-school-'+formId+'-'+school.schoolEsis),schoolEsis:school.schoolEsis,payload,hash:hash(payload),links};
  });
  return {prepared,problems};
}
async function main(){
  const {formId}=jf.settings(),rows=[];
  for(let offset=0;;offset+=1000){const page=await jf.api('/form/'+formId+'/submissions?limit=1000&offset='+offset);if(!Array.isArray(page))throw new Error('Unable to read submissions.');rows.push(...page);if(page.length<1000)break;}
  const {prepared,problems}=prepare(rows,formId);
  console.log(prepared.reduce((n,p)=>n+p.payload.records.length,0)+' legacy session records grouped into '+prepared.length+' school requests.');
  if(problems.length){for(const issue of problems)console.error(issue);throw new Error('Nothing imported. Resolve the report first.');}
  if(!process.argv.includes('--import')){console.log('Read-only report complete. Pause the sync cron during import; then run again with --import.');return;}
  // Preflight all schools before inserting any. Existing v2 requests are kept,
  // not replaced or silently appended to by this importer.
  for(const row of prepared){
    const locks=await store.db('nae_school_submission_locks?'+new URLSearchParams({school_esis:'eq.'+row.schoolEsis.trim().toUpperCase(),select:'school_request_id',limit:'1'}));
    if(locks.length&&locks[0].school_request_id!==row.requestId)throw new Error('School '+row.schoolEsis+' is already submitted in this database. No imports started. Reconcile history administratively.');
    if(locks.length){const old=await store.getBatch(row.requestId);if(hash(old)!==row.hash)throw new Error('Legacy history changed for '+row.schoolEsis+'. No imports started. Reconcile administratively.');}
  }
  for(const row of prepared){await store.save(row);for(const link of row.links)await store.mark(link.recordId,'synced',link.jotformId);}
  console.log(prepared.length+' school requests imported and locked. Jotform was not modified. Re-enable the sync cron.');
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={prepare};
