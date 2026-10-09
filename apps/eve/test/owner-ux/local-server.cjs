const http = require('node:http');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const path = require('node:path');
// In-memory provider fixture, while registration, ownership and inventory use
// real application routes and isolated PostgreSQL. Never logs token/body data.
const objects = new Map();
const fixture = http.createServer(async (req,res) => {
  res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','*');res.setHeader('Access-Control-Allow-Methods','GET,PUT,DELETE,OPTIONS');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  const u=new URL(req.url,'http://localhost');
  const send=(code,body)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
  if(req.method==='DELETE'){objects.delete(u.searchParams.get('pathname'));send(200,{deleted:true});return;}
  if(req.method==='PUT'){
    const pathname=u.searchParams.get('pathname');
    if(!pathname || !/^(chat-files|artifacts)\//.test(pathname)){send(400,{error:{code:'bad_request',message:'Invalid fixture path'}});return;}
    if(objects.has(pathname)){send(409,{error:{code:'conflict',message:'Already exists'}});return;}
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const bytes=Buffer.concat(chunks),url='https://fixture.private.blob.vercel-storage.com/'+pathname;
    const metadata={url,downloadUrl:url+'?download=1',pathname,size:bytes.length,contentType:req.headers['x-content-type']||'application/octet-stream',contentDisposition:'inline',cacheControl:'private, no-store',uploadedAt:new Date().toISOString(),etag:'"fixture"'};
    objects.set(pathname,{bytes,metadata});send(200,metadata);return;
  }
  if(u.pathname==='/content'){
    const item=objects.get(u.searchParams.get('pathname'));
    if(!item){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'content-type':item.metadata.contentType,'content-length':item.bytes.length,'last-modified':item.metadata.uploadedAt,'etag':'"fixture"'});res.end(item.bytes);return;
  }
  if(u.searchParams.has('url')){
    const name=new URL(u.searchParams.get('url')).pathname.slice(1),item=objects.get(name);
    send(item?200:404,item?.metadata??{error:{code:'not_found',message:'Not found'}});return;
  }
  send(200,{ready:true});
});
fixture.listen(3174,'127.0.0.1');
const env={PATH:process.env.PATH,HOME:process.env.HOME,USER:process.env.USER,TMPDIR:process.env.TMPDIR,NODE_PATH:process.env.NODE_PATH,
  MYEVE_TEST_DATABASE_URL:process.env.MYEVE_TEST_DATABASE_URL,DATABASE_URL:process.env.MYEVE_TEST_DATABASE_URL,
  OWNER_NAME:'Alex',NEXT_PUBLIC_OWNER_NAME:'Alex',NEXT_PUBLIC_AGENT_NAME:'Sofie',MYEVE_OWNER_ID:'11111111-1111-4111-8111-111111111111',MYEVE_PARTNER_OWNER_ID:'22222222-2222-4222-8222-222222222222',MYEVE_ACCESS_PASSWORD:'synthetic-ux-owner-a',MYEVE_PARTNER_ACCESS_PASSWORD:'synthetic-ux-owner-b',MYEVE_SESSION_SECRET:'synthetic-ux-session-secret-local-only-123456',MYEVE_DURABLE_WEB_SESSIONS:'true',EVE_PROJECT_NAME:'myeve-alpha-tester-ux',MYEVE_BETA_MODE:'private-alpha',MYEVE_ALPHA_REPOSITORY:'synthetic/alpha-tasks',MYEVE_ALPHA_MAX_WORK_USD:'1.30',MYEVE_ALPHA_MAX_WORK_SECONDS:'180',OWNER_TIMEZONE:'America/Los_Angeles',
  VERCEL_BLOB_API_URL:'http://127.0.0.1:3174',NEXT_PUBLIC_VERCEL_BLOB_API_URL:'http://127.0.0.1:3174',
  BLOB_READ_WRITE_TOKEN:'vercel_blob_rw_fixture_'+randomBytes(24).toString('hex'),
  NODE_OPTIONS:'--require='+path.join(__dirname,'local-transport.cjs')};
const child=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port','3173'],{cwd:path.resolve(__dirname,'../..'),env,stdio:'inherit'});
function stop(){child.kill('SIGTERM');fixture.close();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);child.on('exit',()=>{fixture.close();process.exitCode=0;});
