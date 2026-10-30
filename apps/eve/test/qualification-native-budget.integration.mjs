/** Parent/native budget regression over the actual QualificationRoot, RuntimePorts, clients and PostgreSQL17 ledger.
 * Factory, coding, verifier and serving transports are synthetic. The test proves which native ceiling is dispatched,
 * not actual paid loss. No real provider, custody, deployment or tester is accessed. All fixture DBs/roles are disposed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash,generateKeyPairSync,sign} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {Client} from 'pg';
import {QualificationAccounting,qualificationBinding,QDEV_BASELINE} from '../lib/external-alpha/qualification-accounting.ts';
import {JOURNAL_SCHEMA} from '../lib/qualification/journal.ts';
import {QualificationRoot,registerQualificationHost} from '../lib/qualification/root.ts';
import {createRuntimeHostSource} from '../lib/qualification/host-source.ts';
import {assembleQualificationHost} from '../lib/qualification/host-bootstrap.ts';
import {runtimePortsProvider} from '../lib/qualification/runtime-ports.ts';
import {buildVerifierHandoff} from '../lib/qualification/verifier-handoff.ts';
import {bareSha256} from '../lib/qualification/delivery-observer.ts';
import {canonical as myappsCanonical} from '../../../packages/myapps/src/contracts.ts';
import {StaticArtifactCandidate} from '../../../packages/myapps/src/static-artifact.ts';
import {STATIC_BUILD_CLAIM_DOMAIN} from '../../../packages/myapps/src/static-build-claim.ts';
import {syntheticFactory,syntheticVerifier,verdictFor,h,digest,codec} from './qualification-synthetic.mjs';

const connection=process.env.MYEVE_ISOLATED_COHORT_TEST_DATABASE;
assert(connection,'Dedicated localhost PostgreSQL fixture URL required; never use DATABASE_URL');
const root=new URL(connection);
assert(['localhost','127.0.0.1'].includes(root.hostname)&&root.pathname==='/postgres','Dedicated localhost admin database required');
const hash=t=>createHash('sha256').update(t).digest('hex');
const suffix=randomBytes(6).toString('hex'),secret=randomBytes(24).toString('hex');
const admin=new Client({connectionString:connection});await admin.connect();
const clients=[],names=[],roles=[];
const sql=await readFile(new URL('../lib/external-alpha/qualification-accounting.sql',import.meta.url),'utf8');
async function connect(name,role){const u=new URL(root);u.pathname='/'+name;if(role){u.username=role;u.password=secret;}const c=new Client({connectionString:u.href});await c.connect();clients.push(c);return c;}
/** One disposable accounting DB + project parent for a fresh synthetic Factory identity. */
async function world(label){
 const factory=syntheticFactory(),verifier=syntheticVerifier();
 const project={...QDEV_BASELINE,operatingProfileSha256:h('1'),factoryVersionSha256:factory.factoryVersion,protectedSpecificationSha256:h('3'),
  sources:{myeve:'a'.repeat(40),factory:'b'.repeat(40),relay:'c'.repeat(40),missioncontrol:'d'.repeat(40)}};
 const binding=qualificationBinding(project);
 const name='myeve_qdev_p'+label+'_'+suffix,role='qdev_p'+label+'_'+suffix;names.push(name);roles.push(role);
 await admin.query("CREATE ROLE "+role+" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+secret+"'");
 await admin.query('CREATE DATABASE '+name);await admin.query('REVOKE CONNECT ON DATABASE '+name+' FROM PUBLIC');await admin.query('GRANT CONNECT ON DATABASE '+name+' TO '+role);
 const db=await connect(name);await db.query(sql);await db.query('GRANT EXECUTE ON FUNCTION qdev_cohort_call(jsonb) TO '+role);
 const cohort=randomUUID(),q1=randomUUID(),q2=randomUUID(),t1=randomBytes(32).toString('hex'),t2=randomBytes(32).toString('hex');
 const policy={Q1:{cohortId:cohort,ownerId:q1,slot:'Q1'},Q2:{cohortId:cohort,ownerId:q2,slot:'Q2'}};
 await db.query(`INSERT INTO qdev_charter(id,proposal_id,charter_sha256,funding_sha256,hold_disposition_sha256,price_revision_sha256,journey_ceiling_microusd,max_works,per_work_ceiling_microusd,concurrency,valid_until)
  VALUES($1,'qdev-20261029-01',$2,$2,$2,$2,5200000,4,1300000,1,clock_timestamp()+interval '1 hour')`,[cohort,h('4')]);
 await db.query(`INSERT INTO qdev_member(cohort_id,slot,owner_id,policy_sha256,credential_sha256,paid_works) VALUES($1,'Q1',$2,$3,$4,4),($1,'Q2',$5,$6,$7,0)`,[cohort,q1,digest(policy.Q1),hash(t1),q2,digest(policy.Q2),hash(t2)]);
 for(const owner of [q1,q2])await db.query('INSERT INTO qdev_project(id,cohort_id,owner_id,project_sha256,source_sha256) VALUES($1,$2,$3,$4,$5)',[randomUUID(),cohort,owner,binding.projectSha256,binding.sourceSha256]);
 await db.query('UPDATE qdev_charter SET activated_at=clock_timestamp() WHERE id=$1',[cohort]);
 const rt=await connect(name,role);
 return {factory,verifier,project,binding,db,rt,policy,cohort,t1};
}
const count=async(w,table)=>(await w.db.query('SELECT count(*)::int n FROM '+table)).rows[0].n;
const stage=(n,purposes,ceiling=1300000)=>({stage:n,workCeilingMicrousd:ceiling,operations:purposes.map((p,i)=>({key:`s${n}-${i}`,purpose:p,reserveMicrousd:Math.floor(ceiling/purposes.length/2)}))});
const plan=()=>({slot:'Q1',stages:[stage(1,['SOFIE','CODING']),stage(2,['CODING']),stage(3,['FACTORY']),stage(4,['VERIFIER'])]});
const grantFor=()=>({connectionId:'synthetic-connection',repository:QDEV_BASELINE.repository,baseCommit:QDEV_BASELINE.inputCommit,outputBranch:QDEV_BASELINE.outputBranch,
 permissions:{metadata:'read',contents:'write',actions:'read',deployments:'read'},repositoryAdmin:false,workflowEdit:false,productionDeployment:false});
const APPROVED='Run the approved dashboard qualification';
const CRED='verifier-credential-'+randomBytes(12).toString('hex');
const DEADLINE='2099-01-01T00:00:00.000Z';
const sha=b=>createHash('sha256').update(b).digest('hex');
const files={'dist/index.html':Buffer.from('<html><script src="/app.js"></script></html>'),'dist/app.js':Buffer.from('console.log("synthetic dashboard")')};
const policyKey=async()=>{const p=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);return {keyId:'original-receiver',jwk:await crypto.subtle.exportKey('jwk',p.privateKey)};};

/** The synthetic Factory chain (UUID request ids so the real LiveFactoryAdapter readback schema applies) plus every mocked transport and its call log. */
async function harness(w,{verdictMode='valid',nativeMaxSpendUsd=1.35}={}){
 const fx=w.factory,ids={1:randomUUID(),2:randomUUID(),3:randomUUID()};
 const base={commit:QDEV_BASELINE.inputCommit,tree:QDEV_BASELINE.inputTree};
 const mk=(n,input)=>fx.stage(n,input,{mutate:m=>{m.execution.requestId=ids[n];
  m.operationId=codec.digest([codec.RESULT_PROTOCOL,fx.factoryId,ids[n],m.execution.workOrderId,m.execution.runId]);}});
 const s1=mk(1,base),s2=mk(2,s1.candidate),s3=mk(3,s2.candidate);
 const starts={1:base,2:s1.candidate,3:s2.candidate},results={1:s1,2:s2,3:s3};
 const adm={},byRequest=new Map(),byWorkOrder=new Map();
 for(const n of [1,2,3]){
  const e=results[n].manifest.execution,workId=randomUUID(),start=starts[n];
  const raw={workId,workVersion:1,workGeneration:1,criteriaVersion:1,agentId:'synthetic-agent',factoryId:fx.factoryId,factoryVersion:fx.factoryVersion,requestId:e.requestId,requestDigest:e.requestDigest,
   sourceDigest:fx.sourceDigest,configurationDigest:fx.configurationDigest,workOrderId:e.workOrderId,runId:e.runId,attemptNumber:1,inputCommit:start.commit,inputTree:start.tree,localSnapshotVersion:4,configuration:fx.configuration};
  const request={requestId:e.requestId,workId,workGeneration:1,repository:QDEV_BASELINE.repository,deadline:DEADLINE,maxSpendUsd:n===3?nativeMaxSpendUsd:(n===1?0.325:0.65),
   input:{title:'Dashboard',description:'Synthetic dashboard',kind:'feature',acceptanceCriteria:['Tests pass'],checkCommands:fx.configuration.commands,allowedPaths:fx.configuration.allowedPaths,
    baseRef:start.commit,repositoryPath:'/synthetic',workerProfile:'mac'}};
  const identity={runId:randomUUID(),writerGeneration:1,dispatchIdentity:'d'+n,workId,workGeneration:1,factoryId:fx.factoryId,factoryVersion:fx.factoryVersion,requestId:e.requestId,
   workOrderId:e.workOrderId,remoteRunId:e.runId,repository:request.repository,baseSha:start.commit,allowedPaths:request.input.allowedPaths,deadline:DEADLINE};
  const spend={status:'KNOWN',currency:'USD',unit:'microUSD',workId,workGeneration:1,requestId:e.requestId,workOrderId:e.workOrderId,deadline:DEADLINE,ceilingMicrousd:Math.floor(request.maxSpendUsd*1_000_000),
   settledMicrousd:0,retainedMicrousd:0,availableMicrousd:Math.floor(request.maxSpendUsd*1_000_000),cancelled:false,operations:[]};
  adm[n]={n,e,raw,request,identity,spend,signed:results[n].signed};byRequest.set(e.requestId,adm[n]);byWorkOrder.set(e.workOrderId,adm[n]);
 }
 const readback=(a,over={})=>({requestId:a.e.requestId,workOrderId:a.e.workOrderId,runId:a.e.runId,snapshot:null,identity:a.identity,state:'RUNNING',quiescent:false,evidenceRef:null,spend:a.spend,blocker:null,...over});
 const log={capability:[],factory:[],served:[],agent:[],verifier:[]};
 const conn={origin:'http://127.0.0.1:12345',token:'c'.repeat(64),factoryId:fx.factoryId,sourceDigest:fx.sourceDigest,configurationDigest:fx.configurationDigest,factoryVersion:fx.factoryVersion,
  repositoryPath:'/synthetic',keys:[fx.key],spendContract:{version:'WORK_LEDGER_V1',sourceDigest:fx.sourceDigest},
  qualification:{scopeId:'synthetic-owner',profileHash:'e'.repeat(64),evidenceRef:'synthetic',qualifiedAt:'2026-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z',mode:'LOCAL_FIXTURE',spendEnforced:true}};
 const fbinding={ownerId:'synthetic-owner',organizationId:'org',installationId:'install',agentId:'agent',clientId:'client',backendId:'backend',incarnation:'epoch',enrollmentVersion:1,missionId:'mission',
  factoryId:conn.factoryId,factoryVersion:conn.factoryVersion,sourceDigest:conn.sourceDigest,configurationDigest:conn.configurationDigest};
 const capabilityFetch=async(url,init)=>{
  const u=new URL(url);log.capability.push(u.pathname);
  if(u.pathname!=='/api/capability-admission/readback')return new Response('{}',{status:500});     // challenge/prepare/control are never needed: admission is retained
  const a=byRequest.get(JSON.parse(init.body).request?.requestId);
  return a?Response.json(readback(a,{snapshot:a.e,identity:null,state:'PREPARED'})):new Response('{}',{status:404});
 };
 const reads=new Map();
 const factoryFetch=async(url,init)=>{
  const p=new URL(url).pathname,m=init?.method??'GET';log.factory.push(m+' '+p.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g,'<id>'));
  let x;
  if(m==='POST'&&(x=/\/dispatches\/([^/]+)\/dispatch$/.exec(p)))return Response.json(readback(byRequest.get(x[1])));
  if(m==='GET'&&(x=/\/dispatches\/([^/]+)$/.exec(p))){const a=byRequest.get(x[1]),n=(reads.get(x[1])??0)+1;reads.set(x[1],n);
   return Response.json(n<2?readback(a):readback(a,{state:'COMPLETED',quiescent:true,evidenceRef:'evidence-stage-'+a.n,spend:{...a.spend,settledMicrousd:0,availableMicrousd:a.spend.ceilingMicrousd}}));}
  if(m==='GET'&&(x=/\/work-orders\/([^/]+)\/runs\/([^/]+)\/result$/.exec(p)))return Response.json({state:'COMPLETED',result:byWorkOrder.get(x[1]).signed});
  return new Response('{}',{status:404});
 };
 // MyApps: the retained static build for the accepted stage-3 candidate, its signed claim, and the served files
 const cand=s3.candidate,e3=adm[3].e;
 const inventory={schema:'myeve.dashboard.build-inventory/v1',scope:'BROWSER_BUILD_ONLY',sourceCommit:cand.commit,sourceTree:cand.tree,lockSha256:h('a'),node:'v24.0.0',
  files:Object.entries(files).map(([path,b])=>({path,bytes:b.length,sha256:sha(b)})),independentVerification:'NOT_ESTABLISHED',signedResult:false,releaseQualified:false};
 const pins={sourceCommit:cand.commit,sourceTree:cand.tree,lockSha256:h('a')};
 const load=async p=>{const b=files[p];if(!b)throw new Error('missing');return b;};
 const retained=await StaticArtifactCandidate.retain(inventory,pins,load);
 const pair=generateKeyPairSync('ed25519');
 const issuer={keyId:'synthetic-build-key',purpose:'STATIC_BUILD_PROVENANCE_V1',ownerId:'synthetic-owner',factoryId:fx.factoryId,factoryVersion:fx.factoryVersion,buildProfileDigest:h('c'),
  publicKeyPem:pair.publicKey.export({type:'spki',format:'pem'}).toString(),spkiSha256:sha(pair.publicKey.export({type:'spki',format:'der'})),notBefore:'2020-01-01T00:00:00.000Z',notAfter:'2099-01-01T00:00:00.000Z',revoked:false};
 const bind={ownerId:'synthetic-owner',agentId:'synthetic-agent',appId:'synthetic-app',workId:adm[3].raw.workId,workVersion:1,workGeneration:1,requestId:e3.requestId,runId:e3.runId,
  factoryId:fx.factoryId,factoryVersion:fx.factoryVersion,sourceDigest:fx.sourceDigest,configurationDigest:fx.configurationDigest,inputCommit:s2.candidate.commit,inputTree:s2.candidate.tree,
  candidateCommit:cand.commit,candidateTree:cand.tree,lockSha256:h('a'),buildProfileDigest:h('c'),deadline:DEADLINE};
 const payload={schema:'myeve.static-build-claim/v1',keyId:issuer.keyId,binding:bind,inventoryDigest:retained.inventoryDigest,artifactDigest:retained.artifactDigest,builtAt:'2026-10-29T00:00:00.000Z'};
 const claim=myappsCanonical({payload,signature:sign(null,Buffer.from(STATIC_BUILD_CLAIM_DOMAIN+myappsCanonical(payload)),pair.privateKey).toString('base64url')});
 const buildArtifactSha256=bareSha256(retained.artifactDigest);
 // The disposable loopback verifier: validates the handoff, then serves a signed verdict for the exact candidate (or a deliberately bad one)
 const expectedHandoff=buildVerifierHandoff({project:w.project,binding:w.binding,candidate:{commit:cand.commit,tree:cand.tree,buildArtifactSha256}});
 const verdictBody=c=>{
  const exp={projectSha256:w.binding.projectSha256,sourceSha256:w.binding.sourceSha256,protectedSpecificationSha256:w.project.protectedSpecificationSha256,
   candidateCommit:c.commit,candidateTree:c.tree,buildArtifactSha256:c.buildArtifactSha256};
  if(verdictMode==='wrongCandidate')return w.verifier.signVerdict(verdictFor({...exp,candidateCommit:'9'.repeat(40)}));
  if(verdictMode==='producerSigned'){const v=verdictFor(exp);return {verdict:v,signatureBase64:sign(null,Buffer.from(codec.canonical(v)),fx.pair.privateKey).toString('base64')};}
  if(verdictMode==='buildSigned'){const v={...verdictFor(exp),verifierKeyId:issuer.keyId};return {verdict:v,signatureBase64:sign(null,Buffer.from(codec.canonical(v)),pair.privateKey).toString('base64')};}
  return w.verifier.signVerdict(verdictFor(exp));
 };
 const server=createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{
  const parsed=body?JSON.parse(body):null;log.verifier.push({url:req.url,authorization:req.headers.authorization,body:parsed});
  const json=req.url==='/qdev/v1/handoff'?{accepted:true,handoffSha256:parsed.handoffSha256}:req.url==='/qdev/v1/verdict'?verdictBody(parsed.candidate):{};
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(json));});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const verifierOrigin='http://127.0.0.1:'+server.address().port;
 // The agent execution port: only the host-owned executor record carries the Result binding (stages 1-2); the task's relay is the grant-checked tool set
 const tasks=new Map();
 const agentPort={available:()=>true,
  async start(task){const tools=(await task.relay.discover()).map(t=>t.name);log.agent.push({stage:task.stage,key:task.key,purpose:task.purpose,slot:task.slot,ownerId:task.ownerId,tools,projectSha256:task.projectSha256});
   const handle='h-'+task.key;tasks.set(handle,task);return {handle};},
  async record(handle){const t=tasks.get(handle),e=t.purpose==='CODING'&&t.stage<=2?fx.expectedByStage[t.stage]:null;
   return {source:'EXECUTOR_RECORD',taskKey:t.key,ownerId:t.ownerId,projectSha256:t.projectSha256,usageFinal:true,...(e?{execution:{requestId:e.requestId,workOrderId:e.workOrderId,runId:e.runId}}:{})};}};
 const capabilityKey=await policyKey();
 const custody=(over={})=>({
  agent:{slot:'Q1',port:agentPort},
  factory:{connection:conn,capability:{origin:conn.origin,binding:fbinding,key:capabilityKey,headers:async()=>({}),
    sourcePermit:async()=>{throw Error('UNEXPECTED_ISSUANCE')},relayPermit:async()=>{throw Error('UNEXPECTED_ISSUANCE')}},
   retained:async n=>({binding:adm[n].raw,identity:adm[n].identity,request:adm[n].request}),factoryFetch,capabilityFetch,settleTimeoutMs:5000,pollMs:5},
  verifier:{origin:verifierOrigin,credentialName:'QDEV_VERIFIER_CREDENTIAL',keys:verdictMode==='buildSigned'?[{keyId:issuer.keyId,publicKeyPem:issuer.publicKeyPem,activeFrom:issuer.notBefore,notAfter:issuer.notAfter}]:[w.verifier.key],producerKeyIds:[fx.key.keyId],producerPublicKeysPem:[fx.producerPem]},
  myapps:{source:async c=>({inventory,claim,load,lockSha256:h('a'),binding:bind,issuer}),
   delivery:{enabled:true,environment:'myeve-qdev-20261029',servedOrigin:'https://dashboard.example.test',projectSha256:w.binding.projectSha256,sourceSha256:w.binding.sourceSha256,
    priorRevision:async()=>({kind:'ABSENT',authenticationSha256:h('5')}),restorePointId:async()=>'rp-1',now:()=>new Date(),
    fetcher:async url=>{const p=new URL(url).pathname;log.served.push(p);const b=files['dist'+p];return b?new Response(b):new Response('',{status:404});}}},
  expectedFor:n=>fx.expectedByStage[n],resultKeys:[fx.key],sourceDigest:fx.sourceDigest,newAllowanceId:()=>randomUUID(),...over});
 return {custody,log,expectedHandoff,candidate:{commit:cand.commit,tree:cand.tree,buildArtifactSha256},stop:()=>new Promise(r=>{server.close(r);server.closeAllConnections?.();})};
}

/** Loader + bundle for a world. Credentials are referenced by NAME; the verifier credential is read only through the runtime accessor. */
function runtime(w,provider,{verifierCredential=true}={}){
 const bundle={version:1,ownerId:w.policy.Q1.ownerId,notAfter:new Date(Date.now()+3600e3).toISOString(),policy:w.policy.Q1,project:w.project,plan:plan(),
  credentials:{accounting:'QDEV_ACCOUNTING_CREDENTIAL',relay:'QDEV_RELAY_CREDENTIAL',accountingDatabaseUrl:'QDEV_ACCOUNTING_DATABASE_URL',journalDatabaseUrl:'QDEV_JOURNAL_DATABASE_URL'},
  relay:{origin:'https://relay.example.test',grant:grantFor()},conversation:{approvedRequest:APPROVED,deliveryUrl:'https://dashboard.example.test/app'}};
 const env={MYEVE_QDEV_ENABLED:'true',MYEVE_QDEV_HOST_BUNDLE:JSON.stringify(bundle),QDEV_ACCOUNTING_CREDENTIAL:w.t1,QDEV_RELAY_CREDENTIAL:'relay-secret-'+randomBytes(8).toString('hex'),
  QDEV_ACCOUNTING_DATABASE_URL:'postgres://accounting.invalid/a',QDEV_JOURNAL_DATABASE_URL:'postgres://journal.invalid/j'};
 if(verifierCredential)env.QDEV_VERIFIER_CREDENTIAL=CRED;
 const fetcher=async(url,init)=>{const body=JSON.parse(init.body);
  const result=body.method==='initialize'?{protocolVersion:'2024-11-05'}:{tools:[{name:'relay_github_repo_get'},{name:'relay_github_deploy_prod'}]};
  return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,result}),{status:200});};
 const source=createRuntimeHostSource({env,fetcher,database:url=>url.includes('accounting')?{query:async(q,p)=>(await w.rt.query(q,p)).rows}:{query:async(q,p)=>(await w.db.query(q,p)).rows},ports:provider});
 return {env,source,host:assembleQualificationHost(source),owner:w.policy.Q1.ownerId};
}

try {
 for (const [label,nativeMaxSpendUsd] of [['charter',1.35],['reserve',0.7],['fits',0.65]]) await test('native Factory ceiling cannot exceed parent '+label, async () => {
  const w=await world(label),hn=await harness(w,{nativeMaxSpendUsd});
  try {
   await w.db.query(JOURNAL_SCHEMA);
   const r=runtime(w,runtimePortsProvider(()=>hn.custody()));
   const out=await new QualificationRoot(r.host).run({ownerId:r.owner,kind:'human'});
   const ledger=(await w.db.query("SELECT reserve_microusd,state FROM qdev_dispatch WHERE purpose='FACTORY'")).rows;
   const dispatches=hn.log.factory.filter(c=>/POST .*\/dispatch$/.test(c)).length;
   console.log(JSON.stringify({status:out.status,stage:out.stage,code:out.code,ledger,nativeCeilingMicrousd:Math.floor(nativeMaxSpendUsd*1_000_000),dispatches}));
   if(label==='fits'){assert.equal(dispatches,1);assert.equal(out.status,'COMPLETED_UNCLAIMED');}
   else {assert.equal(dispatches,0,'Native ceiling must fit the $0.65 charged reservation and $1.30 Work charter');assert.notEqual(out.status,'COMPLETED_UNCLAIMED');}
  } finally {await hn.stop();}
 });
} finally {
 await Promise.all(clients.map(c=>c.end()));
 for(const name of names) await admin.query('DROP DATABASE IF EXISTS '+name+' WITH (FORCE)');
 for(const role of roles) await admin.query('DROP ROLE IF EXISTS '+role);
 await admin.end();
}
