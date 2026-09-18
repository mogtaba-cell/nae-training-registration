'use strict';
const store=require('./store');
const jotform=require('./jotform');
async function sync(batchId=null) {
  // Configuration/mapping failures happen before claiming any record.
  const questions=await jotform.questions();
  await store.flagStale();
  const rows=await store.claim(batchId,batchId?9:15);
  const batches=new Map();let completed=0,held=0;
  async function worker() {
    while(rows.length) {
      const row=rows.shift();let submissionId=null;
      try {
        if(!batches.has(row.school_request_id)) batches.set(row.school_request_id,store.getBatch(row.school_request_id));
        const batch={...await batches.get(row.school_request_id),requestId:row.school_request_id};
        submissionId=await jotform.submit(batch,row.record,questions);
        await store.mark(row.id,'synced',submissionId); completed++;
      } catch(error) {
        // Never blindly repeat a POST that could have succeeded on Jotform.
        const uncertain=Boolean(submissionId||error.uncertain);
        await store.mark(row.id,uncertain?'needs_review':'pending',submissionId,
          uncertain?'Check Portal Registration ID in Jotform before retrying.':'Sync unavailable; request is safely stored.').catch(()=>{});
        held++;
      }
    }
  }
  await Promise.all([worker(),worker(),worker()]);
  return {completed,held};
}
module.exports={sync};
