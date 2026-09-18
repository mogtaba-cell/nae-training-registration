'use strict';
// Local-only server: does not replace Vercel and never exposes data/ or .env files.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../public');
const handlers=Object.fromEntries(['schools','school','config','register','sync'].map(name=>[name,require('../api/'+name)]));
const maxBody=250000;
const server=http.createServer(async(req,res)=>{
  res.status=code=>{res.statusCode=code;return res;};
  res.json=value=>{res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(value));};
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
  try{
    const url=new URL(req.url,'http://localhost');req.query=Object.fromEntries(url.searchParams);
    if(url.pathname.startsWith('/api/')){
      const handler=handlers[url.pathname.slice(5)];if(!handler)return res.status(404).json({error:'Not found'});
      let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>maxBody)return res.status(413).json({error:'Request too large'});}
      req.body=raw||null;return await handler(req,res);
    }
    const target=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!target.startsWith(root+path.sep)||!fs.existsSync(target)||!fs.statSync(target).isFile()){res.statusCode=404;return res.end('Not found');}
    const type={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[path.extname(target)]||'application/octet-stream';
    res.setHeader('Content-Type',type);fs.createReadStream(target).pipe(res);
  }catch{if(!res.headersSent)res.status(500).json({error:'Local server error'});else res.end();}
});
server.listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log('Training portal: http://localhost:'+(process.env.PORT||3000)));
