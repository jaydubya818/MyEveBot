/** DJR-01 regression (cohort-bound recovery): fresh current hosts must not adopt another accounting cohort's completed Works. Adapted from the independent
 * reviewer's probe (review-cohort-recovery.integration.mjs; its counterexample assertion is kept) with the same-binding restart control and the
 * replaced-accounting / shared-stream layers. Same fixtures as below. Positive actual-agent/root composition: the REAL loader (`createRuntimeHostSource` + `runtimePortsProvider`) over the REAL composed adapters
 * (DeepAgentAdapter, LiveFactoryPort over buildOrderedFactoryClients, HttpVerifierPort, StaticBuildMyAppsPort), disposable PostgreSQL, a fake Relay,
 * a disposable loopback verifier and mocked Factory/capability/served-file transports. Synthetic only: no real owner, model, Factory, verifier,
 * repository, deployment or spend. The Factory side is mocked at the HTTP boundary (the actual MyFactory receiver is covered by
 * qualification-factory-real-receiver.test.mjs).
 * Run: MYEVE_ISOLATED_COHORT_TEST_DATABASE=postgres://postgres@127.0.0.1:PORT/postgres node --import tsx --test apps/eve/test/qualification-cohort-recovery.integration.mjs */
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
import {JOURNAL_SCHEMA,PostgresJournal} from '../lib/qualification/journal.ts';
import {qdevJourneyId} from '../lib/qualification/custody-profile.ts';
import {stageRequestSha256} from '../lib/qualification/journey.ts';
import {validateJourneyPlan} from '../lib/qualification/plan.ts';
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
function runtime(w,provider,{verifierCredential=true,custody,planOverride}={}){
 const bundle={version:1,ownerId:w.policy.Q1.ownerId,notAfter:new Date(Date.now()+3600e3).toISOString(),policy:w.policy.Q1,project:w.project,plan:planOverride??plan(),
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


const served=hn=>hn.log.served.length,agentCalls=hn=>hn.log.agent.length;
const dispatches=hn=>hn.log.factory.filter(c=>c.startsWith('POST')).length,evaluations=hn=>hn.log.verifier.filter(v=>v.url.endsWith('/evaluate')).length;
const snapshot=hn=>({served:served(hn),agent:agentCalls(hn),dispatches:dispatches(hn),evaluations:evaluations(hn)});
const delta=(hn,b)=>({served:served(hn)-b.served,agent:agentCalls(hn)-b.agent,dispatches:dispatches(hn)-b.dispatches,evaluations:evaluations(hn)-b.evaluations});
const NOTHING={served:0,agent:0,dispatches:0,evaluations:0};
/** A second accounting database (fresh, no Works) for a cohort that is active for the same owner/project/source. */
async function replacement(w,label,{cohort=randomUUID(),paidWorks=0,token=randomBytes(32).toString('hex'),policy}={}){
 const name='myeve_qdev_'+label+'_'+suffix;names.push(name);await admin.query('CREATE DATABASE '+name);const db=await connect(name);await db.query(sql);
 const p=policy??{...w.policy.Q1,cohortId:cohort};
 await db.query(`INSERT INTO qdev_charter(id,proposal_id,charter_sha256,funding_sha256,hold_disposition_sha256,price_revision_sha256,journey_ceiling_microusd,max_works,per_work_ceiling_microusd,concurrency,valid_until)
  VALUES($1,'qdev-20261029-01',$2,$2,$2,$2,5200000,4,1300000,1,clock_timestamp()+interval '1 hour')`,[p.cohortId,h('4')]);
 await db.query(`INSERT INTO qdev_member(cohort_id,slot,owner_id,policy_sha256,credential_sha256,paid_works) VALUES($1,'Q1',$2,$3,$4,$5)`,[p.cohortId,p.ownerId,digest(p),hash(token),paidWorks]);
 await db.query('INSERT INTO qdev_project(id,cohort_id,owner_id,project_sha256,source_sha256) VALUES($1,$2,$3,$4,$5)',[randomUUID(),p.cohortId,p.ownerId,w.binding.projectSha256,w.binding.sourceSha256]);
 await db.query('UPDATE qdev_charter SET activated_at=clock_timestamp() WHERE id=$1',[p.cohortId]);
 return {db,policy:p,token};
}
/** The same runtime as `runtime(w,...)` but over another accounting database/policy/credential (a "fresh current host loader"). */
function rebound(w,hn,r,{db,policy,token},{journal,planOverride}={}){
 const env={...r.env};const bundle=JSON.parse(env.MYEVE_QDEV_HOST_BUNDLE);bundle.policy=policy;if(planOverride)bundle.plan=planOverride;env.MYEVE_QDEV_HOST_BUNDLE=JSON.stringify(bundle);env.QDEV_ACCOUNTING_CREDENTIAL=token;
 const fetcher=async(url,init)=>{const body=JSON.parse(init.body);
  const result=body.method==='initialize'?{protocolVersion:'2024-11-05'}:{tools:[{name:'relay_github_repo_get'},{name:'relay_github_deploy_prod'}]};
  return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,result}),{status:200});};
 const source=createRuntimeHostSource({env,fetcher,database:url=>url.includes('accounting')?{query:async(q,p)=>(await db.query(q,p)).rows}:{query:async(q,p)=>(await w.db.query(q,p)).rows},ports:runtimePortsProvider(()=>hn.custody())});
 const host=assembleQualificationHost(source);
 // `journal` forces the pre-fix shape: another cohort's journal stream is what this host reads
 return journal?{...host,config:async o=>{const c=await host.config(o);return c&&{...c,journal:journal(c)};}}:host;
}
const boundWorks=async host=>(await (await host.config(host.owner)).journal.read()).filter(e=>e.kind==='STAGE_BOUND').map(e=>e.workId);
const count0=async(db,cohort)=>(await db.query('SELECT count(*)::int n FROM qdev_work WHERE cohort_id=$1',[cohort])).rows[0].n;

try {
 await test('control: a same-binding restart of a COMPLETED (CLOSED-history) journey recovers, re-proves the Works in the ledger and re-sends nothing',async()=>{
  const w=await world('djr1ctl'),hn=await harness(w);
  try {
   await w.db.query(JOURNAL_SCHEMA);
   const r=runtime(w,runtimePortsProvider(()=>hn.custody()));
   const first=await new QualificationRoot(r.host).run({ownerId:r.owner,kind:'human'});assert.equal(first.status,'COMPLETED_UNCLAIMED');
   assert.equal(await count0(w.db,w.cohort),4);
   assert.deepEqual((await w.db.query("SELECT ordinal,state FROM qdev_work ORDER BY ordinal")).rows.map(x=>x.state),['CLOSED','CLOSED','CLOSED','BOUND'],'stages 1-3 are CLOSED history');
   const before=snapshot(hn),ids=await boundWorks({config:r.host.config,owner:r.owner});
   const same=runtime(w,runtimePortsProvider(()=>hn.custody()));
   const again=await new QualificationRoot(same.host).run({ownerId:r.owner,kind:'human'});
   assert.equal(again.status,'COMPLETED_UNCLAIMED');assert.deepEqual(again.stages,first.stages,'the same accepted candidates');
   assert.deepEqual(await boundWorks({config:same.host.config,owner:r.owner}),ids,'the same four Works');
   const d=delta(hn,before);assert.equal(d.agent,0);assert.equal(d.dispatches,0);assert.equal(d.evaluations,0,'nothing is re-sent or re-evaluated');
   assert.equal(await count0(w.db,w.cohort),4,'no Work is allocated by recovery');
  } finally {await hn.stop();}
 });

 await test('DJR-01 counterexample (reviewer): a fresh host over another cohort with ZERO paid Works does not adopt the completed Works and observes no delivery',async()=>{
  const w=await world('djr1cx'),hn=await harness(w);
  try {
   await w.db.query(JOURNAL_SCHEMA);
   const r=runtime(w,runtimePortsProvider(()=>hn.custody()));
   const first=await new QualificationRoot(r.host).run({ownerId:r.owner,kind:'human'});assert.equal(first.status,'COMPLETED_UNCLAIMED');
   const originalWorkIds=(await (await r.host.config(r.owner)).journal.read()).filter(e=>e.kind==='STAGE_BOUND').map(e=>e.workId);
   const b=await replacement(w,'djr1cxb');
   const host=rebound(w,hn,r,b);host.owner=r.owner;
   const cfg=await host.config(r.owner),status=await cfg.accounting.status();
   assert.equal(status.ownWorks,0);assert.equal(status.paidWorksAllowed,0);
   assert.equal(await cfg.accounting.assertBound({id:originalWorkIds[0]},randomUUID()).then(()=>'ACCEPTED',e=>e.message),'QDEV_DENIED');
   assert.equal(await cfg.accounting.reserveWork({bindingId:'new-cohort-control',requestSha256:h('8'),ceilingMicrousd:1300000}).then(()=>'RESERVED',e=>e.message),'QDEV_NO_PAID_WORK');
   const before=snapshot(hn);
   const resumed=await new QualificationRoot(host).run({ownerId:r.owner,kind:'human'});
   assert.notEqual(resumed.status,'COMPLETED_UNCLAIMED','fresh cohort cannot inherit completed Works outside that cohort');
   assert.equal(resumed.status,'HALTED');
   assert.deepEqual((await cfg.journal.read()).filter(e=>e.kind==='STAGE_BOUND'),[],'the other cohort has its own (empty) journal stream, never the first cohort\'s');
   assert.notEqual(qdevJourneyId(r.owner,w.project,w.policy.Q1,validateJourneyPlan(plan())),qdevJourneyId(r.owner,w.project,b.policy,validateJourneyPlan(plan())));
   assert.deepEqual(delta(hn,before),NOTHING,'no delivery observation, agent call, Factory dispatch or verifier evaluation');
   assert.equal(await count0(b.db,b.policy.cohortId),0,'the zero-paid cohort still contains zero Works');
  } finally {await hn.stop();}
 });

 await test('DJR-01 layer 2: even when the journal stream IS shared (same cohort policy over a replaced, empty accounting database; or a copy of another cohort\'s stream) recovery fails closed before delivery',async()=>{
  const w=await world('djr1l2'),hn=await harness(w);
  try {
   await w.db.query(JOURNAL_SCHEMA);
   const r=runtime(w,runtimePortsProvider(()=>hn.custody()));
   const first=await new QualificationRoot(r.host).run({ownerId:r.owner,kind:'human'});assert.equal(first.status,'COMPLETED_UNCLAIMED');
   // (a) database replacement: identical cohort/policy/credential, funded for 4 Works, but the accounting database holds none of the journaled Works
   const same=await replacement(w,'djr1l2a',{policy:w.policy.Q1,token:w.t1,paidWorks:4});
   let before=snapshot(hn);
   const a=await new QualificationRoot(rebound(w,hn,r,same)).run({ownerId:r.owner,kind:'human'});
   assert.equal(a.status,'HALTED');assert.equal(a.code,'QDEV_RECOVERY_COHORT_MISMATCH');assert.equal(a.haltedAt,1);
   assert.deepEqual(delta(hn,before),NOTHING);assert.equal(await count0(same.db,same.policy.cohortId),0,'verification allocated nothing');
   // (b) the pre-fix shape: a different cohort reading a copy of the first cohort's journal stream
   const id=qdevJourneyId(r.owner,w.project,w.policy.Q1,validateJourneyPlan(plan())),copy='misconfigured-'+suffix;
   await w.db.query('INSERT INTO qjourney_event(journey_id,kind,stage,payload) SELECT $2,kind,stage,payload FROM qjourney_event WHERE journey_id=$1 ORDER BY seq',[id,copy]);
   const paid=await replacement(w,'djr1l2b',{paidWorks:4});            // funded, empty: must not allocate or adopt anything
   before=snapshot(hn);
   const b=await new QualificationRoot(rebound(w,hn,r,paid,{journal:()=>new PostgresJournal({query:async(q,p)=>(await w.db.query(q,p)).rows},copy)})).run({ownerId:r.owner,kind:'human'});
   assert.equal(b.status,'HALTED');assert.equal(b.code,'QDEV_RECOVERY_COHORT_MISMATCH');
   assert.deepEqual(delta(hn,before),NOTHING);assert.equal(await count0(paid.db,paid.policy.cohortId),0);
   // the original cohort is unaffected by both attempts
   const again=await new QualificationRoot(runtime(w,runtimePortsProvider(()=>hn.custody())).host).run({ownerId:r.owner,kind:'human'});assert.equal(again.status,'COMPLETED_UNCLAIMED');
  } finally {await hn.stop();}
 });

 // ---- reconciliation round 2 (Codex review 1): partial history, incomplete receipts, copied plans, legacy journals ----
 const planPrime=()=>({slot:'Q1',stages:[stage(1,['SOFIE','CODING']),stage(2,['CODING']),stage(3,['FACTORY']),stage(4,['VERIFIER'],1200000)]});
 const streamOf=(w,r)=>qdevJourneyId(r.owner,w.project,w.policy.Q1,validateJourneyPlan(plan()));
 const pgJournal=(w,id)=>new PostgresJournal({query:async(q,p)=>(await w.db.query(q,p)).rows},id);
 const copyStream=(w,from,to,transform='payload')=>w.db.query(`INSERT INTO qjourney_event(journey_id,kind,stage,payload) SELECT $2,kind,stage,${transform} FROM qjourney_event WHERE journey_id=$1 ORDER BY seq`,[from,to]);
 let seq=0;
 const completed=async label=>{const w=await world(label+(seq++)),hn=await harness(w);await w.db.query(JOURNAL_SCHEMA);
  await w.db.query('ALTER TABLE qdev_dispatch DISABLE TRIGGER USER');            // test-only: simulate a restored/older accounting snapshot
  const r=runtime(w,runtimePortsProvider(()=>hn.custody()));
  assert.equal((await new QualificationRoot(r.host).run({ownerId:r.owner,kind:'human'})).status,'COMPLETED_UNCLAIMED');
  return {w,hn,r};};
 const haltedWith=(res,code,at)=>{assert.equal(res.status,'HALTED');assert.equal(res.code,code);if(at!==undefined)assert.equal(res.haltedAt,at);};

 await test('DJR-01 round 2 #1: PARTIALLY settled history (settled SOFIE, pending CODING) is re-proved before any reservation/binding/dispatch; a replacement or other funded cohort allocates and dispatches nothing',async()=>{
  const w=await world('djr1r2a'),hn=await harness(w);
  try {
   await w.db.query(JOURNAL_SCHEMA);
   const r=runtime(w,runtimePortsProvider(()=>hn.custody()));
   const same={db:w.rt,policy:w.policy.Q1,token:w.t1};
   // a genuine partial history: SOFIE settled; the journal refuses the CODING claim, so the ledger tombstones it (proven no-send) and the journey halts
   const failing=rebound(w,hn,r,same,{journal:c=>({read:()=>c.journal.read(),append:e=>e.kind==='OP_CLAIMED'&&e.key==='s1-1'?Promise.reject(new Error('journal unavailable')):c.journal.append(e)})});
   haltedWith(await new QualificationRoot(failing).run({ownerId:r.owner,kind:'human'}),'QDEV_PROVIDER_NOT_SENT',1);
   const events=await pgJournal(w,streamOf(w,r)).read();
   assert.deepEqual(events.filter(e=>e.kind==='OP_SETTLED').map(e=>e.key),['s1-0']);assert.equal(events.some(e=>e.kind==='OP_CLAIMED'&&e.key==='s1-1'),false);
   assert.equal(events.find(e=>e.kind==='STAGE_BOUND').approvedPlanSha256,digest(validateJourneyPlan(plan())),'the bound stage records the full approved-plan digest');
   // control: the SAME ledger passes the recovery proof and proceeds to the pending (already tombstoned) CODING operation
   let before=snapshot(hn);
   haltedWith(await new QualificationRoot(rebound(w,hn,r,same)).run({ownerId:r.owner,kind:'human'}),'QDEV_NOT_DISPATCHED',1);
   assert.deepEqual(delta(hn,before),NOTHING);
   // (a) the ledger is replaced by an empty, funded database with the same policy and credential
   const replaced=await replacement(w,'djr1r2a1',{policy:w.policy.Q1,token:w.t1,paidWorks:4});
   before=snapshot(hn);
   haltedWith(await new QualificationRoot(rebound(w,hn,r,replaced)).run({ownerId:r.owner,kind:'human'}),'QDEV_RECOVERY_COHORT_MISMATCH',1);
   assert.deepEqual(delta(hn,before),NOTHING);assert.equal(await count0(replaced.db,replaced.policy.cohortId),0,'no Work reserved or bound on the replacement ledger');
   // (b) a copy of the partial journal read under another funded cohort
   const copy='partial-copy-'+suffix;await copyStream(w,streamOf(w,r),copy);
   const other=await replacement(w,'djr1r2a2',{paidWorks:4});
   haltedWith(await new QualificationRoot(rebound(w,hn,r,other,{journal:()=>pgJournal(w,copy)})).run({ownerId:r.owner,kind:'human'}),'QDEV_RECOVERY_COHORT_MISMATCH',1);
   assert.deepEqual(delta(hn,before),NOTHING);assert.equal(await count0(other.db,other.policy.cohortId),0);
  } finally {await hn.stop();}
 });

 await test('DJR-01 round 2 #2: completed recovery verifies the canonical operation receipts: absent, RUNNING, re-reserved or missing-closed-history accounting is refused before delivery',async()=>{
  const variants=[
   ['verifier receipt absent (snapshot taken after the stage-4 bind, before its dispatch)',w=>w.db.query("DELETE FROM qdev_dispatch WHERE work_id=(SELECT id FROM qdev_work WHERE ordinal=4)"),'QDEV_RECOVERY_RECEIPT_MISMATCH',4],
   ['verifier receipt restored as RUNNING',w=>w.db.query("UPDATE qdev_dispatch SET state='RUNNING' WHERE work_id=(SELECT id FROM qdev_work WHERE ordinal=4)"),'QDEV_RECOVERY_RECEIPT_MISMATCH',4],
   ['verifier receipt with a different reservation',w=>w.db.query("UPDATE qdev_dispatch SET reserve_microusd=reserve_microusd+1 WHERE work_id=(SELECT id FROM qdev_work WHERE ordinal=4)"),'QDEV_BINDING_CHANGED',4],
   ['verifier receipt with a different purpose',w=>w.db.query("UPDATE qdev_dispatch SET purpose='FACTORY' WHERE work_id=(SELECT id FROM qdev_work WHERE ordinal=4)"),'QDEV_BINDING_CHANGED',4],
   ['closed stage-1 history without its settled operations',w=>w.db.query("DELETE FROM qdev_dispatch WHERE work_id=(SELECT id FROM qdev_work WHERE ordinal=1)"),'QDEV_RECOVERY_COHORT_MISMATCH',1],
  ];
  for(const [name,mutate,code,at] of variants){
   const {w,hn,r}=await completed('djr1r2b');
   try {
    await mutate(w);
    const before=snapshot(hn);
    const res=await new QualificationRoot(runtime(w,runtimePortsProvider(()=>hn.custody())).host).run({ownerId:r.owner,kind:'human'});
    assert.equal(res.status,'HALTED',name);assert.equal(res.code,code,name);assert.equal(res.haltedAt,at,name);
    assert.deepEqual(delta(hn,before),NOTHING,name+': no delivery observation, agent call, dispatch or evaluation');
   } finally {await hn.stop();}
  }
 });

 await test('DJR-01 round 2 #3: history copied from approved plan P into plan P-prime is refused by the journal AND by the canonical accounting request material',async()=>{
  const {w,hn,r}=await completed('djr1r2c');
  try {
   const pPrime=validateJourneyPlan(planPrime()),P=validateJourneyPlan(plan());
   assert.notEqual(digest(P),digest(pPrime));assert.equal(stageRequestSha256(P.stages[0],P)!==stageRequestSha256(pPrime.stages[0],pPrime),true,'stage 1 is identical in both plans but its accounting request material is not');
   const same={db:w.rt,policy:w.policy.Q1,token:w.t1};
   const idP=streamOf(w,r),idPPrime=qdevJourneyId(r.owner,w.project,w.policy.Q1,pPrime);assert.notEqual(idP,idPPrime);
   // (a) the stream and its history copied verbatim into P-prime's namespace
   await copyStream(w,idP,idPPrime);
   let before=snapshot(hn);
   haltedWith(await new QualificationRoot(rebound(w,hn,r,same,{planOverride:planPrime()})).run({ownerId:r.owner,kind:'human'}),'QDEV_JOURNEY_PLAN_MISMATCH',1);
   assert.deepEqual(delta(hn,before),NOTHING);
   // (b) the copy with the plan digest rewritten to P-prime (forged durable record): the ledger's own request material still names P
   const forged='forged-plan-'+suffix;
   await copyStream(w,idP,forged,`CASE WHEN kind='STAGE_BOUND' THEN jsonb_set(payload,'{approvedPlanSha256}',to_jsonb('${digest(pPrime)}'::text)) ELSE payload END`);
   haltedWith(await new QualificationRoot(rebound(w,hn,r,same,{planOverride:planPrime(),journal:()=>pgJournal(w,forged)})).run({ownerId:r.owner,kind:'human'}),'QDEV_RECEIPT_MISMATCH',1);
   assert.deepEqual(delta(hn,before),NOTHING);assert.equal(await count0(w.db,w.cohort),4,'no Work was allocated');
   // control: the original plan still recovers over the same ledger
   assert.equal((await new QualificationRoot(runtime(w,runtimePortsProvider(()=>hn.custody())).host).run({ownerId:r.owner,kind:'human'})).status,'COMPLETED_UNCLAIMED');
  } finally {await hn.stop();}
 });

 await test('DJR-01 round 2 #4: historical journals fail closed (no approved-plan digest; written under the old owner/project/source-only id)',async()=>{
  const {w,hn,r}=await completed('djr1r2d');
  try {
   const same={db:w.rt,policy:w.policy.Q1,token:w.t1},idNow=streamOf(w,r);
   // (a) a pre-fix stream at the current id: STAGE_BOUND without approvedPlanSha256
   const legacy='legacy-shape-'+suffix;await copyStream(w,idNow,legacy,`CASE WHEN kind='STAGE_BOUND' THEN payload - 'approvedPlanSha256' ELSE payload END`);
   let before=snapshot(hn);
   haltedWith(await new QualificationRoot(rebound(w,hn,r,same,{journal:()=>pgJournal(w,legacy)})).run({ownerId:r.owner,kind:'human'}),'QDEV_JOURNEY_PLAN_MISMATCH',1);
   assert.deepEqual(delta(hn,before),NOTHING);
   // (b) history under the old id formula is never read: the current host sees an EMPTY stream, and the existing ledger refuses to bind the same stages again
   const oldId=createHash('sha256').update(JSON.stringify([r.owner,w.binding.projectSha256,w.binding.sourceSha256])).digest('hex');
   await copyStream(w,idNow,oldId);assert.notEqual(oldId,idNow);
   assert.equal((await pgJournal(w,idNow).read()).length>0,true);
   before=snapshot(hn);
   const res=await new QualificationRoot(runtime(w,runtimePortsProvider(()=>hn.custody())).host).run({ownerId:r.owner,kind:'human'});
   assert.equal(res.status,'COMPLETED_UNCLAIMED','the current-id stream is the only history the current host reads');
   const emptied=await new QualificationRoot(rebound(w,hn,r,same,{journal:()=>pgJournal(w,'no-history-'+suffix)})).run({ownerId:r.owner,kind:'human'});
   haltedWith(emptied,'QDEV_DENIED',1);assert.deepEqual(delta(hn,before),{...NOTHING,served:delta(hn,before).served},'no agent call or dispatch from an empty stream over an existing ledger');
  } finally {await hn.stop();}
 });
}finally{
 await Promise.all(clients.map(c=>c.end().catch(()=>{})));
 for(const n of names)await admin.query('DROP DATABASE IF EXISTS '+n+' WITH (FORCE)');
 for(const r of roles)await admin.query('DROP ROLE IF EXISTS '+r);
 await admin.end();
}
