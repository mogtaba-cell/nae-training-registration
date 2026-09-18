'use strict';
const crypto=require('node:crypto');
const {InputError,txt}=require('./domain');
function errorResponse(res,error) {
  const status=error.status||503;
  // Do not log request bodies, emails, identity numbers, or third-party error text.
  if(status>=500) console.error('Portal operation failed:',error.code||'DEPENDENCY_UNAVAILABLE');
  return res.status(status).json({error:status<500?error.message:'The request service is temporarily unavailable. Your selection has been kept on this page. Please try again shortly.',code:error.code||'SERVICE_UNAVAILABLE'});
}
function method(req,res,allowed) {
  res.setHeader('Cache-Control','no-store');
  if(!allowed.includes(req.method)) {res.setHeader('Allow',allowed.join(', '));res.status(405).json({error:'Method not allowed.'});return false;} return true;
}
function bodyOf(req) {
  try { return typeof req.body==='string'?JSON.parse(req.body):req.body; }
  catch { throw new InputError('Invalid request body.'); }
}
function assertSameOrigin(req) {
  // Cross-site browser writes are not accepted. Non-browser clients still need
  // school access codes when the optional school gate is enabled.
  const origin=req.headers.origin;
  if(origin) {
    let host; try{host=new URL(origin).host;}catch{throw new InputError('Invalid origin.',403);}
    if(host!==req.headers.host) throw new InputError('Please submit from the registration portal.',403);
  }
  if(req.headers['sec-fetch-site']==='cross-site') throw new InputError('Please submit from the registration portal.',403);
}
function schoolCode(esis) {
  const secret=process.env.SCHOOL_ACCESS_SECRET;
  if(!secret) return '';
  return crypto.createHmac('sha256',secret).update(String(esis).toLowerCase()).digest('hex').slice(0,16).toUpperCase();
}
function requireSchoolAccess(req,esis) {
  if(!process.env.SCHOOL_ACCESS_SECRET) return;
  const actual=txt(req.headers['x-school-access-code'],100).replace(/[\s-]/g,'').toUpperCase();
  const expected=schoolCode(esis);
  if(Buffer.byteLength(actual)!==Buffer.byteLength(expected) || !crypto.timingSafeEqual(Buffer.from(actual),Buffer.from(expected))) throw new InputError('Enter the access code sent to your school.',403,'SCHOOL_ACCESS_REQUIRED');
}
function requireAdmin(req) {
  const expected=process.env.CRON_SECRET;
  const actual=String(req.headers.authorization||'');
  if(!expected || Buffer.byteLength(actual)!==Buffer.byteLength('Bearer '+expected) || !crypto.timingSafeEqual(Buffer.from(actual),Buffer.from('Bearer '+expected))) throw new InputError('Not authorized.',401);
}
module.exports={errorResponse,method,bodyOf,assertSameOrigin,schoolCode,requireSchoolAccess,requireAdmin};
