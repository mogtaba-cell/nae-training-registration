const {data,officialPathways,publicSession,isLocalPreview}=require('../lib/domain');
const store=require('../lib/store');
const {method}=require('../lib/http');
module.exports=(req,res)=>{
  if(!method(req,res,['GET']))return;
  res.status(200).json({version:2.1,submissionPolicy:'one_request_per_school',sessions:data.sessions.map(publicSession),officialPathways,
    requireAccessCode:Boolean(process.env.SCHOOL_ACCESS_SECRET),storageConfigured:store.configured(),previewOnly:isLocalPreview()});
};
