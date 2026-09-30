'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');
const domain=require('../lib/domain');
const {data,publicSchool,eligibleSessions,validateRequest,resolveCoordinator}=domain;
const all=domain.officialPathways;
const ad=data.schools.find(s=>s.region==='Abu Dhabi'&&s.coordinator.verified&&s.teachers.length>=2);
const unverified=data.schools.find(s=>s.coordinator.nameEnglish&&!s.coordinator.verified&&s.teachers.length);
const noCoordinator=data.schools.find(s=>!s.coordinator.nameEnglish);
const closedOral=data.sessions.find(s=>s.id==='ORAL-HISTORY-ABU-DHABI-20260924');
const newCoordinator={nameEnglish:'Test Coordinator',nameArabic:'Test Arabic Name',esis:'PASS-TEST-C',position:'Coordinator',emiratesId:'784-2000-0000000-0',workEmail:'coordinator@example.invalid',primaryEmail:'primary@example.invalid',mobile:'0500000000'};
const newTeacher={id:'A-test',nameEnglish:'Test Teacher',nameArabic:'Test Arabic Name',esis:'PASS-TEST-1',position:'Teacher',workEmail:'teacher@example.invalid',mobile:'0500000000'};
function body(school=ad){const session=eligibleSessions(school,all)[0];return {requestId:crypto.randomUUID(),schoolEsis:school.schoolEsis,pathways:[...all],pathwaysReviewed:true,coordinator:{action:school.coordinator.verified?'verified':school.coordinator.nameEnglish?'confirm':'add',...(!school.coordinator.nameEnglish?newCoordinator:{})},addedTeachers:[],teacherIdentifiers:{},selections:[{sessionId:session.id,teacherId:school.teachers[0]?.id||newTeacher.id}],acknowledgement:true,language:'en',acknowledgements:{onceOnly:true,emailConfirmation:true}};}
test('Refreshed directory uses all 290 schools and 1093 attached teacher/coordinator roster records',()=>{
 assert.equal(data.schools.length,290);assert.equal(new Set(data.schools.map(s=>s.schoolEsis)).size,290);
 assert.equal(data.schools.reduce((n,s)=>n+s.teachers.length,0),1093);
 for(const s of data.schools){assert.equal(new Set(s.teachers.map(t=>t.id)).size,s.teachers.length);assert.ok(s.registeredPathways.every(p=>all.includes(p)));}
});
test('Teacher-list schools are added and the manually supplied 9105 school starts with no invented people or pathways',()=>{
 const bayan=domain.getSchool('6026'),maple=domain.getSchool('9255'),ens=domain.getSchool('9105');
 assert.equal(bayan.schoolName,'Al Bayan School');assert.equal(bayan.teachers.length,1);assert.deepEqual(bayan.registeredPathways,[]);
 assert.equal(maple.schoolName,'Maplewood Canadian International School');assert.equal(maple.teachers.length,3);assert.deepEqual(maple.registeredPathways,[]);
 assert.equal(ens.schoolName,'Emirates National Schools - Mbz');assert.equal(ens.schoolNameArabic,'مدرسة الإمارات الوطنية - محمد بن زايد');assert.equal(ens.region,'Abu Dhabi');assert.equal(ens.teachers.length,0);assert.equal(ens.coordinator.nameEnglish,'');assert.deepEqual(ens.registeredPathways,[]);
});
test('Verified badge corresponds only to the 59 Yes values in the workbook',()=>assert.equal(data.schools.filter(s=>s.coordinator.verified).length,59));
test('Private contacts and identity numbers never occur in public school fields',()=>{
 for(const s of data.schools){const value=publicSchool(s),json=JSON.stringify(value);for(const term of ['workEmail','primaryEmail','mobile','emiratesId','position'])assert.equal(json.includes('"'+term+'"'),false);assert.equal(value.coordinator.verified,s.coordinator.verified);}
});
test('Public session data excludes venue',()=>{for(const s of data.sessions)assert.equal('venue' in domain.publicSession(s),false);});
test('Abu Dhabi routing exposes only still-open later sessions and invents no Applied Arts session',()=>{
 const sessions=eligibleSessions(ad,all);assert.equal(sessions.length,1);assert.ok(sessions.every(s=>s.region==='Abu Dhabi'));assert.ok(!sessions.some(s=>s.pathway==='Applied Arts'));
 assert.deepEqual(sessions.map(s=>s.id),['VISUAL-ARTS-ABU-DHABI-20261006']);
});
test('Al Ain exposes only the still-open local Literary and Visual Arts sessions',()=>{
 const school=data.schools.find(s=>s.region==='Al Ain');const sessions=eligibleSessions(school,all);assert.equal(sessions.length,2);
 assert.deepEqual(sessions.map(s=>s.id).sort(),['LITERARY-ARTS-AL-AIN-20261005','VISUAL-ARTS-AL-AIN-20261008'].sort());
});
test('Al Dhafra sees only currently open regional options before choosing one',()=>assert.equal(eligibleSessions(data.schools.find(s=>s.region==='Al Dhafra'),all).length,3));
test('Al Dhafra cannot request both Abu Dhabi and Al Ain for the same pathway',()=>{
 const school=data.schools.find(s=>s.region==='Al Dhafra');const b=body(school);const pair=data.sessions.filter(s=>s.pathway==='Visual Arts');
 b.addedTeachers=[newTeacher];b.selections=pair.map(s=>({sessionId:s.id,teacherId:newTeacher.id}));
 assert.throws(()=>validateRequest(b),/either Abu Dhabi or Al Ain/);
});
test('Schools without pathways have no open session until they add a pathway',()=>assert.deepEqual(eligibleSessions(ad,[]).map(s=>s.id),[]));
test('24 September Oral History remains in historical schedule data but is closed for new requests',()=>{assert.equal(closedOral.registrationOpen,false);assert.ok(!eligibleSessions(ad,all).some(s=>s.id===closedOral.id));const b=body();b.selections=[{sessionId:closedOral.id,teacherId:ad.teachers[0].id}];assert.throws(()=>validateRequest(b),/pathways or region/);});
test('28-29 September and 1-2 October sessions are closed server-side as well as hidden',()=>{for(const id of ['LITERARY-ARTS-ABU-DHABI-20260928','DIGITAL-ARTS-ABU-DHABI-20260929','DIGITAL-ARTS-AL-AIN-20261001','ORAL-HISTORY-ABU-DHABI-20261001','PERFORMING-ARTS-ABU-DHABI-20261002']){const session=data.sessions.find(s=>s.id===id);assert.equal(session.registrationOpen,false);const school=session.region==='Al Ain'?data.schools.find(s=>s.region==='Al Ain'):ad;assert.ok(!eligibleSessions(school,all).some(s=>s.id===id));const b=body(school);b.selections=[{sessionId:id,teacherId:school.teachers[0].id}];assert.throws(()=>validateRequest(b),/pathways or region/);}});
test('Two different teachers cannot request the same workshop session',()=>{const b=body();b.selections.push({sessionId:b.selections[0].sessionId,teacherId:ad.teachers[1].id});assert.throws(()=>validateRequest(b),/Only one teacher/);});
test('Repeated identical session selection is rejected, not silently deduplicated',()=>{const b=body();b.selections.push({...b.selections[0]});assert.throws(()=>validateRequest(b),/Only one teacher/);});
test('Teacher/session pairs for a wrong region are rejected server-side',()=>{const b=body();b.selections=[{sessionId:data.sessions.find(s=>s.pathway==='Visual Arts'&&s.region==='Al Ain').id,teacherId:ad.teachers[0].id}];assert.throws(()=>validateRequest(b),/pathways or region/);});
test('Pathway acknowledgement is required',()=>{const b=body();b.pathwaysReviewed=false;assert.throws(()=>validateRequest(b),/review and verify/);});
test('Pending review is set by the server, not a client status flag',()=>{const b=body();b.status='Approved';assert.equal(validateRequest(b).payload.records[0].status,'Pending review');});
test('School selection is validated server-side',()=>{const b=body();b.schoolEsis='UNKNOWN';assert.throws(()=>validateRequest(b),/Choose a school/);});
test('Unknown teacher cannot be injected into the school roster',()=>{const b=body();b.selections[0].teacherId='T-unknown';assert.throws(()=>validateRequest(b),/select or add a teacher/);});
test('Verified coordinator comes from the master, not submitted contact overrides',()=>{const b=body();b.coordinator={action:'verified',nameEnglish:'Injected Name',workEmail:'injected@example.invalid'};assert.equal(validateRequest(b).payload.coordinator.nameEnglish,ad.coordinator.nameEnglish);});
test('Unverified coordinator confirmation is not promoted to Verified on file',()=>{const c=resolveCoordinator(unverified,{action:'confirm'});assert.equal(c.action,'Confirmed by school');assert.equal(c.verified,false);assert.equal(c.workEmail,unverified.coordinator.workEmail);});
test('Unverified coordinator cannot claim a verified-on-file action',()=>assert.throws(()=>resolveCoordinator(unverified,{action:'verified'}),/Confirm the listed coordinator/));
test('Changing a coordinator collects all eight fields',()=>{const c=resolveCoordinator(unverified,{action:'change',...newCoordinator});assert.equal(c.emiratesId,'784200000000000');assert.equal(c.action,'Change requested');});
test('New coordinator requires Arabic name and both emails',()=>{
 for(const field of ['nameArabic','primaryEmail','workEmail']){const c={action:'add',...newCoordinator};delete c[field];assert.throws(()=>resolveCoordinator(noCoordinator,c),/complete all required/);}
});
test('Coordinator Emirates ID format is validated',()=>assert.throws(()=>resolveCoordinator(noCoordinator,{action:'add',...newCoordinator,emiratesId:'123'}),/15-digit/));
test('A school with no teachers may add a teacher and submit a request',()=>{
 const school=data.schools.find(s=>!s.teachers.length);const b=body(school);b.addedTeachers=[newTeacher];b.selections=[{sessionId:eligibleSessions(school,all)[0].id,teacherId:newTeacher.id}];assert.equal(validateRequest(b).payload.records[0].registrationType,'Added Teacher');
});
test('Additional teacher form requires all six fields',()=>{
 for(const field of ['nameEnglish','nameArabic','esis','position','workEmail','mobile']){const b=body();b.addedTeachers=[{...newTeacher}];delete b.addedTeachers[0][field];b.selections[0].teacherId=newTeacher.id;assert.throws(()=>validateRequest(b),/complete all required/);}
});
test('Missing existing eSIS is requested rather than inventing an identifier',()=>{
 const school=data.schools.find(s=>s.teachers.some(t=>!t.esis));const teacher=school.teachers.find(t=>!t.esis);const b=body(school);b.selections[0].teacherId=teacher.id;
 assert.throws(()=>validateRequest(b),/missing eSIS/);b.teacherIdentifiers[teacher.id]='PASS-TEST-MISSING';assert.equal(validateRequest(b).payload.records[0].teacher.esis,'PASS-TEST-MISSING');
});
test('Idempotent input produces the same hash and request-record IDs',()=>{const b=body();const a=validateRequest(b),c=validateRequest(b);assert.equal(a.hash,c.hash);assert.equal(a.payload.records[0].id,c.payload.records[0].id);});
test('Changing a request changes its hash',()=>{const b=body();const a=validateRequest(b);b.language='ar';assert.notEqual(a.hash,validateRequest(b).hash);});
test('Same additional teacher is reused across multiple distinct sessions',()=>{const school=data.schools.find(s=>s.region==='Al Ain'&&s.coordinator.nameEnglish&&s.teachers.length);const b=body(school);const sessions=eligibleSessions(school,all).slice(0,2);b.addedTeachers=[newTeacher];b.selections=sessions.map(s=>({sessionId:s.id,teacherId:newTeacher.id}));assert.equal(validateRequest(b).payload.records.length,2);});
test('Duplicate additional teacher eSIS is rejected',()=>{const school=data.schools.find(s=>s.region==='Al Ain'&&s.coordinator.nameEnglish&&s.teachers.length);const b=body(school);const sessions=eligibleSessions(school,all).slice(0,2);b.addedTeachers=[newTeacher,{...newTeacher,id:'A-second'}];b.selections=sessions.map((s,i)=>({sessionId:s.id,teacherId:b.addedTeachers[i].id}));assert.throws(()=>validateRequest(b),/entered more than once/);});
test('A listed teacher may be reused for a different pathway session',()=>{
 const school=data.schools.find(s=>s.schoolEsis==='9163');
 const teacher=school.teachers.find(t=>t.esis==='PASS145868');
 const session=eligibleSessions(school,all).find(s=>s.pathway==='Visual Arts');
 const b=body(school);b.selections=[{sessionId:session.id,teacherId:teacher.id}];
 const record=validateRequest(b).payload.records[0];
 assert.equal(record.teacher.esis,'PASS145868');assert.equal(record.registrationType,'Listed Teacher');assert.equal(record.pathway,'Visual Arts');
});
test('Refreshed Sehar record includes Arabic name, designation and coordinator role data',()=>{
 const school=data.schools.find(s=>s.schoolEsis==='9163');const teacher=school.teachers.find(t=>t.esis==='PASS145868');
 assert.equal(teacher.nameEnglish,'Sehar Faisal Faisal Maqsood');assert.equal(teacher.nameArabic,'سحر فيصل فيصل مقصود');assert.equal(teacher.position,'Art Teacher');assert.ok(teacher.roles.includes('School Coordinator'));
 const pub=publicSchool(school);assert.equal(pub.teachers.find(t=>t.esis==='PASS145868').isCoordinator,true);
});
test('Coordinator matching prefers the exact coordinator record when normalized eSIS values collide',()=>{
 const school=data.schools.find(s=>s.schoolEsis==='9134');const pub=publicSchool(school);const flagged=pub.teachers.filter(t=>t.isCoordinator);
 assert.equal(flagged.length,1);assert.equal(flagged[0].nameEnglish,school.coordinator.nameEnglish);
});
test('A school-record teacher cannot be duplicated through the add-new flow',()=>{
 const school=data.schools.find(s=>s.teachers.some(t=>t.esis));const teacher=school.teachers.find(t=>t.esis);const b=body(school);
 b.addedTeachers=[{...newTeacher,esis:teacher.esis,nameEnglish:teacher.nameEnglish}];b.selections=[{sessionId:eligibleSessions(school,all)[0].id,teacherId:newTeacher.id}];
 assert.throws(()=>validateRequest(b),/already on the school record/);
});
test('Coordinator is available as a reusable school-record person when not already in the teacher roster',()=>{
 const school=data.schools.find(s=>s.coordinator.nameEnglish&&!s.teachers.some(t=>t.nameEnglish===s.coordinator.nameEnglish));
 const pub=publicSchool(school);const coord=pub.teachers.find(t=>t.isCoordinator);
 assert.ok(coord);assert.equal(coord.nameEnglish,school.coordinator.nameEnglish);assert.equal(JSON.stringify(coord).includes('workEmail'),false);
});
test('A verified coordinator cannot be replaced through a forged change action',()=>{
 assert.throws(()=>resolveCoordinator(ad,{action:'change',...newCoordinator}),/already has a verified coordinator/);
});
