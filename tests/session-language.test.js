'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const D=require('../lib/domain');
const I=require('../public/i18n');
const JF=require('../lib/jotform');
const expectedActive={
  'LITERARY-ARTS-AL-AIN-20261005':'Arabic Only',
  'VISUAL-ARTS-ABU-DHABI-20261006':'Bilingual',
  'VISUAL-ARTS-AL-AIN-20261008':'Bilingual'
};
test('all active sessions have the published delivery language',()=>{
  const active=D.data.sessions.filter(s=>s.registrationOpen!==false);
  assert.equal(active.length,3);
  for(const s of active) assert.equal(s.sessionLanguage,expectedActive[s.id],s.id);
});
test('closed sessions remain excluded from active registration while retaining historical metadata',()=>{
  const expected={
    'ORAL-HISTORY-ABU-DHABI-20260924':'',
    'LITERARY-ARTS-ABU-DHABI-20260928':'Arabic Only',
    'DIGITAL-ARTS-ABU-DHABI-20260929':'Bilingual',
    'DIGITAL-ARTS-AL-AIN-20261001':'Bilingual',
    'ORAL-HISTORY-ABU-DHABI-20261001':'Arabic Only',
    'PERFORMING-ARTS-ABU-DHABI-20261002':'Arabic Only'
  };
  for(const [id,language] of Object.entries(expected)){const session=D.data.sessions.find(s=>s.id===id);assert.equal(session.registrationOpen,false);assert.equal(session.sessionLanguage||'',language);}
});
test('session language labels are bilingual',()=>{
  assert.equal(I.t('Language','ar'),'لغة الجلسة');
  assert.equal(I.t('Arabic Only','ar'),'العربية فقط');
  assert.equal(I.t('Bilingual','ar'),'ثنائية اللغة');
});
test('session language is visible in session selection and review UI',()=>{
  const app=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
  assert.match(app,/sessionLanguage/);
  assert.match(app,/h\('Language'\)/);
});
test('Jotform notes include session language without requiring a new question',()=>{
  const record={sessionLanguage:'Bilingual',teacher:{nameEnglish:'T',nameArabic:'ت',esis:'1',workEmail:'t@example.invalid',mobile:'0500000000',position:'Teacher',pathways:['Digital Arts']},registrationType:'Listed Teacher',pathway:'Digital Arts',region:'Abu Dhabi',date:'2026-09-29',time:'9:00 AM - 3:00 PM',venue:'',id:'REQ-X',sessionId:'DIGITAL-ARTS-ABU-DHABI-20260929'};
  const batch={schoolEsis:'1',schoolName:'School',schoolNameArabic:'مدرسة',schoolRegion:'Abu Dhabi',requestId:'id',originalPathways:['Digital Arts'],pathways:['Digital Arts'],coordinator:{nameEnglish:'C',nameArabic:'ج',workEmail:'c@example.invalid',mobile:'0500000000',action:'Verified on file',esis:'1',position:'Coordinator',emiratesId:'784000000000000',primaryEmail:'c@example.invalid'},acknowledgements:{onceOnly:true,emailConfirmation:true,language:'en',version:'v',statements:{onceOnly:'one',emailConfirmation:'two'}}};
  assert.match(JF.answers(batch,record).Notes,/Session language: Bilingual/);
  assert.equal(JF.requiredLabels.includes('Session Language'),false);
});
