/** Private-beta OWNER-LOCAL journey over the real composition: an arbitrary owner request -> deterministic proposal -> owner confirmation -> the actual Eve
 * agent selector + qualification_journey tool -> QualificationRoot -> the real runtime loader (createRuntimeHostSource, version-2 owner-local bundle,
 * derived per-request accounting/journal/ports) -> composeRuntimePorts with the REAL DeepAgentAdapter + FactoryCodingRuntime (stages 1-2 as native
 * Factory runs) + LiveFactoryPort over buildOrderedFactoryClients + SofiePlanningRuntime + HttpVerifierPort + StaticBuildMyAppsPort, on disposable PostgreSQL
 * with the hash-pinned accounting SQL.
 *
 * MOCKED (clearly): the loopback Factory and capability-admission HTTP endpoints (no real MyFactory host exists yet; see
 * ~/Myeve/output/private-beta-20261103/MYEVE-FACTORY-CONTRACT.md), the Relay MCP transport, the Sofie planning model (scripted, zero cost), the
 * served-file fetch, and the loopback verifier endpoint (which signs PRIVATE_BETA_LOCAL verdicts with a disjoint key). No real owner, model, Factory,
 * repository, deployment or spend.
 * Run: MYEVE_ISOLATED_COHORT_TEST_DATABASE=postgres://postgres@127.0.0.1:PORT/postgres node --import tsx --test apps/eve/test/private-beta-owner-journey.integration.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash,generateKeyPairSync,sign} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {Client} from 'pg';
import {QualificationAccounting} from '../lib/external-alpha/qualification-accounting.ts';
import {JOURNAL_SCHEMA} from '../lib/qualification/journal.ts';
import {QualificationRoot,QualificationRootRefused,registerQualificationHost} from '../lib/qualification/root.ts';
import {createRuntimeHostSource} from '../lib/qualification/host-source.ts';
import {assembleQualificationHost} from '../lib/qualification/host-bootstrap.ts';
import {composeRuntimePorts} from '../lib/qualification/runtime-ports.ts';
import {SofiePlanningRuntime} from '../lib/qualification/sofie-planning-runtime.ts';
import {deriveOwnerJourney} from '../lib/qualification/owner-request.ts';
import {qdevRequestOwner} from '../lib/qualification/ingress.ts';
import {buildVerifierHandoff} from '../lib/qualification/verifier-handoff.ts';
import {bareSha256} from '../lib/qualification/delivery-observer.ts';
import {canonical as myappsCanonical} from '../../../packages/myapps/src/contracts.ts';
import {StaticArtifactCandidate} from '../../../packages/myapps/src/static-artifact.ts';
import {STATIC_BUILD_CLAIM_DOMAIN} from '../../../packages/myapps/src/static-build-claim.ts';
import {syntheticFactory,syntheticVerifier,verdictFor as baseVerdictFor,h,digest,codec} from './qualification-synthetic.mjs';

const connection=process.env.MYEVE_ISOLATED_COHORT_TEST_DATABASE;
assert(connection,'Dedicated localhost PostgreSQL fixture URL required; never use DATABASE_URL');
const root=new URL(connection);
assert(['localhost','127.0.0.1'].includes(root.hostname)&&root.pathname==='/postgres','Dedicated localhost admin database required');
const hash=t=>createHash('sha256').update(t).digest('hex');
const suffix=randomBytes(6).toString('hex'),secret=randomBytes(24).toString('hex');
const admin=new Client({connectionString:connection});await admin.connect();
const clients=[],names=[],roles=[];
const sql=await readFile(new URL('../lib/external-alpha/qualification-accounting.sql',import.meta.url),'utf8');
assert.equal(hash(sql),'f52677729d9e50ad7361273bfa8732b33fbe091ca77ce522736599081957671d','the hash-pinned accounting SQL is used unchanged');
async function connect(name,role){const u=new URL(root);u.pathname='/'+name;if(role){u.username=role;u.password=secret;}const c=new Client({connectionString:u.href});await c.connect();clients.push(c);return c;}

const REQUEST='Build me a React dashboard showing GitHub repository health and failing CI pipelines.';
const stage=(n,purposes,ceiling=1300000)=>({stage:n,workCeilingMicrousd:ceiling,operations:purposes.map((p,i)=>({key:`s${n}-${i}`,purpose:p,reserveMicrousd:Math.floor(ceiling/purposes.length/2)}))});
const planTemplate=()=>({slot:'Q1',stages:[stage(1,['SOFIE','CODING']),stage(2,['CODING']),stage(3,['FACTORY']),stage(4,['VERIFIER'])]});

/**
 * One disposable accounting DB with the OPERATOR-ISSUED cohort for exactly one derived owner request (charter, member, project parent). The SQL's charter
 * proposal_id CHECK is part of the hash-pinned schema, so the operator row carries it; nothing in the private-beta profile derives from it.
 */
async function world(label,{issueFor=REQUEST}={}){
 const factory=syntheticFactory(),verifier=syntheticVerifier(),owner=randomUUID();
 const installation={profile:'myeve.private-beta.owner/v1',environment:'myeve-pb-owner-local',repository:'jaydubya818/sofie-owner-dashboards',
  inputCommit:factory.baseline.commit,inputTree:factory.baseline.tree,outputBranch:'sofie/owner-requests',operatingProfileSha256:h('1'),factoryVersionSha256:factory.factoryVersion,
  sources:{myeve:'a'.repeat(40),factory:'b'.repeat(40),relay:'c'.repeat(40),missioncontrol:'d'.repeat(40)}};
 const template={installation,plan:planTemplate()};
 const d=deriveOwnerJourney({ownerId:owner,template,request:issueFor});
 const name='myeve_pb_'+label+'_'+suffix,role='pb_'+label+'_'+suffix;names.push(name);roles.push(role);
 await admin.query("CREATE ROLE "+role+" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+secret+"'");
 await admin.query('CREATE DATABASE '+name);await admin.query('REVOKE CONNECT ON DATABASE '+name+' FROM PUBLIC');await admin.query('GRANT CONNECT ON DATABASE '+name+' TO '+role);
 const db=await connect(name);await db.query(sql);await db.query('GRANT EXECUTE ON FUNCTION qdev_cohort_call(jsonb) TO '+role);
 const t1=randomBytes(32).toString('hex');
 await db.query(`INSERT INTO qdev_charter(id,proposal_id,charter_sha256,funding_sha256,hold_disposition_sha256,price_revision_sha256,journey_ceiling_microusd,max_works,per_work_ceiling_microusd,concurrency,valid_until)
  VALUES($1,'qdev-20261029-01',$2,$2,$2,$2,5200000,4,1300000,1,clock_timestamp()+interval '1 hour')`,[d.policy.cohortId,h('4')]);
 await db.query(`INSERT INTO qdev_member(cohort_id,slot,owner_id,policy_sha256,credential_sha256,paid_works) VALUES($1,'Q1',$2,$3,$4,4)`,[d.policy.cohortId,owner,digest(d.policy),hash(t1)]);
 await db.query('INSERT INTO qdev_project(id,cohort_id,owner_id,project_sha256,source_sha256) VALUES($1,$2,$3,$4,$5)',[randomUUID(),d.policy.cohortId,owner,d.binding.projectSha256,d.binding.sourceSha256]);
 await db.query('UPDATE qdev_charter SET activated_at=clock_timestamp() WHERE id=$1',[d.policy.cohortId]);
 const rt=await connect(name,role);
 return {factory,verifier,owner,installation,template,derived:d,project:d.project,binding:d.binding,db,rt,t1,policy:{Q1:d.policy}};
}
const count=async(w,table)=>(await w.db.query('SELECT count(*)::int n FROM '+table)).rows[0].n;
const CRED='verifier-credential-'+randomBytes(12).toString('hex');
const DEADLINE='2099-01-01T00:00:00.000Z';
const sha=b=>createHash('sha256').update(b).digest('hex');
const files={'dist/index.html':Buffer.from('<html><script src="/app.js"></script></html>'),'dist/app.js':Buffer.from('console.log("synthetic dashboard")')};
const policyKey=async()=>{const p=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);return {keyId:'original-receiver',jwk:await crypto.subtle.exportKey('jwk',p.privateKey)};};

/** The synthetic Factory chain (UUID request ids so the real LiveFactoryAdapter readback schema applies) plus every mocked transport and its call log. */
async function harness(w,{verdictMode='valid'}={}){
 const verdictFor=over=>baseVerdictFor({assurance:verdictMode==='claimsIndependent'?'INDEPENDENT':'PRIVATE_BETA_LOCAL',...over});
 const fx=w.factory,ids={1:randomUUID(),2:randomUUID(),3:randomUUID()};
 const base={commit:w.project.inputCommit,tree:w.project.inputTree};
 const mk=(n,input)=>fx.stage(n,input,{mutate:m=>{m.execution.requestId=ids[n];
  m.operationId=codec.digest([codec.RESULT_PROTOCOL,fx.factoryId,ids[n],m.execution.workOrderId,m.execution.runId]);}});
 const s1=mk(1,base),s2=mk(2,s1.candidate),s3=mk(3,s2.candidate);
 const starts={1:base,2:s1.candidate,3:s2.candidate},results={1:s1,2:s2,3:s3};
 const adm={},byRequest=new Map(),byWorkOrder=new Map();
 for(const n of [1,2,3]){
  const e=results[n].manifest.execution,workId=randomUUID(),start=starts[n];
  const raw={workId,workVersion:1,workGeneration:1,criteriaVersion:1,agentId:'synthetic-agent',factoryId:fx.factoryId,factoryVersion:fx.factoryVersion,requestId:e.requestId,requestDigest:e.requestDigest,
   sourceDigest:fx.sourceDigest,configurationDigest:fx.configurationDigest,workOrderId:e.workOrderId,runId:e.runId,attemptNumber:1,inputCommit:start.commit,inputTree:start.tree,localSnapshotVersion:4,configuration:fx.configuration};
  const request={requestId:e.requestId,workId,workGeneration:1,repository:w.project.repository,deadline:DEADLINE,maxSpendUsd:n===1?0.325:0.65,
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
   delivery:{enabled:true,environment:w.project.environment,servedOrigin:'https://dashboard.example.test',projectSha256:w.binding.projectSha256,sourceSha256:w.binding.sourceSha256,
    priorRevision:async()=>({kind:'ABSENT',authenticationSha256:h('5')}),restorePointId:async()=>'rp-1',now:()=>new Date(),
    fetcher:async url=>{const p=new URL(url).pathname;log.served.push(p);const b=files['dist'+p];return b?new Response(b):new Response('',{status:404});}}},
  expectedFor:n=>fx.expectedByStage[n],resultKeys:[fx.key],sourceDigest:fx.sourceDigest,newAllowanceId:()=>randomUUID(),...over});
 return {custody,log,expectedHandoff,candidate:{commit:cand.commit,tree:cand.tree,buildArtifactSha256},stop:()=>new Promise(r=>{server.close(r);server.closeAllConnections?.();})};
}

/** Version-2 owner-local bundle + real loader. The ports provider builds custody PER derived request bundle: Sofie plans from the confirmed request text. */
function runtime(w,hn,{sofieCalls=[]}={}){
 const bundle={version:2,profile:'myeve.private-beta.owner/v1',installation:'owner-local',ownerId:w.owner,notAfter:new Date(Date.now()+3600e3).toISOString(),template:w.template,
  credentials:{accounting:'QDEV_ACCOUNTING_CREDENTIAL',relay:'QDEV_RELAY_CREDENTIAL',accountingDatabaseUrl:'QDEV_ACCOUNTING_DATABASE_URL',journalDatabaseUrl:'QDEV_JOURNAL_DATABASE_URL'},
  relay:{origin:'https://relay.example.test',grant:{connectionId:'synthetic-connection',repository:w.installation.repository,baseCommit:w.installation.inputCommit,outputBranch:w.installation.outputBranch,
   permissions:{metadata:'read',contents:'write',actions:'read',deployments:'read'},repositoryAdmin:false,workflowEdit:false,productionDeployment:false}},
  conversation:{deliveryUrl:'https://owner.example.test/app'}};
 const env={MYEVE_QDEV_ENABLED:'true',MYEVE_QDEV_HOST_BUNDLE:JSON.stringify(bundle),QDEV_ACCOUNTING_CREDENTIAL:w.t1,QDEV_RELAY_CREDENTIAL:'relay-secret-'+randomBytes(8).toString('hex'),
  QDEV_ACCOUNTING_DATABASE_URL:'postgres://accounting.invalid/a',QDEV_JOURNAL_DATABASE_URL:'postgres://journal.invalid/j',QDEV_VERIFIER_CREDENTIAL:CRED};
 const fetcher=async(url,init)=>{const body=JSON.parse(init.body);
  const result=body.method==='initialize'?{protocolVersion:'2024-11-05'}:{tools:[{name:'relay_github_repo_get'},{name:'relay_github_deploy_prod'}]};
  return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,result}),{status:200});};
 const contexts=[];
 // MOCK Sofie model (scripted, zero cost). The REAL SofiePlanningRuntime receives the confirmed request from the derived bundle.
 const sofieModel={async step(input){sofieCalls.push(input);return {messages:[{role:'assistant',content:[{type:'text',text:'plan ready'}]}],toolCalls:[],usage:{inputTokens:100,outputTokens:10}};},
  toolResult:(call,outcome)=>({role:'tool',content:[{callId:call.id,outcome}]})};
 const ports=async context=>{
  contexts.push(context.bundle);
  const sofie=new SofiePlanningRuntime({model:sofieModel,price:{inputMicrousdPerMillionTokens:3_000_000,outputMicrousdPerMillionTokens:15_000_000},
   request:context.bundle.conversation.approvedRequest,system:'You are Sofie.'});
  return composeRuntimePorts(context,{...hn.custody(),agent:{slot:'Q1',factoryCoding:{sofie}}});
 };
 const source=createRuntimeHostSource({env,fetcher,database:url=>url.includes('accounting')?{query:async(q,p)=>(await w.rt.query(q,p)).rows}:{query:async(q,p)=>(await w.db.query(q,p)).rows},ports});
 return {env,source,host:assembleQualificationHost(source),contexts,sofieCalls};
}
const principalFor=(id,attributes={owner:'true'})=>({principalId:id,principalType:'user',authenticator:'myeve-web-session',attributes});
const textOf=r=>r.content.filter(p=>p.type==='text').map(p=>p.text).join('');
const TOOLS=[{type:'function',name:'qualification_journey',inputSchema:{type:'object'}}];

try{
 await test('owner-local: an arbitrary owner request is proposed, confirmed and run through the actual Eve agent + tool + root + real composition to a PRIVATE_BETA_LOCAL result',async()=>{
  const w=await world('ok'),hn=await harness(w),previousFlag=process.env.MYEVE_QDEV_ENABLED,originalFetch=globalThis.fetch;
  let forbiddenEgress=0;
  try{
   process.env.MYEVE_QDEV_ENABLED='true';
   globalThis.fetch=async(input,init)=>{const url=new URL(input instanceof Request?input.url:String(input));
    if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'){forbiddenEgress++;throw Error('UNEXPECTED_PROVIDER_EGRESS');}return originalFetch(input,init);};
   await w.db.query(JOURNAL_SCHEMA);
   const r=runtime(w,hn);
   const [{default:agent},{default:toolDefinition}]=await Promise.all([import('../agent/agent.ts'),import('../agent/tools/qualification_journey.ts')]);
   registerQualificationHost(r.host);
   const principal=principalFor(w.owner);
   const context={session:{id:randomUUID(),auth:{current:principal,initiator:principal}},messages:[]};
   const selected=await agent.model.events['step.started']({},context);
   const user={role:'user',content:[{type:'text',text:REQUEST}]};
   // Turn 1: a proposal only. Nothing is reserved, derived ports are not built, nothing is dispatched.
   const proposal=await selected.model.doGenerate({prompt:[user],tools:TOOLS});
   assert.equal(proposal.finishReason.unified,'stop');
   const proposed=textOf(proposal);assert.match(proposed,new RegExp(`\\[plan ${w.derived.planSha256}\\]`));assert.match(proposed,/PRIVATE_BETA_LOCAL/);
   assert.equal(await count(w,'qdev_work'),0);assert.equal(r.contexts.length,0);
   // Turn 2: the owner confirms the exact digest; the deterministic model selects the tool with the request and digest.
   const confirm={role:'user',content:[{type:'text',text:'confirm '+w.derived.planSha256.slice(0,12)}]};
   const history=[user,{role:'assistant',content:[{type:'text',text:proposed}]},confirm];
   const requested=await selected.model.doGenerate({prompt:history,tools:TOOLS});
   assert.equal(requested.finishReason.unified,'tool-calls');
   const call=requested.content.find(p=>p.type==='tool-call');
   assert.deepEqual(JSON.parse(call.input),{request:REQUEST,planSha256:w.derived.planSha256});
   const tool=await toolDefinition.events['step.started']({},context);assert.ok(tool);
   const out=await tool.execute(JSON.parse(call.input),context);
   assert.equal(out.status,'COMPLETED_UNCLAIMED',JSON.stringify(out));assert.equal(out.assurance,'PRIVATE_BETA_LOCAL');assert.equal(out.authority,'NONE');assert.equal(out.stages.length,4);
   // The derived bundle carried the confirmed request into the ports; Sofie planned from exactly that text.
   assert.equal(r.contexts.length,1);assert.equal(r.contexts[0].conversation.approvedRequest,REQUEST);assert.equal(r.contexts[0].project.profile,'myeve.private-beta.owner/v1');
   assert.equal(r.sofieCalls[0].messages[0].content[0].text,REQUEST);
   // Accounting: five charged operations on the derived cohort's four Works, each Work bound to the request-derived stage id.
   assert.equal(await count(w,'qdev_work'),4);assert.equal(await count(w,'qdev_dispatch'),5);
   assert.equal((await w.db.query("SELECT count(*)::int n FROM qdev_dispatch WHERE state<>'SETTLED'")).rows[0].n,0);
   const bindings=(await w.db.query('SELECT binding_sha256 FROM qdev_work ORDER BY ordinal')).rows.map(x=>x.binding_sha256);
   assert.deepEqual(bindings,[1,2,3,4].map(n=>digest(`myeve.private-beta.owner/v1:${w.derived.planSha256}:stage:${n}`)));
   assert.ok((await w.db.query('SELECT cohort_id FROM qdev_work')).rows.every(x=>x.cohort_id===w.derived.policy.cohortId));
   // Factory (MOCK HTTP): every Factory-run stage dispatched exactly once through the real ordered clients.
   assert.equal(hn.log.factory.filter(c=>/POST .*\/dispatch$/.test(c)).length,3);
   assert.deepEqual(hn.log.verifier.map(v=>v.url),['/qdev/v1/handoff','/qdev/v1/evaluate','/qdev/v1/verdict']);
   assert.equal(hn.log.verifier[0].body.protectedSpecificationSha256,w.project.protectedSpecificationSha256);
   // Turn 3: Sofie's result text surfaces the local assurance and never claims independent custody.
   const answer=await selected.model.doGenerate({prompt:[...history,{role:'assistant',content:[call]},{role:'tool',content:[{type:'tool-result',toolCallId:call.toolCallId,toolName:call.toolName,output:{type:'json',value:out}}]}],tools:TOOLS});
   const said=textOf(answer);
   assert.match(said,/The confirmed request completed all four stages/);assert.match(said,/PRIVATE_BETA_LOCAL/);assert.match(said,/NOT independent custody/);assert.doesNotMatch(said,/Independent verdict/);
   assert.equal(forbiddenEgress,0);
   // A tester (non-owner) principal never receives the tool or a model.
   const tester=principalFor(randomUUID(),{owner:'false'});
   assert.equal(qdevRequestOwner({auth:{current:tester,initiator:tester}}),null);
   assert.equal(await toolDefinition.events['step.started']({},{session:{id:randomUUID(),auth:{current:tester,initiator:tester}},messages:[]}),null);
  }finally{
   globalThis.fetch=originalFetch;if(previousFlag===undefined)delete process.env.MYEVE_QDEV_ENABLED;else process.env.MYEVE_QDEV_ENABLED=previousFlag;
   await hn.stop();
  }
 });

 await test('a local verifier that signs INDEPENDENT halts at stage 4: no PASS presented, no delivery observed',async()=>{
  const w=await world('ind'),hn=await harness(w,{verdictMode:'claimsIndependent'});try{
   await w.db.query(JOURNAL_SCHEMA);
   const r=runtime(w,hn);
   const out=await new QualificationRoot(r.host).run({ownerId:w.owner,kind:'human'},{request:REQUEST,planSha256:w.derived.planSha256});
   assert.equal(out.status,'HALTED');assert.equal(out.haltedAt,4);assert.match(out.code,/QDEV_VERDICT_ASSURANCE/);
   assert.equal(out.verdictSha256,undefined);assert.equal(out.deliverySha256,undefined);assert.equal(hn.log.served.length,0);
  }finally{await hn.stop();}
 });

 await test('a request whose derived cohort the operator has not issued is refused by the ledger before any provider or Factory contact',async()=>{
  const w=await world('unissued',{issueFor:'Build me something else entirely, a todo list app.'}),hn=await harness(w);try{
   await w.db.query(JOURNAL_SCHEMA);
   const r=runtime(w,hn);
   const out=await new QualificationRoot(r.host).run({ownerId:w.owner,kind:'human'},{request:REQUEST,planSha256:deriveOwnerJourney({ownerId:w.owner,template:w.template,request:REQUEST}).planSha256});
   assert.equal(out.status,'HALTED');assert.equal(out.haltedAt,1);
   assert.equal(await count(w,'qdev_work'),0);assert.equal(hn.log.factory.length,0);assert.equal(hn.log.verifier.length,0);assert.equal(r.sofieCalls.length,0);
  }finally{await hn.stop();}
 });

 await test('an unconfirmed digest or a frozen-style no-argument call is refused before anything is built, reserved or contacted',async()=>{
  const w=await world('mismatch'),hn=await harness(w);try{
   await w.db.query(JOURNAL_SCHEMA);
   const r=runtime(w,hn),rootRun=new QualificationRoot(r.host),owner={ownerId:w.owner,kind:'human'};
   const code=async(p,c)=>assert.rejects(p,e=>e instanceof QualificationRootRefused&&e.code===c);
   await code(rootRun.run(owner,{request:REQUEST,planSha256:h('9')}),'QDEV_ROOT_REQUEST_MISMATCH');
   await code(rootRun.run(owner,{request:REQUEST+' Also add a dark mode.',planSha256:w.derived.planSha256}),'QDEV_ROOT_REQUEST_MISMATCH');
   await code(rootRun.run(owner),'QDEV_ROOT_REQUEST_REQUIRED');
   await code(rootRun.run({ownerId:randomUUID(),kind:'human'},{request:REQUEST,planSha256:w.derived.planSha256}),'QDEV_ROOT_UNCONFIGURED');
   assert.equal(r.contexts.length,0);assert.equal(await count(w,'qdev_work'),0);assert.equal(hn.log.factory.length+hn.log.verifier.length,0);
  }finally{await hn.stop();}
 });
}finally{
 for(const c of clients)await c.end().catch(()=>{});
 for(const n of names)await admin.query('DROP DATABASE IF EXISTS '+n+' WITH (FORCE)');
 for(const r of roles)await admin.query('DROP ROLE IF EXISTS '+r);
 await admin.end();
}
