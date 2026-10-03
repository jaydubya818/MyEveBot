// Operator/test infrastructure only. Never import this module into application code.
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../../../..');
const origin='https://sofie-cloud-qualification-824wbmd9r-jaydubya818.vercel.app';
const local='http://127.0.0.1:3097';
const bypass=process.env.SOFIE_QUALIFICATION_BYPASS;
const password=process.env.SOFIE_QUALIFICATION_PASSWORD;
delete process.env.SOFIE_QUALIFICATION_BYPASS;
delete process.env.SOFIE_QUALIFICATION_PASSWORD;
if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!=='jaydubya818/MyEveBot'||process.env.GITHUB_REF!=='refs/heads/codex/cloud-execution'||!bypass||!password)throw Error('ISOLATED_OPERATOR_CONFIGURATION_REQUIRED');
if(Object.keys(process.env).some(k=>/FACTORY.*(TOKEN|SECRET|BYPASS|OIDC)|VERCEL.*(TOKEN|SECRET)|DATABASE_URL|OPENAI_API_KEY|ANTHROPIC_API_KEY/i.test(k)))throw Error('FORBIDDEN_RUNNER_CREDENTIAL');
const trigger=JSON.parse(readFileSync(path.join(root,'.github/cloud-qualification-trigger.json'),'utf8'));
if(trigger.origin!==origin||trigger.paidModelOperations!==0||trigger.publication!=='DISABLED'||trigger.productionAdmission!=='DISABLED'||trigger.maxNewWork!==1||trigger.runAttempt!==process.env.GITHUB_RUN_ATTEMPT||process.env.GITHUB_RUN_ATTEMPT!=='1')throw Error('ONE_SHOT_QUALIFICATION_ENVELOPE_REQUIRED');
const secrets=[bypass,password,Buffer.from(bypass).toString('base64'),Buffer.from(password).toString('base64')];
const leaks=text=>secrets.some(s=>text.includes(s))||/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(text);
const dir=mkdtempSync(path.join(tmpdir(),'sofie-operator-'));
const credentialFile=path.join(dir,'owner.json');
writeFileSync(credentialFile,JSON.stringify({MYEVE_ACCESS_PASSWORD:password}),{mode:0o600});
let exposure=false;
const server=createServer(async(req,res)=>{
 try{
  const target=new URL(req.url??'',origin);
  if(!req.url?.startsWith('/')||req.url.startsWith('//')||target.origin!==origin)throw Error('PATH');
  const headers=new Headers();
  for(const [key,value] of Object.entries(req.headers))if(value&&!['host','connection','content-length','accept-encoding','x-vercel-protection-bypass','x-vercel-oidc-token','x-vercel-set-bypass-cookie'].includes(key))headers.set(key,Array.isArray(value)?value.join(','):value);
  if(headers.has('origin')){if(headers.get('origin')!==local)throw Error('ORIGIN');headers.set('origin',origin);}
  if(headers.has('referer'))headers.set('referer',headers.get('referer').replace(local,origin));
  headers.set('x-vercel-protection-bypass',bypass);
  let bytes=0;const chunks=[];
  for await(const chunk of req){bytes+=chunk.length;if(bytes>1000000)throw Error('BODY_BOUND');chunks.push(chunk);}
  const response=await fetch(target,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks),redirect:'manual',signal:AbortSignal.timeout(120000)});
  res.statusCode=response.status;
  for(const [key,value] of response.headers){
   if(['content-encoding','transfer-encoding','content-length','set-cookie'].includes(key))continue;
   if(value.includes(bypass)||value.includes(Buffer.from(bypass).toString('base64'))||key==='x-vercel-oidc-token'){exposure=true;throw Error('CREDENTIAL_RESPONSE');}
   res.setHeader(key,key==='location'?value.replace(origin,local):value);
  }
  const cookies=response.headers.getSetCookie().filter(c=>/^myeve_session=|^sofie_session=/.test(c));
  if(cookies.length)res.setHeader('set-cookie',cookies);
  const reader=response.body?.getReader();let tail='';
  while(reader){const {done,value}=await reader.read();if(done)break;const text=tail+Buffer.from(value).toString('utf8');if(text.includes(bypass)||text.includes(Buffer.from(bypass).toString('base64'))){exposure=true;throw Error('CREDENTIAL_RESPONSE');}tail=text.slice(-2048);res.write(value);}res.end();
 }catch{if(!res.headersSent)res.writeHead(502,{'content-type':'text/plain'});res.end('Qualification transport unavailable.');}
});
let child;
const cleanup=()=>{child?.kill('SIGTERM');server.closeAllConnections();server.close();rmSync(dir,{recursive:true,force:true});};
process.on('SIGTERM',()=>{cleanup();process.exit(1);});
process.on('SIGINT',()=>{cleanup();process.exit(1);});
try{
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3097,'127.0.0.1',resolve);});
 console.log(JSON.stringify({origin,runId:process.env.GITHUB_RUN_ID,runner:'GitHub-hosted Linux',factoryInfrastructureCredentials:0,localFactory:false,localVerifier:false,sofieLocal:false,paidModelOperations:0}));
 const childEnv={...process.env,MYEVE_CLOUD_P0:'approved-deterministic-staging',MYEVE_CLOUD_OWNER_CREDENTIAL_FILE:credentialFile};
 child=spawn(process.execPath,[path.join(root,'node_modules/@playwright/test/cli.js'),'test','--config','apps/eve/test/cloud/playwright.config.ts'],{cwd:root,env:childEnv,stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',b=>{output+=b;if(output.length>2000000)child.kill('SIGTERM');});child.stderr.on('data',b=>{output+=b;if(output.length>2000000)child.kill('SIGTERM');});
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});child=undefined;
 if(leaks(output))exposure=true;
 const scanner=spawn('python3',[path.join(import.meta.dirname,'scan-artifacts.py'),path.join(root,'output/playwright/cloud')],{stdio:['pipe','pipe','pipe'],env:process.env});
 scanner.stdin.end(JSON.stringify(secrets));let scan='';scanner.stdout.on('data',b=>scan+=b);scanner.stderr.on('data',()=>{});
 const scanCode=await new Promise((resolve,reject)=>{scanner.once('error',reject);scanner.once('close',resolve);});
 if(scanCode!==0||exposure){rmSync(path.join(root,'output/playwright/cloud'),{recursive:true,force:true});throw Error('CREDENTIAL_SCAN_FAILED_ARTIFACTS_REMOVED');}
 console.log(output);console.log(scan);
 if(!existsSync(path.join(root,'output/playwright/cloud/report.json')))throw Error('REPORT_MISSING');
 writeFileSync(path.join(root,'output/playwright/cloud/runner.json'),JSON.stringify({runId:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,trigger,runner:'GitHub-hosted Linux',platform:process.platform,factoryInfrastructureCredentials:0,producerOnRunner:false,verifierOnRunner:false,sofieLocal:false,browserProtectionCredential:0,artifactCredentialScan:'PASS',physicalMacPowerState:'NOT_OBSERVED'},null,2));
 writeFileSync(path.join(root,'output/playwright/cloud/scan-pass.json'),JSON.stringify({status:'PASS'}));
 process.exitCode=code===0?0:1;
}finally{cleanup();}
