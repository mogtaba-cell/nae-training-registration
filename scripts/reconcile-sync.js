'use strict';
// Manual administrator operation: finds successful Jotform writes whose response
// was lost. This script NEVER sends another Jotform POST and never emails anyone.
(async()=>{
  const store=require('../lib/store'),jf=require('../lib/jotform');
  const questions=await jf.questions(true),key=jf.byLabel(questions,'Portal Registration ID').qid;
  const records=await store.db('nae_training_requests?'+new URLSearchParams({sync_state:'in.(sending,needs_review)',select:'id'}));
  if(!records.length){console.log('No ambiguous writes need reconciliation.');return;}
  const found=new Map();const {formId}=jf.settings();
  for(let offset=0;;offset+=1000){
    const page=await jf.api('/form/'+formId+'/submissions?limit=1000&offset='+offset);
    if(!Array.isArray(page))throw new Error('Could not read Jotform submissions.');
    for(const submission of page){const ref=String(submission.answers?.[key]?.answer||'');if(!ref)continue;const a=found.get(ref)||[];a.push(String(submission.id));found.set(ref,a);}
    if(page.length<1000)break;
  }
  for(const row of records){
    const matches=found.get(row.id)||[];
    if(matches.length===1){await store.mark(row.id,'synced',matches[0]);console.log(row.id+': reconciled.');}
    else console.log(row.id+': '+matches.length+' matches. Left on hold for administrator review.');
  }
})().catch(()=>{console.error('Reconciliation failed. Check your private environment settings and service availability.');process.exitCode=1;});
