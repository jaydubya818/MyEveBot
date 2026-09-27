const fs=require('node:fs'),http=require('node:http'),crypto=require('node:crypto'),{spawn,execFileSync}=require('node:child_process');
const root='/Users/jaywest/.codex/worktrees/gap2b-qualification/Myeve',dir='/private/tmp/m1er1-90d668f';
const {Pool}=require(root+'/node_modules/pg');const fixture=JSON.parse(fs.readFileSync(dir+'/fixture.json'));const approval=JSON.parse(fs.readFileSync(dir+'/window-authority.json'));const preflight=JSON.parse(fs.readFileSync(dir+'/github-preflight.json'));
const pool=new Pool({connectionString:fixture.databaseURL});
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
if(approval.environment!=='isolated-dogfood'||approval.work.id!==fixture.workId||Date.parse(approval.expiresAt)<=Date.now())throw Error('Temporary qualification unavailable');
function current(){const active=JSON.parse(fs.readFileSync(dir+'/window-state.json'));return active.id===approval.id&&active.status==='ACTIVE'&&Date.parse(approval.expiresAt)>Date.now()&&digest(fs.readFileSync(dir+'/window-config.json'))===approval.runtimeConfigHash;}
fs.mkdirSync(dir+'/window-dispatches',{recursive:true});
const proxy=http.createServer(async(req,res)=>{let client;try{
 if(req.url==='/qualification-dispatch'&&req.method==='POST'){
  if(!current())throw Error('Temporary qualification expired or revoked');
  const rows=(await pool.query(`SELECT c.id,c.step_key,c.session_id,c.request_hash,c.purpose,c.reserved_microusd FROM engineering_work_model_calls c
   JOIN engineering_work_model_budget b USING(scope_id,scope_kind,work_id)
   JOIN engineering_work w ON w.id=b.work_id AND w.scope_id=b.scope_id AND w.scope_kind=b.scope_kind
   JOIN agents a ON a.id=b.agent_id AND a.owner_id=b.scope_id
   WHERE c.scope_id=$1 AND c.scope_kind='personal' AND c.work_id=$2 AND c.status='DISPATCHED'
    AND b.status='ACTIVE' AND b.deadline>clock_timestamp()
    AND b.spent_microusd+b.reserved_microusd+engineering_completion_remaining(b.scope_id,b.work_id)<=1300000
    AND b.calls_admitted<=10 AND a.max_steps=10
    AND NOT EXISTS(SELECT 1 FROM engineering_work_model_calls u WHERE u.work_id=b.work_id AND u.status='USAGE_UNKNOWN')
    AND w.version=2 AND w.generation=2 AND w.control='agent' AND w.lifecycle='active'
    AND a.updated_at::text=$3 AND a.is_primary AND a.status='active'`,[fixture.owner,fixture.workId,approval.agent.revision])).rows;
  if(rows.length!==1)throw Error('Exact durable common budget and identity binding required');
  const row=rows[0],filename=dir+'/window-dispatches/'+row.id+'.json';
  fs.writeFileSync(filename,JSON.stringify({qualificationId:approval.id,at:new Date().toISOString(),...row}),{flag:'wx'});
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({allowed:true}));return;
 }
 if(req.url!=='/sql'||req.method!=='POST')throw Error('Unknown local endpoint');
 const chunks=[];for await(const chunk of req)chunks.push(chunk);client=await pool.connect();const body=JSON.parse(Buffer.concat(chunks));if(body.queries)await client.query('BEGIN');const results=[];
 for(const q of body.queries??[body]){const r=await client.query({text:q.query,values:q.params,rowMode:'array',types:{getTypeParser:()=>x=>x}});results.push({fields:r.fields,rows:r.rows,command:r.command,rowCount:r.rowCount});}
 if(body.queries)await client.query('COMMIT');res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(body.queries?{results}:results[0]));
 }catch(error){if(client)await client.query('ROLLBACK');res.writeHead(403,{'content-type':'application/json'});res.end(JSON.stringify({message:error.message,code:error.code}));}finally{client?.release();}});
const preload=`import fs from 'node:fs';import crypto from 'node:crypto';
const original=globalThis.fetch;const dir=${JSON.stringify(dir)},allowedGitHub=${JSON.stringify(preflight.paths)};
globalThis.fetch=async(input,init)=>{const headers=new Headers(init?.headers),url=new URL(typeof input==='string'?input:input.url??input),method=init?.method??'GET';
if(headers.get('neon-connection-string')==='postgresql://fixture:isolated@ep-native.neon.tech/native_ui')return original('http://127.0.0.1:3107/sql',init);
if(['127.0.0.1','localhost'].includes(url.hostname))return original(input,init);
const state=JSON.parse(fs.readFileSync(dir+'/window-state.json')),authority=JSON.parse(fs.readFileSync(dir+'/window-authority.json'));
if(state.status!=='ACTIVE'||state.id!==authority.id||Date.now()>=Date.parse(authority.expiresAt))throw Error('Temporary qualification is unusable');
if(url.hostname==='api.github.com'&&method==='GET'&&allowedGitHub.includes(url.pathname))return original(input,init);
if(url.hostname==='ai-gateway.vercel.sh'&&method==='GET')return original(input,init);
if(url.href==='https://ai-gateway.vercel.sh/v4/ai/language-model'&&method==='POST'){
 if(headers.get('ai-language-model-id')!=='anthropic/claude-sonnet-5')throw Error('Unapproved model');
 const raw=String(init?.body??''),body=JSON.parse(raw);
 if(JSON.stringify(body.providerOptions?.gateway?.only)!==JSON.stringify(['anthropic'])||body.maxOutputTokens>2048||body.tools?.some(t=>t.name!=='engineering_direct')||Buffer.byteLength(JSON.stringify({prompt:body.prompt,tools:body.tools}))+4096>14336)throw Error('Payload exceeds approved provider/tool/input envelope');
 if(raw.includes('UNRELATED_PRIVATE_CANARY_8f329'))throw Error('Unapproved context');
 for(const value of [process.env.VERCEL_OIDC_TOKEN,process.env.MYEVE_ENGINEERING_GITHUB_TOKEN,process.env.MYEVE_SESSION_SECRET,process.env.MYEVE_ACCESS_PASSWORD])if(value&&raw.includes(value))throw Error('Credential in model payload');
 const admitted=await original('http://127.0.0.1:3107/qualification-dispatch',{method:'POST'});if(!admitted.ok)throw Error('Common budget or qualification denied dispatch');
 const hash=crypto.createHash('sha256').update(raw).digest('hex');fs.writeFileSync(dir+'/window-dispatches/payload-'+hash+'.json',raw);
 return original(input,{...init,redirect:'error'});
}
throw Error('External endpoint is outside this qualification');};`;
fs.writeFileSync(dir+'/window-preload.mjs',preload);
const oidcLine=fs.readFileSync('/private/tmp/myeve-native-live/.env.local','utf8').split('\n').find(l=>l.startsWith('VERCEL_OIDC_TOKEN='));let oidc=oidcLine.slice(oidcLine.indexOf('=')+1).trim();if(oidc.startsWith('"'))oidc=JSON.parse(oidc);const claims=JSON.parse(Buffer.from(oidc.split('.')[1],'base64url'));
if(claims.environment!=='development'||claims.exp*1000<=Date.now())throw Error('Valid development-only credential required');
const env={PATH:process.env.PATH,HOME:process.env.HOME,USER:process.env.USER,TMPDIR:process.env.TMPDIR,
 DATABASE_URL:'postgresql://fixture:isolated@ep-native.neon.tech/native_ui',MYEVE_OWNER_ID:fixture.owner,OWNER_NAME:'Fixture owner',NEXT_PUBLIC_OWNER_NAME:'Fixture owner',NEXT_PUBLIC_AGENT_NAME:'Sofie',
 MYEVE_ACCESS_PASSWORD:'[REDACTED_SYNTHETIC_PASSWORD]',MYEVE_SESSION_SECRET:crypto.randomBytes(32).toString('hex'),MYEVE_ENGINEERING_MODE:'dogfood',MYEVE_ENGINEERING_CONFIG:dir+'/window-config.json',
 VERCEL_OIDC_TOKEN:oidc,MYEVE_ENGINEERING_GITHUB_TOKEN:execFileSync('gh',['auth','token'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim(),NODE_OPTIONS:'--import='+dir+'/window-preload.mjs'};
proxy.listen(3107,'127.0.0.1');
const child=spawn(process.execPath,[root+'/node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','3108'],{cwd:root+'/apps/eve',env,stdio:'inherit'});
let stopping=false;function stop(){if(stopping)return;stopping=true;child.kill('SIGTERM');proxy.close();pool.end();}
const timeout=setTimeout(()=>{fs.writeFileSync(dir+'/window-state.json',JSON.stringify({id:approval.id,status:'EXPIRED',at:new Date().toISOString()}));stop();},Math.max(1,Date.parse(approval.expiresAt)-Date.now()));timeout.unref();
process.on('SIGTERM',stop);process.on('SIGINT',stop);child.on('exit',stop);
console.log('Bounded authenticated runtime started',approval.id,approval.expiresAt);
