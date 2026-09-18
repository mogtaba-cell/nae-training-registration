const {validateRequest,InputError,isLocalPreview}=require('../lib/domain');
const {method,bodyOf,assertSameOrigin,requireSchoolAccess,errorResponse}=require('../lib/http');
const store=require('../lib/store');
const {sync}=require('../lib/sync');
module.exports=async(req,res)=>{
  if(!method(req,res,['POST']))return;
  try {
    assertSameOrigin(req);
    if(isLocalPreview())throw new InputError('This is a local interface preview. No request has been submitted.',503,'PREVIEW_ONLY');
    const body=bodyOf(req);
    requireSchoolAccess(req,body?.schoolEsis);
    const request=validateRequest(body);
    // The database checks SAME-ID retries before its school-wide lock.
    // A pre-check here would incorrectly reject a safely retried saved request.
    const saved=await store.save(request);
    // Durable commit happens first; sync trouble cannot lose a school request.
    let syncResult={completed:0};
    try{syncResult=await sync(request.requestId);}catch{console.error('Jotform sync pending; request saved.');}
    res.status(saved.created?201:200).json({ok:true,requestId:request.requestId,requestCount:saved.count,
      status:'Pending review',jotformSync:syncResult.completed>=saved.count?'synced':'pending'});
  }catch(error){errorResponse(res,error);}
};
