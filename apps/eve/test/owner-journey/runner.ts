/** Offline browser integration: real app/session/tool/Work/database contracts,
 * deterministic model output and a synthetic signed Factory boundary.
 * This does not qualify a real producer, hidden verifier or deployment. */
import {createServer} from 'node:http';
import {existsSync} from 'node:fs';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir,copyFile,symlink} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {Env,files} from '../../lib/external-alpha/work-test-fixture.ts';
import {FakeFactory} from '../../lib/external-alpha/factory-test-fixture.ts';
import {buildSignedResult} from '../../lib/external-alpha/result-test-fixture.ts';
import {WorkAuthoritySigner,publicKeyId} from '../../lib/external-alpha/work-authority.ts';
import {externalAlphaFactoryPinSha256} from '../../lib/external-alpha/work-config.ts';
import {canonicalAlphaTasksWork} from '../../lib/external-alpha/work-tuple.ts';
import {digest} from '../../lib/engineering/contract.ts';
import {EXTERNAL_ALPHA_INSTRUCTIONS} from '../../lib/external-alpha/context.ts';
import {BetaIntegration} from '../../lib/beta-integration/runtime.ts';
import {CanonicalBetaWork} from '../../lib/beta-integration/canonical-work.ts';
import {hostedFactoryQueue} from '../../lib/engineering/deployment-mode.ts';
import {externalAlphaWorkEnabled} from '../../lib/external-alpha/work-config.ts';
import {runExternalAlphaReconciliation} from '../../lib/external-alpha/reconciliation.ts';

const root=resolve('../..');
if(process.env.MYEVE_EXTERNAL_ALPHA_TEST_DATABASE!=='postgresql://ux_fixture:local-only@localhost:55491/blocker_fixes')throw Error('Dedicated local fixture database required');
const e=await Env.create();
const key=generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'}) as string;
e.signer=new WorkAuthoritySigner(key);
const factory=new FakeFactory({myeveKeys:new Map([[e.signer.keyId,e.signer.publicKey]]),policy:e.policy,allowedFiles:files,now:()=>Date.now()});
const config=e.workConfig([{keyId:publicKeyId(factory.receiptKey.publicKey),publicKey:factory.receiptKey.publicKey.export({type:'spki',format:'pem'}) as string}]);
const isolated=await mkdtemp(join(tmpdir(),'myeve-owner-journey-'));
// Copy tracked current source, never .env or an existing build. Production source
// is not patched. The exact two provider substitutions are listed below.
const tracked=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
for(const file of tracked){
 if(file.split('/').some(part=>part.startsWith('.env'))||file.startsWith('output/')||!existsSync(join(root,file)))continue;
 await mkdir(dirname(join(isolated,file)),{recursive:true});await copyFile(join(root,file),join(isolated,file));
}
for(const file of ['gateway.ts']){await mkdir(join(isolated,'apps/eve/test/owner-journey'),{recursive:true});await copyFile(join(root,'apps/eve/test/owner-journey',file),join(isolated,'apps/eve/test/owner-journey',file));}
await symlink(join(root,'node_modules'),join(isolated,'node_modules'),'dir');
const app=join(isolated,'apps/eve');
await symlink(join(root,'apps/eve/node_modules'),join(app,'node_modules'),'dir');
const modelPath=join(app,'lib/external-alpha/model.ts');
const model=await readFile(modelPath,'utf8');
if(!model.includes('import { gateway } from "ai";'))throw Error('Provider seam changed; inspect before running');
await writeFile(modelPath,model.replace('import { gateway } from "ai";','import { gateway } from "../../test/owner-journey/gateway.ts";'));

// Local topology replaces only Vercel routing, not authentication or tool guards.
await writeFile(join(app,'next.config.ts'),`export default {serverExternalPackages:['@remotion/bundler','@remotion/renderer','heif2jpeg'],async rewrites(){return [{source:'/eve/:path*',destination:'http://127.0.0.1:3185/eve/:path*'}]}};\n`);
const database=new URL(process.env.MYEVE_EXTERNAL_ALPHA_TEST_DATABASE);database.pathname='/'+e.name;
let transport=await readFile(join(root,'apps/eve/test/owner-ux/local-transport.cjs'),'utf8');
transport=transport.replace("configured.pathname !== '/blocker_fixes'","!/^\\/ea_work_[a-f0-9]{32}$/.test(configured.pathname)");
transport=transport.replace("const u=new URL(typeof input==='string'?input:input.url??input);",`const u=new URL(typeof input==='string'?input:input.url??input);
  if(u.origin==='https://fixture-alpha-factory.vercel.app')return originalFetch('http://127.0.0.1:3184'+u.pathname+u.search,init);`);
await writeFile(join(app,'test/owner-journey/transport.cjs'),transport);
const claims={project_id:e.policy.projectId,owner_id:config.factory.trustedTeamId,environment:'production',exp:Math.floor(Date.now()/1000)+86400};
const env:NodeJS.ProcessEnv={PATH:process.env.PATH,HOME:process.env.HOME,USER:process.env.USER,TMPDIR:process.env.TMPDIR,
 MYEVE_TEST_DATABASE_URL:database.href,DATABASE_URL:database.href,
 OWNER_NAME:'Alex',NEXT_PUBLIC_OWNER_NAME:'Alex',NEXT_PUBLIC_AGENT_NAME:'Sofie',OWNER_TIMEZONE:'America/Los_Angeles',
 MYEVE_OWNER_ID:e.owner,MYEVE_ACCESS_PASSWORD:'synthetic-journey-owner',MYEVE_SESSION_SECRET:'synthetic-local-journey-session-key-123456',MYEVE_DURABLE_WEB_SESSIONS:'true',
 // Force authentication on the dev server. VERCEL_ENV=production prevents
 // this flag from enabling the separate local dogfood execution path.
 MYEVE_ENGINEERING_MODE:'dogfood',MYEVE_FACTORY_WORKER_ENABLED:'true',
 EVE_PROJECT_NAME:'myeve-alpha-tester-1',MYEVE_BETA_MODE:'private-alpha',MYEVE_ALPHA_REPOSITORY:e.policy.repository,MYEVE_ALPHA_MAX_WORK_USD:'1.30',MYEVE_ALPHA_MAX_WORK_SECONDS:'180',
 VERCEL:'1',VERCEL_ENV:'production',VERCEL_PROJECT_ID:e.policy.projectId,
 VERCEL_OIDC_TOKEN:'fixture.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.fixture',
 MYEVE_EXTERNAL_ALPHA_POLICY:JSON.stringify(e.policy),MYEVE_EXTERNAL_ALPHA_POLICY_SHA256:digest(e.policy),
 MYEVE_EXTERNAL_ALPHA_AUTHORITY_SIGNING_KEY:key,MYEVE_EXTERNAL_ALPHA_WORK_CONFIG:JSON.stringify(config),
 MYEVE_EXTERNAL_ALPHA_FACTORY_ORIGIN:config.factory.origin,MYEVE_EXTERNAL_ALPHA_FACTORY_PIN_SHA256:externalAlphaFactoryPinSha256(e.policy,config),
 MYEVE_EXTERNAL_ALPHA_FACTORY_TOKEN:'synthetic-factory-token',MYEVE_EXTERNAL_ALPHA_ACCOUNTING_DATABASE_URL:database.href,MYEVE_EXTERNAL_ALPHA_ACCOUNTING_TOKEN:'e'.repeat(64),
 NODE_OPTIONS:'--require='+join(app,'test/owner-journey/transport.cjs'),
};
let modelCalls=0;
if(hostedFactoryQueue(env)||!externalAlphaWorkEnabled(env))throw Error('Only the qualified synthetic external-alpha path may be enabled');
const contextSizes:number[]=[];
const usage={inputTokens:{total:0,noCache:0,cacheRead:0,cacheWrite:0},outputTokens:{total:0,text:0,reasoning:0}};
const fixture=createServer(async(req,res)=>{
 const send=(body:unknown,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
 try{
  const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));
  const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
  if(req.url==='/model'){
   if(!body.prompt.some((m:any)=>m.role==='system'&&m.content.includes(EXTERNAL_ALPHA_INSTRUCTIONS)))throw Error('Mandatory alpha policy missing');
   modelCalls++;
   contextSizes.push(Buffer.byteLength(JSON.stringify({prompt:body.prompt,tools:body.tools})));
   console.log('Offline model context bytes:',contextSizes.at(-1));
   const last=body.prompt.at(-1),user=JSON.stringify(body.prompt.findLast((m:any)=>m.role==='user')?.content??'');
   let content:any[],tool=false;
   if(last?.role==='tool'){
    const encoded=JSON.stringify(last.content);
    const value=last.content?.[0]?.output?.value;
    const result=value?.projection?value:value?.work??value;
    let reply=encoded.includes('STARTED')?'Your Work request is acknowledged. Open Work to follow its saved progress.':encoded.includes('retained')?'The private candidate and its proof are saved. Review Work for the verification and limitations.':'I created Add Priority to Alpha Tasks. Open Work and resume it when you are ready.';
    if(result?.projection){const p=result.projection;reply=`For ${p.title}, the recorded objective is: ${p.objective}. The saved result is ${p.nativeResult?.proof?.outcome??'not yet available'}. ${p.nativeResult?.proof?.limitations?.join(' ')??''}`;}
    content=[{type:'text',text:reply}];
   }else{
    const {rows}=await e.pool.query("SELECT id,version,generation FROM engineering_work WHERE scope_id=$1 AND scope_kind='personal' ORDER BY created_at LIMIT 1",[e.owner]);
    const work=rows[0];let name='engineering_work',input:unknown;
    if(!work)input={operation:'create',create:canonicalAlphaTasksWork(e.policy.repository,e.owner)};
    else if(/start this|continue this/i.test(user)){name='engineering_factory';input={operation:'start',expectedWorkVersion:work.version,expectedWorkGeneration:work.generation};}
    else if(/refresh|reconcile|check.*progress/i.test(user)){name='engineering_factory';input={operation:'reconcile',expectedWorkVersion:work.version,expectedWorkGeneration:work.generation};}
    else input={operation:'get',workId:work.id};
    if(!body.tools?.some((t:any)=>t.name===name))throw Error('Required canonical tool unavailable: '+name);
    content=[{type:'tool-call',toolCallId:randomUUID(),toolName:name,input:JSON.stringify(input)}];tool=true;
   }
   send({content,usage,warnings:[],finishReason:{unified:tool?'tool-calls':'stop',raw:tool?'tool_calls':'stop'},providerMetadata:{gateway:{cost:0}}});return;
  }
  if(req.url==='/fixture/status'){send({owner:e.owner,modelCalls,contextSizes,dispatches:factory.posts,executions:factory.consumed.size,workCount:await e.count('engineering_work'),authorities:await e.count('external_alpha_work_authority'),results:await e.count('external_alpha_work_result')});return;}
  // A real canonical decision fixture before admission. This is explicitly not
  // model-authored acceptance of a candidate or permission for publication.
  if(req.url==='/fixture/decision'){
   const {rows}=await e.pool.query("SELECT id FROM engineering_work WHERE scope_id=$1 AND scope_kind='personal'",[e.owner]);
   if(rows.length!==1)throw Error('One Work required');
   const beta=new BetaIntegration(e.pool,{repository:e.policy.repository,maxCostUsd:1.3,maxDurationSeconds:180});
   send(await new CanonicalBetaWork(beta).requestDecision(e.owner,rows[0].id,'Proceed with the requested Priority field?',['Continue with Low / Medium / High','Keep Work paused']));return;
  }
  if(req.url==='/fixture/complete'){
   const [entry]=factory.consumed.values();if(!entry)throw Error('No canonical dispatch');
   const work=await e.store.get(entry.workId);
   const {ExternalAlphaWorkAuthority}=await import('../../lib/external-alpha/work-authority.ts');
   const authority=await new ExternalAlphaWorkAuthority(e.db,e.policy,e.signer).forWork(work.id);
   if(!authority)throw Error('No retained authority');
   factory.resultPayload={result:buildSignedResult({authority,work,workOrderId:entry.workOrderId,keys:e.resultKeys,opts:{requestDigest:factory.requestDigest(entry.requestId)}}).signed};
   factory.state='COMPLETED';factory.quiescent=true;
   // Exercise the existing scheduled readback path, without granting another
   // chat/model dispatch while the shared Work reservation is still pending.
   const reconciliation=await runExternalAlphaReconciliation({env,database:e.db,factory,signer:e.signer});
   send({ready:true,reconciliation});return;
  }
  const base='/api/connect/v2/external-alpha/dispatches',challenge=String(req.headers['x-external-alpha-challenge']??'');
  if(req.headers.authorization!=='Bearer synthetic-factory-token')throw Error('Fixture credential mismatch');
  if(req.url===base&&req.method==='POST'){send(await factory.consume(body.authority,body.prepare,challenge));return;}
  const match=new RegExp('^'+base+'/([^/]+)(/result|/stop)?$').exec(req.url??'');
  if(match){const value=match[2]==='/result'?await factory.result(match[1],challenge):match[2]==='/stop'?await factory.stop(match[1],challenge):await factory.read(match[1],challenge);send(value,value?200:404);return;}
  send({error:'Unknown fixture endpoint'},404);
 }catch(error){console.error('Fixture request failed:',error instanceof Error?error.message:'unknown');send({error:'Fixture request failed'},500);}
});
await new Promise<void>(r=>fixture.listen(3184,'127.0.0.1',r));
const eve=spawn(process.execPath,[join(root,'node_modules/eve/bin/eve.js'),'dev','--no-ui','--port','3185'],{cwd:app,env,stdio:'inherit'});
const next=spawn(process.execPath,[join(root,'node_modules/next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port','3183'],{cwd:app,env,stdio:'inherit'});
console.log('Offline owner journey fixture started. Source copy:',isolated);
let closing=false;
async function stop(){if(closing)return;closing=true;next.kill('SIGTERM');eve.kill('SIGTERM');fixture.close();await e.close();}
process.on('SIGTERM',()=>void stop());process.on('SIGINT',()=>void stop());
