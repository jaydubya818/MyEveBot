import {readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {supervise} from './worker.mjs';

export function verifiedSource(cwd,expected){
 if(!/^[a-f0-9]{40}$/.test(expected??''))throw Error('SOURCE_PIN_REQUIRED');
 let actual;
 if(existsSync(`${cwd}/.git`)){actual=execFileSync('git',['rev-parse','HEAD'],{cwd,encoding:'utf8'}).trim();if(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd,encoding:'utf8'}).trim())throw Error('SOURCE_DIRTY');}
 else{
  const stamp=JSON.parse(readFileSync(`${cwd}/.fq-source.json`));
  if(!stamp.files||Object.keys(stamp.files).length===0)throw Error('SOURCE_CONTENT_REQUIRED');
  for(const [path,digest] of Object.entries(stamp.files)){
   if(path.includes('..')||path.startsWith('/')||createHash('sha256').update(readFileSync(`${cwd}/${path}`)).digest('hex')!==digest)throw Error('SOURCE_CONTENT_MISMATCH');
  }
  actual=stamp.sha;
 }
 if(actual!==expected)throw Error('SOURCE_PIN_MISMATCH');return actual;
}
export async function runWorker({component,cwd=process.cwd(),environment=process.env,request=fetch,localTest}){
 if(!['myeve','peer','relay'].includes(component))throw Error('WORKER_COMPONENT');
 const sha=verifiedSource(cwd,environment.FQ_SOURCE_SHA);
 const url=new URL(environment.FQ_CONTROLLER_URL??'');if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/')throw Error('CONTROLLER_HTTPS_REQUIRED');
 const token=environment.FQ_WORKER_TOKEN;if(!token||!environment.FQ_SESSION_ID)throw Error('WORKER_AUTH_REQUIRED');
 let lastHeartbeat=0;
 const heartbeat=async()=>{const response=await request(new URL('/heartbeat',url),{method:'POST',redirect:'error',signal:AbortSignal.timeout(3000),headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({session:environment.FQ_SESSION_ID,sha})});if(!response.ok)throw Error('HEARTBEAT_DENIED');const r=await response.json();if(r.session!==environment.FQ_SESSION_ID)throw Error('SESSION_MISMATCH');lastHeartbeat=Date.now();return r;};
 const allowed=['PATH','NODE_ENV','FQ_SESSION_ID','FQ_CONTROLLER_URL','FQ_OWNER_ID','FQ_SOURCE_SHA','MYEVE_QUALIFICATION_MODE','RELAY_QUALIFICATION_MODE','MYEVE_OWNER_ID','SOFIE_OWNER_ID','MYEVE_RELAY_ENABLED','MYEVE_RELAY_ORIGIN','MYEVE_RELAY_PUBLIC_KEY','MYEVE_RELAY_KEY_ID','FQ_RELAY_OWNER_EMAIL','FQ_RELAY_OWNER_PASSWORD','MYEVE_RELAY_ENCRYPTION_KEY','MYEVE_RELAY_ARTIFACT_PRIVATE_KEY','MYEVE_RELAY_ARTIFACT_ORIGIN','DATABASE_URL','DATABASE_URL_UNPOOLED','RELAY_DATABASE_URL'];
 if(localTest&&(environment.NODE_ENV!=='test'||url.hostname!=='127.0.0.1'))throw Error('LOCAL_TEST_ONLY');
 const childEnv=Object.fromEntries(allowed.filter(k=>environment[k]).map(k=>[k,environment[k]]));childEnv.FQ_COMPONENT_TOKEN=token;
 if(localTest){childEnv.NODE_EXTRA_CA_CERTS=localTest.ca;childEnv.FQ_LOCAL_SQL_PROXY=localTest.sqlProxy;}
 // Artifact assertion keys are purpose-scoped identity keys, not storage/provider keys.
 const command=component==='relay'?[process.execPath,'--import','tsx','scripts/qualification/relay-maintenance.ts']:[process.execPath,'--import','tsx','scripts/qualification/myeve-worker.ts'];
 if(localTest)command.splice(1,0,'--import',localTest.preload);
 const health=component==='relay'?null:createServer((req,res)=>{const healthy=req.url==='/health'&&Date.now()-lastHeartbeat<10000;res.writeHead(healthy?200:503,{'content-type':'application/json'});res.end(JSON.stringify({healthy,sha}));}).listen(Number(environment.PORT??8080),'0.0.0.0');
 try{return await supervise({command,cwd:component==='relay'?cwd:`${cwd}/apps/eve`,environment:childEnv,sourceSha:sha,heartbeat,lifetimeMs:3600000,...(localTest?.stdio?{stdio:localTest.stdio}:{})});}finally{health?.close();}
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 let runtime;
 try{
  verifiedSource(process.cwd(),process.env.FQ_SOURCE_SHA);
  if(process.env.FQ_COMPONENT==='relay')runtime=await (await import('./runtime.mjs')).startController();
  await runWorker({component:process.env.FQ_COMPONENT});
 }catch{console.error('Qualification supervisor stopped; startup or authority unavailable.');process.exitCode=1;}
 finally{await runtime?.close();}
}
