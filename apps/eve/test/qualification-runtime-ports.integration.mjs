/** Positive actual-agent/root composition: the REAL loader (`createRuntimeHostSource` + `runtimePortsProvider`) over the REAL composed adapters
 * (DeepAgentAdapter, LiveFactoryPort over buildOrderedFactoryClients, HttpVerifierPort, StaticBuildMyAppsPort), disposable PostgreSQL, a fake Relay,
 * a disposable loopback verifier and mocked Factory/capability/served-file transports. Synthetic only: no real owner, model, Factory, verifier,
 * repository, deployment or spend. The Factory side is mocked at the HTTP boundary (the actual MyFactory receiver is covered by
 * qualification-factory-real-receiver.test.mjs).
 * Run: MYEVE_ISOLATED_COHORT_TEST_DATABASE=postgres://postgres@127.0.0.1:PORT/postgres node --import tsx --test apps/eve/test/qualification-runtime-ports.integration.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash,generateKeyPairSync,sign} from 'node:crypto';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {StaticReleaseController} from '../lib/qualification/static-publish.ts';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {productionRuntimePorts} from '../lib/qualification/custody-loader.ts';
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
async function harness(w,{verdictMode='valid'}={}){
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
  const request={requestId:e.requestId,workId,workGeneration:1,repository:QDEV_BASELINE.repository,deadline:DEADLINE,maxSpendUsd:n===1?0.325:0.65,
   input:{title:'Dashboard',description:'Synthetic dashboard',kind:'feature',acceptanceCriteria:['Tests pass'],checkCommands:fx.configuration.commands,allowedPaths:fx.configuration.allowedPaths,
    baseRef:start.commit,repositoryPath:'/synthetic',workerProfile:'mac'}};
  const identity={runId:randomUUID(),writerGeneration:1,dispatchIdentity:'d'+n,workId,workGeneration:1,factoryId:fx.factoryId,factoryVersion:fx.factoryVersion,requestId:e.requestId,
   workOrderId:e.workOrderId,remoteRunId:e.runId,repository:request.repository,baseSha:start.commit,allowedPaths:request.input.allowedPaths,deadline:DEADLINE};
  const spend={status:'KNOWN',currency:'USD',unit:'microUSD',workId,workGeneration:1,requestId:e.requestId,workOrderId:e.workOrderId,deadline:DEADLINE,ceilingMicrousd:Math.floor(request.maxSpendUsd*1_000_000),
   settledMicrousd:0,retainedMicrousd:0,availableMicrousd:Math.floor(request.maxSpendUsd*1_000_000),cancelled:false,operations:[]};
  adm[n]={n,e,raw,request,identity,spend,signed:results[n].signed};byRequest.set(e.requestId,adm[n]);byWorkOrder.set(e.workOrderId,adm[n]);
 }
 const readback=(a,over={})=>({requestId:a.e.requestId,workOrderId:a.e.workOrderId,runId:a.e.runId,snapshot:null,identity:a.identity,state:'RUNNING',quiescent:false,evidenceRef:null,spend:a.spend,blocker:null,...over});
 const log={capability:[],factory:[],served:[],agent:[],verifier:[],verifierLedger:[],staged:[]};
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
   return Response.json(n<2?readback(a):readback(a,{state:'COMPLETED',quiescent:true,evidenceRef:'evidence-stage-'+a.n}));}
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
 let lastHandoff=null;
 const server=createServer((req,res)=>{const chunks=[];req.on('data',c=>chunks.push(c));req.on('end',async()=>{
  const raw=Buffer.concat(chunks);
  // Artifact staging (uncharged, before the handoff): the exact retained bytes arrive one inventoried file per request, then a commit receipt is returned.
  if(req.url==='/qdev/v1/artifact/file'){
   log.staged.push({path:req.headers['x-qdev-path'],sha256:req.headers['x-qdev-sha256'],bytes:raw,candidate:req.headers['x-qdev-candidate'],binding:req.headers['x-qdev-binding'],authorization:req.headers.authorization,verifierCallsBefore:log.verifier.length});
   res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({received:true,path:req.headers['x-qdev-path'],sha256:req.headers['x-qdev-sha256']}));}
  const body=raw.toString('utf8');
  const parsed=body?JSON.parse(body):null;
  if(req.url==='/qdev/v1/artifact/commit'){
   log.staged.push({commit:true,body:parsed,authorization:req.headers.authorization,verifierCallsBefore:log.verifier.length});
   res.writeHead(200,{'content-type':'application/json'});
   return res.end(JSON.stringify({staged:true,artifactSha256:buildArtifactSha256,inventoryDigest:retained.inventoryDigest,files:inventory.files.length,bytes:inventory.files.reduce((n,f)=>n+f.bytes,0)}));}
  log.verifier.push({url:req.url,authorization:req.headers.authorization,body:parsed});
  let json={};
  if(req.url==='/qdev/v1/handoff'){lastHandoff=parsed.handoffSha256;json={accepted:true,handoffSha256:parsed.handoffSha256};}
  else if(req.url==='/qdev/v1/evaluate'){
   // The charged evaluation: at this moment the gate must still hold the VERIFIER operation unsettled.
   log.verifierLedger.push((await w.db.query("SELECT state FROM qdev_dispatch WHERE purpose='VERIFIER'")).rows.map(r=>r.state));
   json={state:'FINAL',handoffSha256:lastHandoff,usage:{settledMicrousd:0,quiescent:true}};
  }
  else if(req.url==='/qdev/v1/verdict')json=verdictBody(parsed.candidate);
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
function runtime(w,provider,{verifierCredential=true,custody}={}){
 const bundle={version:1,ownerId:w.policy.Q1.ownerId,notAfter:new Date(Date.now()+3600e3).toISOString(),policy:w.policy.Q1,project:w.project,plan:plan(),
  credentials:{accounting:'QDEV_ACCOUNTING_CREDENTIAL',relay:'QDEV_RELAY_CREDENTIAL',accountingDatabaseUrl:'QDEV_ACCOUNTING_DATABASE_URL',journalDatabaseUrl:'QDEV_JOURNAL_DATABASE_URL'},
  relay:{origin:'https://relay.example.test',grant:grantFor()},conversation:{approvedRequest:APPROVED,deliveryUrl:'https://dashboard.example.test/app'},...(custody?{custody}:{})};
 const env={MYEVE_QDEV_ENABLED:'true',MYEVE_QDEV_HOST_BUNDLE:JSON.stringify(bundle),QDEV_ACCOUNTING_CREDENTIAL:w.t1,QDEV_RELAY_CREDENTIAL:'relay-secret-'+randomBytes(8).toString('hex'),
  QDEV_ACCOUNTING_DATABASE_URL:'postgres://accounting.invalid/a',QDEV_JOURNAL_DATABASE_URL:'postgres://journal.invalid/j'};
 if(verifierCredential)env.QDEV_VERIFIER_CREDENTIAL=CRED;
 const fetcher=async(url,init)=>{const body=JSON.parse(init.body);
  const result=body.method==='initialize'?{protocolVersion:'2024-11-05'}:{tools:[{name:'relay_github_repo_get'},{name:'relay_github_deploy_prod'}]};
  return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,result}),{status:200});};
 const source=createRuntimeHostSource({env,fetcher,database:url=>url.includes('accounting')?{query:async(q,p)=>(await w.rt.query(q,p)).rows}:{query:async(q,p)=>(await w.db.query(q,p)).rows},ports:provider});
 return {env,source,host:assembleQualificationHost(source),owner:w.policy.Q1.ownerId};
}

try{
 await test('positive: the real loader with runtimePortsProvider runs the root journey to COMPLETED over the real composed adapters',async()=>{
  const w=await world('p1'),hn=await harness(w);try{
   await w.db.query(JOURNAL_SCHEMA);
   const r=runtime(w,runtimePortsProvider(()=>hn.custody()));
   const out=await new QualificationRoot(r.host).run({ownerId:r.owner,kind:'human'});
   assert.equal(out.status,'COMPLETED_UNCLAIMED',JSON.stringify(out));assert.equal(out.readiness,'NOT_CLAIMED');assert.equal(out.authority,'NONE');assert.equal(out.stages.length,4);
   assert.match(out.verdictSha256,/^[a-f0-9]{64}$/);assert.match(out.deliverySha256,/^[a-f0-9]{64}$/);
   assert.equal(await count(w,'qdev_dispatch'),5);
   // Deep Agent adapter: SOFIE + two CODING operations for the qualified owner/slot/project, each with only the grant-permitted Relay tool visible
   assert.deepEqual(hn.log.agent.map(a=>[a.key,a.purpose]),[['s1-0','SOFIE'],['s1-1','CODING'],['s2-0','CODING']]);
   for(const a of hn.log.agent){assert.equal(a.ownerId,r.owner);assert.equal(a.slot,'Q1');assert.equal(a.projectSha256,w.binding.projectSha256);assert.deepEqual(a.tools,['relay_github_repo_get']);}
   // Factory: stages 1-2 are agent-executed (Result read from the retained admission only); the ordered clients read the retained preparation for stage 3,
   // dispatched it exactly once, and never challenged/prepared/permitted anything
   assert.deepEqual(hn.log.capability,Array(3).fill('/api/capability-admission/readback'));   // one preparation readback per Factory-run stage (1-2 CODING, 3 FACTORY)
   assert.equal(hn.log.factory.filter(c=>/POST .*\/dispatch$/.test(c)).length,1);
   assert.equal(hn.log.factory.filter(c=>/\/result$/.test(c)).length,3);
   // Verifier: exactly one digest-only handoff and one verdict fetch, with the runtime credential read through the accessor and never in the bundle
   assert.deepEqual(hn.log.verifier.map(v=>v.url),['/qdev/v1/handoff','/qdev/v1/evaluate','/qdev/v1/verdict']);
   for(const v of hn.log.verifier)assert.equal(v.authorization,'Bearer '+CRED);
   // The retained exact bytes were staged at the independent host BEFORE the first verifier call, and the proof handoff itself carries digests only
   const stagedFiles=hn.log.staged.filter(x=>!x.commit),commits=hn.log.staged.filter(x=>x.commit);
   assert.equal(commits.length,1);assert.ok(hn.log.staged.every(x=>x.verifierCallsBefore===0&&x.authorization==='Bearer '+CRED));
   assert.deepEqual(stagedFiles.map(f=>[f.path,f.sha256,f.bytes.toString('utf8')]).sort(),Object.entries(files).map(([p,b])=>[p,createHash('sha256').update(b).digest('hex'),Buffer.from(b).toString('utf8')]).sort(),'the exact built bytes, one request per inventoried file');
   assert.equal(commits[0].body.candidate.buildArtifactSha256,hn.candidate.buildArtifactSha256);
   assert.ok(!JSON.stringify(hn.log.verifier[0].body).includes('<'),'the handoff is digest-only');
   assert.deepEqual(hn.log.verifier[0].body,hn.expectedHandoff);assert.deepEqual(hn.log.verifier[1].body,{candidate:hn.candidate,reserveMicrousd:650000});assert.deepEqual(hn.log.verifier[2].body,{candidate:hn.candidate});
   assert.deepEqual(hn.log.verifierLedger,[['RUNNING']],'the verifier operation is unsettled while the evaluation runs');
   assert.equal(r.env.MYEVE_QDEV_HOST_BUNDLE.includes(CRED),false);
   // MyApps: the actual served files were observed once each
   assert.deepEqual([...hn.log.served].sort(),['/app.js','/index.html']);
   assert.ok((await w.db.query('SELECT count(*)::int n FROM qjourney_event')).rows[0].n>0);
   assert.equal(await new QualificationRoot(r.host).run({ownerId:w.policy.Q2.ownerId,kind:'human'}).catch(e=>e.code),'QDEV_ROOT_UNCONFIGURED');
  }finally{await hn.stop();}
 });


 for (const mode of ['publish','noPermit','forgedSecondVerdict']) await test(`concrete publishing through the real root: ${mode}`,async()=>{
  const w=await world('pub'+mode.slice(0,3).toLowerCase()),hn=await harness(w),dir=await mkdtemp(join(tmpdir(),'qdev-root-publish-'));let publishingCustodyPin;
  try{
   await w.db.query(JOURNAL_SCHEMA);
   const activation=[];
   const c=hn.custody();
   const readOnlyController=new StaticReleaseController({root:dir,environment:'myeve-qdev-20261029',appId:'synthetic-app',installationId:'synthetic-install',ownerId:w.policy.Q1.ownerId,projectSha256:w.binding.projectSha256});
   const served=readOnlyController.handler();let verdictReads=0;
   if(mode==='forgedSecondVerdict')c.verifier.fetch=async(url,init)=>{
    const response=await fetch(url,init);
    if(new URL(url).pathname==='/qdev/v1/verdict'&&++verdictReads===2){const body=await response.json();return Response.json({...body,signatureBase64:'AA=='});}
    return response;
   };
   c.myapps={...c.myapps,publishing:{root:dir,appId:'synthetic-app',installationId:'synthetic-install',...(mode==='noPermit'?{}:{activation:{permit:async request=>{activation.push(request);return true;}}})},
    delivery:{...c.myapps.delivery,priorRevision:async()=>{throw Error('caller prior reader must be replaced');},restorePointId:async()=>{throw Error('caller restore reader must be replaced');},
     fetcher:async url=>{hn.log.served.push(new URL(url).pathname);return served(new Request(url));}}};
   if(mode==='publish'){globalThis.__qdevTestCustody=()=>c;publishingCustodyPin=await pinnedModule();}
   const r=mode==='publish'?runtime(w,productionRuntimePorts,{custody:publishingCustodyPin}):runtime(w,runtimePortsProvider(()=>c));
   const out=await new QualificationRoot(r.host).run({ownerId:r.owner,kind:'human'});
   const state=await readOnlyController.stateSource().read('synthetic-app');
   if(mode==='publish'){
    assert.equal(out.status,'COMPLETED_UNCLAIMED',JSON.stringify(out));assert.match(out.deliverySha256,/^[a-f0-9]{64}$/);
    assert.equal(state.installedVersion,1);assert.ok(state.installedDigest);
    assert.equal(await (await served(new Request('https://app.invalid/app.js'))).text(),files['dist/app.js'].toString());
    assert.deepEqual(activation.map(x=>[x.operation,x.ownerId,x.projectSha256]),[['PUBLISH',r.owner,w.binding.projectSha256]]);
    assert.deepEqual(hn.log.verifier.map(v=>v.url),['/qdev/v1/handoff','/qdev/v1/evaluate','/qdev/v1/verdict','/qdev/v1/verdict'],'the concrete publishing gate verifies another pure signed read before mutation');
   }else{
    assert.equal(out.status,'HALTED');assert.equal(out.haltedAt,4);
    assert.equal(out.code,mode==='noPermit'?'QDEV_PUBLISH_NOT_AUTHORIZED':'QDEV_VERDICT_SIGNATURE',JSON.stringify(out));
    assert.equal(state.installedVersion,null);assert.equal(activation.length,0,'no publication authority used');
    assert.equal((await served(new Request('https://app.invalid/'))).status,404);
   }
  }finally{delete globalThis.__qdevTestCustody;if(publishingCustodyPin)await rm(dirname(publishingCustodyPin.module),{recursive:true,force:true});await hn.stop();execFileSync('chmod',['-R','u+w',dir]);await rm(dir,{recursive:true,force:true});}
 });

 /** Operator-installed custody module, pinned by path + SHA-256 in the bundle. The module hands the process-local test custody to the loader. */
 async function pinnedModule(source='export function custody(context){ return globalThis.__qdevTestCustody(context); }'){
  const dir=await mkdtemp(join(tmpdir(),'qdev-custody-')),module=join(dir,'custody.mjs');await writeFile(module,source);
  return {module,sha256:createHash('sha256').update(source).digest('hex')};
 }
 await test('positive: production startup source (productionRuntimePorts) loads the pinned custody module and runs the root journey to COMPLETED',async()=>{
  const w=await world('pm1'),hn=await harness(w);try{
   await w.db.query(JOURNAL_SCHEMA);
   globalThis.__qdevTestCustody=()=>hn.custody();
   const r=runtime(w,productionRuntimePorts,{custody:await pinnedModule()});
   const out=await new QualificationRoot(r.host).run({ownerId:r.owner,kind:'human'});
   assert.equal(out.status,'COMPLETED_UNCLAIMED',JSON.stringify(out));assert.equal(out.authority,'NONE');
   assert.equal(await count(w,'qdev_dispatch'),5);
  }finally{delete globalThis.__qdevTestCustody;await hn.stop();}
 });
 await test('negative: an unpinned, tampered, relative or throwing custody module keeps the installation disabled with nothing reserved or contacted',async()=>{
  const w=await world('pm2'),hn=await harness(w);try{
   await w.db.query(JOURNAL_SCHEMA);
   let loaded=0;globalThis.__qdevTestCustody=()=>{loaded++;return hn.custody();};
   const good=await pinnedModule();
   const tampered=await pinnedModule();await writeFile(tampered.module,'export function custody(){ return globalThis.__qdevTestCustody(); } // swapped');
   const throwing=await pinnedModule('export function custody(){ throw new Error("custody unavailable"); }');
   const noFunction=await pinnedModule('export const custody = 1;');
   for(const custody of [undefined,tampered,{...good,sha256:'0'.repeat(64)},{module:'custody.mjs',sha256:good.sha256},{module:good.module.replace('custody.mjs','../custody.mjs'),sha256:good.sha256},throwing,noFunction]){
    const r=runtime(w,productionRuntimePorts,{custody});
    await assert.rejects(new QualificationRoot(r.host).run({ownerId:r.owner,kind:'human'}),/QDEV_ROOT_UNCONFIGURED/,JSON.stringify(custody));
   }
   assert.equal(loaded,0,'a module whose bytes do not match the pinned digest is never imported or called');
   assert.equal(await count(w,'qdev_dispatch'),0);assert.deepEqual(hn.log.verifier,[]);
  }finally{delete globalThis.__qdevTestCustody;await hn.stop();}
 });

 await test('positive: Factory-backed CODING runs stages 1-2 as native Factory work under the charged reservation, with lazy per-stage admission',async()=>{
  const w=await world('fc1'),hn=await harness(w);try{
   await w.db.query(JOURNAL_SCHEMA);
   const sofie={available:()=>true,async start(t){hn.log.agent.push({key:t.key,purpose:t.purpose});return {handle:'sofie-'+t.key};},async finished(){return {usageFinal:true};}};
   const r=runtime(w,runtimePortsProvider(()=>{const c=hn.custody();return {...c,agent:{slot:'Q1',factoryCoding:{sofie}}};}));
   const out=await new QualificationRoot(r.host).run({ownerId:r.owner,kind:'human'});
   assert.equal(out.status,'COMPLETED_UNCLAIMED',JSON.stringify(out));assert.equal(out.authority,'NONE');assert.equal(out.stages.length,4);
   assert.equal(await count(w,'qdev_dispatch'),5);
   // Every Factory-run stage is prepared (readback only; nothing challenged, prepared or permitted here) and dispatched exactly once by qdev.
   assert.deepEqual(hn.log.capability,Array(3).fill('/api/capability-admission/readback'));
   assert.equal(hn.log.factory.filter(c=>/POST .*\/dispatch$/.test(c)).length,3);
   assert.deepEqual(hn.log.agent.map(a=>[a.key,a.purpose]),[['s1-0','SOFIE']]);
  }finally{await hn.stop();}
 });
 await test('actual Eve definitions and agent selector use the real free model, tool and loader/root journey with zero provider egress',async()=>{
  const w=await world('sdk'),hn=await harness(w),previousFlag=process.env.MYEVE_QDEV_ENABLED,originalFetch=globalThis.fetch;
  let forbiddenEgress=0;
  try{
   process.env.MYEVE_QDEV_ENABLED='true';
   globalThis.fetch=async(input,init)=>{
    const url=new URL(input instanceof Request?input.url:String(input));
    if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'){forbiddenEgress++;throw Error('UNEXPECTED_PROVIDER_EGRESS');}
    return originalFetch(input,init);
   };
   await w.db.query(JOURNAL_SCHEMA);
   const r=runtime(w,runtimePortsProvider(()=>hn.custody()));
   // Use the actual Eve definitions, not mocks of defineAgent/defineDynamic or a replacement conversation model.
   const [{default:agent},{default:toolDefinition}]=await Promise.all([import('../agent/agent.ts'),import('../agent/tools/qualification_journey.ts')]);
   registerQualificationHost(r.host);
   const principal={principalId:r.owner,principalType:'user',authenticator:'myeve-web-session',attributes:{owner:'true'}};
   const context={session:{id:randomUUID(),auth:{current:principal,initiator:principal}},messages:[]};
   const selected=await agent.model.events['step.started']({},context);
   const user={role:'user',content:[{type:'text',text:APPROVED}]};
   const requested=await selected.model.doGenerate({prompt:[user],tools:[{type:'function',name:'qualification_journey',inputSchema:{type:'object'}}]});
   assert.equal(requested.finishReason.unified,'tool-calls');
   const call=requested.content.find(p=>p.type==='tool-call');assert.equal(call.toolName,'qualification_journey');
   const tool=await toolDefinition.events['step.started']({},context);assert.ok(tool);
   const out=await tool.execute({},context);assert.equal(out.status,'COMPLETED_UNCLAIMED',JSON.stringify(out));
   const answer=await selected.model.doGenerate({prompt:[user,{role:'assistant',content:[call]},{role:'tool',content:[{
    type:'tool-result',toolCallId:call.toolCallId,toolName:call.toolName,output:{type:'json',value:out},
   }]}]});
   assert.equal(answer.finishReason.unified,'stop');assert.match(answer.content.find(p=>p.type==='text').text,/completed all four stages/);
   assert.equal(forbiddenEgress,0);assert.equal(await count(w,'qdev_dispatch'),5);
   assert.deepEqual(hn.log.verifier.map(v=>v.url),['/qdev/v1/handoff','/qdev/v1/evaluate','/qdev/v1/verdict']);
  }finally{
   globalThis.fetch=originalFetch;if(previousFlag===undefined)delete process.env.MYEVE_QDEV_ENABLED;else process.env.MYEVE_QDEV_ENABLED=previousFlag;
   await hn.stop();
  }
 });

 await test('independence: the actual static-build producer cannot also issue the independent verdict',async()=>{
  const w=await world('bs'),hn=await harness(w,{verdictMode:'buildSigned'});try{
   await w.db.query(JOURNAL_SCHEMA);
   const r=runtime(w,runtimePortsProvider(()=>hn.custody()));
   const out=await new QualificationRoot(r.host).run({ownerId:r.owner,kind:'human'});
   assert.equal(out.status,'HALTED',JSON.stringify(out));assert.equal(out.haltedAt,3);
   assert.equal(out.code,'QDEV_PORTS_VERIFIER_KEYS_NOT_DISJOINT');
   assert.equal(out.verdictSha256,undefined);assert.equal(out.deliverySha256,undefined);
   assert.equal(hn.log.verifier.length,0);assert.equal(hn.log.served.length,0);
   assert.equal(await count(w,'qdev_dispatch'),4,'the verifier operation is never admitted');
  }finally{await hn.stop();}
 });

 await test('negative: custody absent or refused keeps the installation disabled with nothing opened, reserved or contacted',async()=>{
  const w=await world('p2'),hn=await harness(w);try{
   for(const provider of [runtimePortsProvider(()=>null),runtimePortsProvider(()=>{throw Error('custody unavailable');}),
     runtimePortsProvider(()=>hn.custody({verifier:{...hn.custody().verifier,credentialName:'lowercase'}})),
     runtimePortsProvider(()=>hn.custody({verifier:{...hn.custody().verifier,producerKeyIds:[w.verifier.key.keyId]}}))]){
    const r=runtime(w,provider);
    assert.equal(await r.source.material(r.owner),null);
    assert.equal(await new QualificationRoot(r.host).run({ownerId:r.owner,kind:'human'}).catch(e=>e.code),'QDEV_ROOT_UNCONFIGURED');
   }
   assert.equal(await count(w,'qdev_work'),0);assert.equal(await count(w,'qdev_dispatch'),0);
   assert.deepEqual([hn.log.agent.length,hn.log.capability.length,hn.log.factory.length,hn.log.verifier.length,hn.log.served.length],[0,0,0,0,0]);
  }finally{await hn.stop();}
 });

 await test('negative: a missing verifier credential halts at the verifier stage before any verifier contact, and nothing is resent',async()=>{
  const w=await world('p3'),hn=await harness(w);try{
   await w.db.query(JOURNAL_SCHEMA);
   const r=runtime(w,runtimePortsProvider(()=>hn.custody()),{verifierCredential:false});
   const out=await new QualificationRoot(r.host).run({ownerId:r.owner,kind:'human'});
   assert.equal(out.status,'HALTED');assert.equal(out.haltedAt,4);assert.equal(out.stages.length,3);
   assert.equal(out.verdictSha256,undefined);assert.equal(out.deliverySha256,undefined);
   assert.equal(hn.log.verifier.length,0);assert.equal(hn.log.served.length,0);
   assert.equal(hn.log.factory.filter(c=>/POST .*\/dispatch$/.test(c)).length,1,'stage 3 was dispatched once and never resent');
   const rows=(await w.db.query("SELECT purpose,state FROM qdev_dispatch ORDER BY created_at")).rows;
   assert.equal(rows.at(-1).purpose,'VERIFIER');assert.equal(rows.at(-1).state,'NOT_DISPATCHED','a proven no-send is tombstoned, not settled or retried');
   assert.equal(rows.filter(r=>r.purpose==='VERIFIER').length,1);
  }finally{await hn.stop();}
 });

 for(const [mode,label,code] of [['producerSigned','a verdict signed by a producer-side key under the verifier key id','QDEV_VERDICT_SIGNATURE'],
  ['wrongCandidate','a verdict for a different candidate','QDEV_HALTED']])      // binding mismatches carry a field suffix, which the owner-safe presentation collapses
  await test(`negative: ${label} halts the journey with no PASS presented and no delivery observed`,async()=>{
   const w=await world('p4'+mode.slice(0,2)),hn=await harness(w,{verdictMode:mode});try{
    await w.db.query(JOURNAL_SCHEMA);
    const r=runtime(w,runtimePortsProvider(()=>hn.custody()));
    const out=await new QualificationRoot(r.host).run({ownerId:r.owner,kind:'human'});
    assert.equal(out.status,'HALTED');assert.equal(out.haltedAt,4);assert.equal(out.code,code);
    assert.equal(out.verdictSha256,undefined);assert.equal(out.deliverySha256,undefined);
    assert.deepEqual(hn.log.verifier.map(v=>v.url),['/qdev/v1/handoff','/qdev/v1/evaluate','/qdev/v1/verdict']);
    assert.equal(hn.log.served.length,0,'no delivery is observed for an unaccepted verdict');
    assert.equal(hn.log.factory.filter(c=>/POST .*\/dispatch$/.test(c)).length,1);
   }finally{await hn.stop();}
  });
}finally{
 await Promise.all(clients.map(c=>c.end().catch(()=>{})));
 for(const n of names)await admin.query('DROP DATABASE IF EXISTS '+n+' WITH (FORCE)');
 for(const r of roles)await admin.query('DROP ROLE IF EXISTS '+r);
 await admin.end();
}
