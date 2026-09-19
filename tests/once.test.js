'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const store=require('../lib/store');
const domain=require('../lib/domain');
const schoolHandler=require('../api/school');
const schoolsHandler=require('../api/schools');

function response(){return {headers:{},statusCode:0,value:null,setHeader(k,v){this.headers[k.toLowerCase()]=v;},status(n){this.statusCode=n;return this;},json(v){this.value=v;return this;}};}
function stub(t,object,key,value){const original=object[key];object[key]=value;t.after(()=>object[key]=original);}
function env(t,key,value){const prior=process.env[key];if(value===undefined)delete process.env[key];else process.env[key]=value;t.after(()=>{if(prior===undefined)delete process.env[key];else process.env[key]=prior;});}
function schoolRequest(){
  const s=domain.data.schools.find(x=>x.coordinator.verified && x.teachers.some(t=>t.esis));
  const session=domain.data.sessions.find(x=>x.pathway==='Oral History');
  const teacher=s.teachers.find(x=>x.esis);
  return {requestId:crypto.randomUUID(),schoolEsis:s.schoolEsis,pathways:s.registeredPathways,pathwaysReviewed:true,
    coordinator:{action:'verified'},selections:[{sessionId:session.id,teacherId:teacher.id}],addedTeachers:[],teacherIdentifiers:{},acknowledgement:true,language:'en',acknowledgements:{onceOnly:true,emailConfirmation:true}};
}

test('School directory shows Already submitted flags without contacts and is never cached',async t=>{
  stub(t,store,'configured',()=>true);
  const school=domain.data.schools[0];stub(t,store,'submittedSchoolIds',async()=>[school.schoolEsis.trim().toUpperCase()]);
  const res=response();await schoolsHandler({method:'GET'},res);
  assert.equal(res.statusCode,200);assert.equal(res.headers['cache-control'],'no-store');
  assert.equal(res.value.find(x=>x.schoolEsis===school.schoolEsis).alreadySubmitted,true);
  assert.equal(res.value.filter(x=>x.alreadySubmitted).length,1);
  for(const row of res.value)assert.deepEqual(Object.keys(row).sort(),['alreadySubmitted','region','schoolEsis','schoolName','schoolNameArabic']);
});

test('Selecting a submitted school returns a blocker, not its roster or coordinator',async t=>{
  stub(t,store,'configured',()=>true);stub(t,store,'submissionStatus',async()=>({alreadySubmitted:true}));
  const school=domain.data.schools[0],res=response();
  await schoolHandler({method:'GET',query:{esis:school.schoolEsis},headers:{}},res);
  assert.equal(res.statusCode,200);assert.equal(res.value.alreadySubmitted,true);
  assert.equal(res.headers['cache-control'],'no-store');
  for(const key of ['teachers','coordinator','registeredPathways','requestId','payload','bookedSessionIds'])assert.equal(key in res.value,false);
});

test('Minimal public submitted status does not disclose protected information when access codes are enabled',async t=>{
  env(t,'SCHOOL_ACCESS_SECRET','only-a-local-fixture-secret');
  stub(t,store,'configured',()=>true);stub(t,store,'submissionStatus',async()=>({alreadySubmitted:true}));
  const res=response();await schoolHandler({method:'GET',query:{esis:domain.data.schools[0].schoolEsis},headers:{}},res);
  assert.equal(res.statusCode,200);assert.equal(res.value.alreadySubmitted,true);assert.equal('teachers' in res.value,false);
});

test('Unsubmitted schools still require the correct school access code',async t=>{
  env(t,'SCHOOL_ACCESS_SECRET','only-a-local-fixture-secret');
  stub(t,store,'configured',()=>true);stub(t,store,'submissionStatus',async()=>({alreadySubmitted:false}));
  const res=response();await schoolHandler({method:'GET',query:{esis:domain.data.schools[0].schoolEsis},headers:{}},res);
  assert.equal(res.statusCode,403);assert.equal(res.value.code,'SCHOOL_ACCESS_REQUIRED');
});

test('School lookup rechecks durable status instead of trusting an earlier directory result',async t=>{
  env(t,'SCHOOL_ACCESS_SECRET',undefined);stub(t,store,'configured',()=>true);
  let submitted=false;stub(t,store,'submissionStatus',async()=>({alreadySubmitted:submitted}));
  const req={method:'GET',query:{esis:domain.data.schools[0].schoolEsis},headers:{}};
  const first=response();await schoolHandler(req,first);assert.equal(first.value.alreadySubmitted,false);assert.ok(first.value.teachers);
  submitted=true;const second=response();await schoolHandler(req,second);assert.equal(second.value.alreadySubmitted,true);assert.equal('teachers' in second.value,false);
});

test('Database outage does not mistakenly label an already-submitted school as available',async t=>{
  stub(t,store,'configured',()=>true);stub(t,store,'submissionStatus',async()=>{throw Object.assign(new Error('Unavailable'),{code:'STORAGE_UNAVAILABLE'});});
  const res=response();await schoolHandler({method:'GET',query:{esis:domain.data.schools[0].schoolEsis},headers:{}},res);
  assert.equal(res.statusCode,503);assert.equal('teachers' in res.value,false);assert.equal('alreadySubmitted' in res.value,false);
});

test('Store translates school-wide lock rejection to a clear HTTP 409 business error',async t=>{
  env(t,'SUPABASE_URL','https://test.invalid');env(t,'SUPABASE_SECRET_KEY','sb_secret_only-a-test');
  stub(t,global,'fetch',async()=>({ok:false,json:async()=>({code:'P0001',message:'SCHOOL_ALREADY_SUBMITTED'})}));
  await assert.rejects(store.save({requestId:'test'}),e=>e.status===409&&e.code==='SCHOOL_ALREADY_SUBMITTED'&&/only once/.test(e.message));
});

test('Store does not confuse an unrelated unique violation with a school lock',async t=>{
  env(t,'SUPABASE_URL','https://test.invalid');env(t,'SUPABASE_SECRET_KEY','sb_secret_only-a-test');
  stub(t,global,'fetch',async()=>({ok:false,json:async()=>({code:'23505',message:'unique violation'})}));
  await assert.rejects(store.save({requestId:'test'}),e=>e.code==='DUPLICATE_RECORD');
});

test('School status fetch normalizes eSIS and requests only a school identifier',async t=>{
  env(t,'SUPABASE_URL','https://test.invalid');env(t,'SUPABASE_SECRET_KEY','sb_secret_only-a-test');
  stub(t,global,'fetch',async(url,opts)=>{const q=new URL(url).searchParams;assert.equal(q.get('school_esis'),'eq.ATS-TEST');assert.equal(q.get('select'),'school_esis');assert.equal(opts.headers.apikey,'sb_secret_only-a-test');return {ok:true,json:async()=>[{school_esis:'ATS-TEST'}]};});
  assert.deepEqual(await store.submissionStatus(' ats-test '),{alreadySubmitted:true});
});

function registerWith(t,syncImpl){
  const syncModule=require('../lib/sync');stub(t,syncModule,'sync',syncImpl);
  const path=require.resolve('../api/register');delete require.cache[path];const handler=require(path);t.after(()=>delete require.cache[path]);
  env(t,'LOCAL_PREVIEW_ONLY','false');env(t,'SCHOOL_ACCESS_SECRET',undefined);
  return handler;
}

test('First school submission commits before synchronization and returns receipt',async t=>{
  const events=[];stub(t,store,'save',async()=>{events.push('save');return {created:true,count:1};});
  const register=registerWith(t,async()=>{events.push('sync');return {completed:1};});
  const res=response();await register({method:'POST',headers:{},body:schoolRequest()},res);
  assert.equal(res.statusCode,201);assert.equal(res.value.ok,true);assert.deepEqual(events,['save','sync']);
});

test('Identical saved request retry returns its existing receipt instead of a second request',async t=>{
  stub(t,store,'save',async()=>({created:false,count:1}));
  // There must be no pre-check that would reject a legitimate identical retry.
  stub(t,store,'submissionStatus',async()=>{throw new Error('Pre-check must not be used for retries');});
  const register=registerWith(t,async()=>({completed:0}));const body=schoolRequest(),res=response();
  await register({method:'POST',headers:{},body},res);assert.equal(res.statusCode,200);assert.equal(res.value.requestId,body.requestId);
});

test('A school-wide conflict stops a stale-tab request before any Jotform sync',async t=>{
  stub(t,store,'save',async()=>{throw new domain.InputError('Already submitted. Each school can submit only once.',409,'SCHOOL_ALREADY_SUBMITTED');});
  const register=registerWith(t,async()=>{assert.fail('Must not synchronize a rejected request');});const res=response();
  await register({method:'POST',headers:{},body:schoolRequest()},res);
  assert.equal(res.statusCode,409);assert.equal(res.value.code,'SCHOOL_ALREADY_SUBMITTED');
});

test('Jotform synchronization outage does not undo a saved request or school lock',async t=>{
  stub(t,store,'save',async()=>({created:true,count:1}));
  const register=registerWith(t,async()=>{throw new Error('Simulated synchronization outage');});const res=response();
  await register({method:'POST',headers:{},body:schoolRequest()},res);
  assert.equal(res.statusCode,201);assert.equal(res.value.jotformSync,'pending');
});

test('Fresh setup and migration include atomic school-wide locking and preserve history',()=>{
  for(const path of ['../database/setup.sql','../database/migrations/003_one_request_per_school.sql']){
    const sql=fs.readFileSync(require.resolve(path),'utf8');
    assert.match(sql,/school_esis text primary key/);
    assert.match(sql,/after insert on public\.nae_school_requests/);
    assert.match(sql,/SCHOOL_ALREADY_SUBMITTED/);
    assert.match(sql,/select distinct on \(upper\(btrim\(school_esis\)\)\)/);
    assert.match(sql,/on conflict \(school_esis\) do nothing/);
    assert.match(sql,/enable row level security/);
    assert.doesNotMatch(sql,/delete from|truncate /i);
    assert.ok(sql.indexOf('where id=p_id')<sql.indexOf("raise exception 'SCHOOL_ALREADY_SUBMITTED'",sql.indexOf('nae_submit_request(p_id')));
  }
});

test('The blocked UI has no refresh-availability workaround or unlocked next step',()=>{
  const js=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
  assert.match(js,/Already submitted/);assert.match(js,/cache:'no-store'/);
  assert.match(js,/if\(error\.code==='SCHOOL_ALREADY_SUBMITTED'\)/);
  assert.doesNotMatch(js,/Refresh session availability|sessions still available/);
});

test('Legacy Jotform records for multiple sessions are consolidated into one school request',()=>{
  const {prepare}=require('../scripts/import-existing-jotform');
  const school=domain.data.schools[0],sessions=domain.data.sessions.filter(s=>s.pathway==='Oral History');
  const rows=sessions.map((s,i)=>({id:String(i+1),answers:Object.fromEntries(Object.entries({'School ESIS':school.schoolEsis,'Registration Pathway':s.pathway,'Training Region':s.region,'Session Date':s.date,'Teacher eSIS':'PASS-TEST-1','Teacher Name':'Test Teacher'}).map(([text,answer],n)=>[String(n),{text,answer}]))}));
  const plan=prepare(rows,'TEST-FORM');assert.equal(plan.problems.length,0);assert.equal(plan.prepared.length,1);assert.equal(plan.prepared[0].payload.records.length,2);assert.equal(plan.prepared[0].links.length,2);
  const replay=prepare([...rows].reverse(),'TEST-FORM');assert.equal(plan.prepared[0].requestId,replay.prepared[0].requestId);assert.equal(plan.prepared[0].hash,replay.prepared[0].hash);
});
