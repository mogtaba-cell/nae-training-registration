const {getSchool,publicSchool,InputError,isLocalPreview}=require('../lib/domain');
const {method,requireSchoolAccess,errorResponse}=require('../lib/http');
const store=require('../lib/store');
module.exports=async(req,res)=>{
  if(!method(req,res,['GET']))return;
  try{
    const school=getSchool(req.query.esis);
    if(!school)throw new InputError('School not found.',404);
    const configured=store.configured();
    const status=configured?await store.submissionStatus(school.schoolEsis):{alreadySubmitted:null};
    if(status.alreadySubmitted){
      // Only public school identity and a boolean. No roster, coordinator,
      // receipt ID, selections or contact information for a submitted school.
      return res.status(200).json({schoolEsis:school.schoolEsis,schoolName:school.schoolName,schoolNameArabic:school.schoolNameArabic,region:school.region,
        alreadySubmitted:true,storageConfigured:configured,previewOnly:isLocalPreview()});
    }
    requireSchoolAccess(req,school.schoolEsis);
    res.status(200).json({...publicSchool(school),bookedSessionIds:[],...status,
      storageConfigured:configured,previewOnly:isLocalPreview()});
  }catch(error){errorResponse(res,error);}
};
