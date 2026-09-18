'use strict';
// Run locally and distribute each code only to that school's authorized contact.
const fs=require('node:fs'),path=require('node:path');
const {data}=require('../lib/domain');const {schoolCode}=require('../lib/http');
if(!process.env.SCHOOL_ACCESS_SECRET || process.env.SCHOOL_ACCESS_SECRET.length<32){console.error('Set SCHOOL_ACCESS_SECRET to a random secret of at least 32 characters first.');process.exit(1);}
const csv=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
const rows=[['School ESIS','School Name','School access code'],...data.schools.map(s=>[s.schoolEsis,s.schoolName,schoolCode(s.schoolEsis)])];
const out=path.join(__dirname,'../data/access-codes.csv');fs.writeFileSync(out,rows.map(r=>r.map(csv).join(',')).join('\r\n'));
console.log('Created data/access-codes.csv. Keep this file private; it is excluded from deployment.');
