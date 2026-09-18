const {method,requireAdmin,errorResponse}=require('../lib/http');
const {sync}=require('../lib/sync');
module.exports=async(req,res)=>{
  if(!method(req,res,['GET','POST']))return;
  try{requireAdmin(req);res.status(200).json({ok:true,...await sync()});}catch(error){errorResponse(res,error);}
};
