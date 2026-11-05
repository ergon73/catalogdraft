const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const port=Number(process.env.PORT||8781);
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.csv':'text/csv','.svg':'image/svg+xml','.png':'image/png','.md':'text/plain'};
http.createServer((req,res)=>{
  let name;try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch(e){res.writeHead(400);return res.end();}
  const filename=path.resolve(root,'.'+(name==='/'?'/index.html':name));
  if(filename!==root&&!filename.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(filename,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found');}res.setHeader('Content-Type',(types[path.extname(filename)]||'application/octet-stream')+'; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(data);});
}).listen(port,'127.0.0.1',()=>console.log(`CatalogDraft: http://127.0.0.1:${port}`));
