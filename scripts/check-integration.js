'use strict';
// Read-only checks. Does not create test submissions, contacts or school requests.
(async()=>{
  const store=require('../lib/store'),jf=require('../lib/jotform');
  try{
    if(!store.configured())throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local first.');
    await store.db('nae_training_requests?select=id&limit=1');
    await store.db('nae_school_submission_locks?select=school_esis&limit=1');
    console.log('PASS: request storage and school-wide submission locks are reachable.');
    const q=await jf.questions(true);
    console.log('PASS: every required Jotform label is present.');
    for(const label of ['Request Status','Registration Type','School Registered Pathways','School Requested Pathways']){
      const f=jf.byLabel(q,label);console.log(label+': '+f.type+'; options: '+(f.options||'(no options returned)'));
    }
    console.log('Ready for a controlled end-to-end TEST request. Inspect Jotform Tables and the database after that test.');
  }catch(error){console.error('SETUP CHECK FAILED: '+(error.missingLabels?'Missing Jotform fields: '+error.missingLabels.join(', '):error.message));process.exitCode=1;}
})();
