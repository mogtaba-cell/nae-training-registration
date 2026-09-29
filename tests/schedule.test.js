'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {data}=require('../lib/domain');
const expected={
  'ORAL-HISTORY-ABU-DHABI-20260924':'9:00 AM - 3:00 PM',
  'LITERARY-ARTS-ABU-DHABI-20260928':'9:00 AM - 3:30 PM',
  'DIGITAL-ARTS-ABU-DHABI-20260929':'9:00 AM - 3:00 PM',
  'DIGITAL-ARTS-AL-AIN-20261001':'9:00 AM - 3:00 PM',
  'ORAL-HISTORY-ABU-DHABI-20261001':'10:00 AM - 1:00 PM',
  'PERFORMING-ARTS-ABU-DHABI-20261002':'9:00 AM - 12:00 PM',
  'LITERARY-ARTS-AL-AIN-20261005':'9:00 AM - 3:30 PM',
  'VISUAL-ARTS-ABU-DHABI-20261006':'11:30 AM - 4:00 PM',
  'VISUAL-ARTS-AL-AIN-20261008':'9:00 AM - 2:00 PM'
};
const closedIds=[
  'ORAL-HISTORY-ABU-DHABI-20260924',
  'LITERARY-ARTS-ABU-DHABI-20260928',
  'DIGITAL-ARTS-ABU-DHABI-20260929'
];
test('published workshop session times match the September 22 schedule update',()=>{
  assert.equal(data.sessions.length,9);
  for(const [id,time] of Object.entries(expected)){
    const session=data.sessions.find(s=>s.id===id);
    assert.ok(session,`Missing session ${id}`);
    assert.equal(session.time,time,`${id} time`);
  }
});

test('24, 28 and 29 September sessions are retained for history but closed to new registration',()=>{
  for(const id of closedIds){
    const session=data.sessions.find(s=>s.id===id);
    assert.ok(session,`Missing ${id}`);
    assert.equal(session.registrationOpen,false,`${id} should be closed`);
  }
});

test('public config hides all closed September sessions',()=>{
  const handler=require('../api/config');
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.value=v;return this;}};
  handler({method:'GET'},res);
  assert.equal(res.statusCode,200);
  for(const id of closedIds) assert.ok(!res.value.sessions.some(s=>s.id===id),`${id} should be hidden`);
  assert.ok(res.value.sessions.some(s=>s.id==='DIGITAL-ARTS-AL-AIN-20261001'));
  assert.ok(res.value.sessions.some(s=>s.id==='ORAL-HISTORY-ABU-DHABI-20261001'));
});
