'use strict';
const {InputError}=require('./domain');
function configured(){return Boolean(process.env.SUPABASE_URL&&(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY));}
async function db(path,options={}) {
  if(!configured()) throw Object.assign(new Error('Storage configuration missing'),{code:'STORAGE_NOT_CONFIGURED'});
  const base=process.env.SUPABASE_URL.replace(/\/$/,'');
  if(!base.startsWith('https://') && process.env.NODE_ENV!=='test') throw new Error('Database must use HTTPS.');
  const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authHeaders=key.startsWith('sb_secret_')?{apikey:key}:{apikey:key,Authorization:'Bearer '+key};
  let r;
  try{r=await fetch(base+'/rest/v1/'+path,{...options,headers:{...authHeaders,'Content-Type':'application/json',Prefer:'return=representation',...options.headers},signal:AbortSignal.timeout(15000)});}
  catch{throw Object.assign(new Error('Storage unavailable'),{code:'STORAGE_UNAVAILABLE'});}
  const result=await r.json().catch(()=>null);
  if(!r.ok) {
    if(result?.message?.includes('SCHOOL_ALREADY_SUBMITTED')) throw new InputError('A training registration request has already been submitted for this school. Each school can submit only once. Please contact the training team for any corrections.',409,'SCHOOL_ALREADY_SUBMITTED');
    if(result?.message?.includes('SCHOOL_SESSION_TAKEN')) throw new InputError('Only one teacher from your school can be requested for each session. No part of this request was saved.',409,'SCHOOL_SESSION_TAKEN');
    if(result?.code==='23505') throw new InputError('The request contains a duplicate record. No additional request was saved.',409,'DUPLICATE_RECORD');
    if(result?.message?.includes('IDEMPOTENCY_MISMATCH')) throw new InputError('This request has already been received. Please do not resubmit different details with the same reference.',409,'IDEMPOTENCY_MISMATCH');
    throw Object.assign(new Error('Storage operation failed'),{code:'STORAGE_OPERATION_FAILED'});
  }
  return result;
}
async function availability(school){
  const q=new URLSearchParams({school_esis:'eq.'+school,select:'session_id'});
  const result=await db('nae_training_requests?'+q);
  return result.map(r=>r.session_id);
}
// Only a boolean is exposed in the public school directory. Request payloads,
// references and personal details are never returned by this status lookup.
async function submittedSchoolIds(){
  const rows=await db('nae_school_submission_locks?select=school_esis');
  return rows.map(r=>r.school_esis);
}
async function submissionStatus(school){
  const query=new URLSearchParams({school_esis:'eq.'+String(school).trim().toUpperCase(),select:'school_esis',limit:'1'});
  const rows=await db('nae_school_submission_locks?'+query);
  return {alreadySubmitted:rows.length>0};
}
async function save(request) {return db('rpc/nae_submit_request',{method:'POST',body:JSON.stringify({p_id:request.requestId,p_school:request.schoolEsis,p_hash:request.hash,p_payload:request.payload})});}
async function claim(batch=null,limit=9){return db('rpc/nae_claim_sync',{method:'POST',body:JSON.stringify({p_batch:batch,p_limit:limit})});}
async function getBatch(id){const r=await db('nae_school_requests?'+new URLSearchParams({id:'eq.'+id,select:'payload'})); if(!r.length)throw new Error('Missing batch');return r[0].payload;}
async function mark(id,state,submissionId=null,error=null){return db('nae_training_requests?'+new URLSearchParams({id:'eq.'+id}),{method:'PATCH',body:JSON.stringify({sync_state:state,jotform_submission_id:submissionId,sync_error:error})});}
async function flagStale(){return db('nae_training_requests?'+new URLSearchParams({sync_state:'eq.sending',sync_started_at:'lt.'+new Date(Date.now()-10*60*1000).toISOString()}),{method:'PATCH',body:JSON.stringify({sync_state:'needs_review',sync_error:'Worker interrupted. Check Jotform by Portal Registration ID before any retry.'})});}
module.exports={configured,db,availability,submittedSchoolIds,submissionStatus,save,claim,getBatch,mark,flagStale};
