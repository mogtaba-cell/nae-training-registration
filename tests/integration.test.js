'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const jf=require('../lib/jotform'),{schoolCode,requireSchoolAccess}=require('../lib/http');
const {data}=require('../lib/domain');
test('Jotform mapper writes request status and all new information, not attendance confirmation',()=>{
 const batch={schoolEsis:'TEST',schoolName:'Test',schoolRegion:'Abu Dhabi',coordinator:{nameEnglish:'Test Coordinator',nameArabic:'Test Arabic',workEmail:'c@example.invalid',mobile:'0500000000',action:'Change requested',emiratesId:'784200000000000'},pathways:['Applied Arts'],originalPathways:[],requestId:'test'};
 const record={teacher:{nameEnglish:'Teacher',esis:'PASS1',nameArabic:'Test',position:'Teacher',pathways:[]},status:'Approved',registrationType:'Added Teacher',pathway:'Oral History',region:'Abu Dhabi',date:'2026-09-24',time:'9:30 AM - 3:00 PM',id:'REQ-test',sessionId:'test'};
 const a=jf.answers(batch,record);assert.equal(a['Request Status'],'Pending review');assert.equal('Attendance Confirmed' in a,false);assert.equal(a['Coordinator Emirates ID'],'784200000000000');assert.equal(a['Teacher Full Name - Arabic'],'Test');assert.deepEqual(a['School Requested Pathways'],['Applied Arts']);
});
test('Jotform serializes multi-select school pathways as separate answers',()=>{const p=new URLSearchParams();jf.append(p,{qid:'1',type:'control_checkbox'},['Visual Arts','Applied Arts']);assert.deepEqual(p.getAll('submission[1][]'),['Visual Arts','Applied Arts']);});
test('Jotform date serialization has the correct day, month, and year',()=>{const p=new URLSearchParams();jf.append(p,{qid:'2',type:'control_datetime'},'2026-10-01');assert.equal(p.get('submission[2][day]'),'01');assert.equal(p.get('submission[2][month]'),'10');assert.equal(p.get('submission[2][year]'),'2026');});
test('Optional school code gate validates the school-specific HMAC',()=>{
 process.env.SCHOOL_ACCESS_SECRET='test-secret-with-adequate-length-only-for-tests';const code=schoolCode('6009');
 assert.doesNotThrow(()=>requireSchoolAccess({headers:{'x-school-access-code':code}},'6009'));
 assert.throws(()=>requireSchoolAccess({headers:{'x-school-access-code':code}},'6005'),/access code/);
 assert.throws(()=>requireSchoolAccess({headers:{'x-school-access-code':'\u0627'.repeat(16)}},'6009'),/access code/);
 delete process.env.SCHOOL_ACCESS_SECRET;
});
test('Persistent schema contains cross-request uniqueness, RLS, atomic submission and restricted access',()=>{
 const sql=fs.readFileSync(require.resolve('../database/setup.sql'),'utf8');
 assert.match(sql,/unique \(school_esis,session_id\)/);assert.match(sql,/enable row level security/);assert.match(sql,/revoke all .*from public,anon,authenticated/s);assert.match(sql,/pg_advisory_xact_lock/);assert.match(sql,/for update skip locked/);
});
test('Every school response omits coordinator/teacher contact values',async()=>{
 const handler=require('../api/school');const old=process.env.SUPABASE_URL;delete process.env.SUPABASE_URL;
 const school=data.schools[0];let output;
 const res={setHeader(){},status(n){assert.equal(n,200);return this;},json(value){output=value;}};
 await handler({method:'GET',headers:{},query:{esis:school.schoolEsis}},res);
 assert.equal(output.coordinator.nameEnglish,school.coordinator.nameEnglish);
 assert.equal('workEmail' in output.coordinator,false);assert.equal('emiratesId' in output.coordinator,false);
 assert.ok(output.teachers.every(t=>!('mobile' in t)&&!('workEmail' in t)));
 if(old)process.env.SUPABASE_URL=old;
});
test('Missing database configuration fails closed instead of accepting an unprotected request',async()=>{
 const store=require('../lib/store');const old=process.env.SUPABASE_URL;delete process.env.SUPABASE_URL;
 await assert.rejects(()=>store.save({requestId:'x'}),/configuration missing/);
 if(old)process.env.SUPABASE_URL=old;
});
test('Public assets contain neither coordinator contacts nor legacy confirmation banners',()=>{
 const js=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
 assert.doesNotMatch(js,/Register another school|confirm nominee|appliedArtsRoutedToOralHistory/);
 const dataLeaks=fs.readdirSync(require('node:path').join(__dirname,'../public')).filter(n=>/json|csv|xlsx/.test(n));assert.equal(dataLeaks.length,0);
});
