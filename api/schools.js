const {data}=require('../lib/domain');
const {method,errorResponse}=require('../lib/http');
const store=require('../lib/store');
module.exports=async(req,res)=>{
  if(!method(req,res,['GET']))return;
  try{
    // Names filter immediately in the browser. Status is fetched once here,
    // then checked again against the database when a school is selected.
    const submitted=store.configured()?new Set(await store.submittedSchoolIds()):null;
    res.status(200).json(data.schools.map(s=>({schoolEsis:s.schoolEsis,schoolName:s.schoolName,schoolNameArabic:s.schoolNameArabic,region:s.region,
      alreadySubmitted:submitted?submitted.has(s.schoolEsis.trim().toUpperCase()):null})));
  }catch(error){errorResponse(res,error);}
};
