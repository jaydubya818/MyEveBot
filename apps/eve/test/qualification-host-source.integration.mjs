/** Runtime host-source loader over disposable PostgreSQL, a fake Relay endpoint and synthetic ports. No real owner, model, Factory, verifier, repository or spend.
 * Run: MYEVE_ISOLATED_COHORT_TEST_DATABASE=postgres://postgres@127.0.0.1:PORT/postgres node --import tsx --test apps/eve/test/qualification-journey.integration.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {QualificationAccounting,qualificationBinding,QDEV_BASELINE} from '../lib/external-alpha/qualification-accounting.ts';
import {QualificationJourney,JourneyHalted} from '../lib/qualification/journey.ts';
import {wireJourneyEnvironment} from '../lib/qualification/wiring.ts';
import {RelayDeveloperTools} from '../lib/qualification/relay-tools.ts';
import {presentJourney} from '../lib/qualification/presentation.ts';
import {InMemoryJournal,PostgresJournal,JOURNAL_SCHEMA} from '../lib/qualification/journal.ts';
import {QualificationGate,ProviderNotSent,QualificationGateRefused} from '../lib/qualification/gate.ts';
import {syntheticFactory,syntheticVerifier,verdictFor,h,digest} from './qualification-synthetic.mjs';
import {QualificationRoot,QualificationRootRefused} from '../lib/qualification/root.ts';
import {DeepAgentAdapter} from '../lib/qualification/agent-port.ts';
import {testContract} from './qualification-relay-testing.mjs';

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
/** One disposable accounting DB + project parent for the given synthetic Factory identity. */
async function world(label){
 const factory=syntheticFactory(),verifier=syntheticVerifier();
 const project={...QDEV_BASELINE,operatingProfileSha256:h('1'),factoryVersionSha256:factory.factoryVersion,protectedSpecificationSha256:h('3'),
  sources:{myeve:'a'.repeat(40),factory:'b'.repeat(40),relay:'c'.repeat(40),missioncontrol:'d'.repeat(40)}};
 const binding=qualificationBinding(project);
 const name='myeve_qdev_j'+label+'_'+suffix,role='qdev_j'+label+'_'+suffix;names.push(name);roles.push(role);
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
 const rt=await connect(name,role),adapter={query:async(q,p)=>(await rt.query(q,p)).rows};
 const accounting=new QualificationAccounting(adapter,t1,policy.Q1,binding);
 return {factory,verifier,project,binding,db,rt,accounting,policy,cohort,t1};
}
const stage=(n,purposes,ceiling=1300000)=>({stage:n,workCeilingMicrousd:ceiling,operations:purposes.map((p,i)=>({key:`s${n}-${i}`,purpose:p,reserveMicrousd:Math.floor(ceiling/purposes.length/2)}))});
const plan=()=>({slot:'Q1',stages:[stage(1,['SOFIE','CODING']),stage(2,['CODING']),stage(3,['FACTORY']),stage(4,['VERIFIER'])]});
/** Synthetic providers, Factory, custodian and MyApps. `faults` selects injected failures. */
function environment(w,faults={}){
 const f=w.factory,calls=[],s1=f.stage(1,f.baseline),s2=f.stage(2,s1.candidate,{mutate:faults.badStage2?m=>{m.status='FAILED';m.candidate=null;m.evidence=[];m.artifacts=[];m.evidenceDigest=digest([]);m.artifactDigest=digest([]);}:undefined,dropArtifacts:faults.badStage2}),s3=f.stage(3,s2.candidate);
 const results={1:s1,2:s2,3:s3};
 const accepted=()=>({commit:s3.candidate.commit,tree:s3.candidate.tree,buildArtifactSha256:s3.manifest.artifactDigest});
 const env={
  calls,observed:{delivery:0,verdict:0},
  async runOperation(op){calls.push(op.key);if(faults.sendFails===op.key)throw new Error('socket reset after write');if(faults.notSent===op.key)throw new ProviderNotSent('rejected locally');if(faults.unknown===op.key)return {known:false};return {known:true,value:{ok:true}};},
  async collectResult(n){return results[n].signed;},
  expectedFor:n=>f.expectedByStage[n],resultKeys:()=>[f.key],sourceDigest:f.sourceDigest,baseline:f.baseline,
  async collectVerdict(c){env.observed.verdict++;return w.verifier.signVerdict(verdictFor({projectSha256:w.binding.projectSha256,sourceSha256:w.binding.sourceSha256,protectedSpecificationSha256:w.project.protectedSpecificationSha256,candidateCommit:c.commit,candidateTree:c.tree,buildArtifactSha256:c.buildArtifactSha256,outcome:faults.verdict??'PASS'}));},
  verifierKeys:[w.verifier.key],producerKeyIds:[f.key.keyId],producerPublicKeysPem:[f.producerPem],
  async retainBuild(){return {buildArtifactSha256:h('e')};},
  async observeDelivery(c){env.observed.delivery++;return {schema:'myeve.qualification-delivery/v1',environment:'myeve-qdev-20261029',projectSha256:w.binding.projectSha256,sourceSha256:w.binding.sourceSha256,candidateCommit:c.commit,candidateTree:c.tree,servedBytesSha256:h('e'),priorRevision:{kind:'ABSENT',authenticationSha256:h('7')},rollbackRestorePointId:'restore-synthetic',observedAt:'2026-10-27T00:10:00.000Z'};},
  newAllowanceId:()=>randomUUID(),
 };
 return env;
}
const count=async(w,table)=>(await w.db.query('SELECT count(*)::int n FROM '+table)).rows[0].n;
import {createRuntimeHostSource} from '../lib/qualification/host-source.ts';
import {assembleQualificationHost} from '../lib/qualification/host-bootstrap.ts';

try{
 const grantFor=()=>({connectionId:'synthetic-connection',repository:QDEV_BASELINE.repository,baseCommit:QDEV_BASELINE.inputCommit,outputBranch:QDEV_BASELINE.outputBranch,
  permissions:{metadata:'read',contents:'write',actions:'read',deployments:'read'},repositoryAdmin:false,workflowEdit:false,productionDeployment:false});
 const relayTransport=()=>({discover:async()=>[{name:'write_file',kind:'write_contents'},{name:'deploy',kind:'write_deployment'}],execute:async()=>({ok:true})});
 /** Ports over the same synthetic Factory/verifier/MyApps used above; `probe` records what each port saw. */
 function wired(w,{agent,admitFactoryVersion,admitOverrides={},base:given,journal,preflight}={}){
  const base=given??environment(w),f=w.factory,probe={agent:[],factory:[],verifier:[]};
  const relay=new RelayDeveloperTools(grantFor(),relayTransport(),testContract);
  const config={project:w.project,relay,expectedFor:base.expectedFor,resultKeys:f.key?[f.key]:[],sourceDigest:f.sourceDigest,
   verifierKeys:base.verifierKeys,producerKeyIds:base.producerKeyIds,producerPublicKeysPem:base.producerPublicKeysPem,newAllowanceId:()=>randomUUID(),baseline:f.baseline,journal,
   agent:{async run(op,r){probe.agent.push(op.key);if(agent)return agent(op,r);if(op.purpose!=='CODING')return {known:true,value:'ok'};const {requestId,workOrderId,runId}=base.expectedFor(op.stage);return {known:true,value:{execution:{requestId,workOrderId,runId}}};}},
   factory:{admit:(stage,start)=>({workId:randomUUID(),workVersion:1,workGeneration:1,criteriaVersion:1,agentId:'synthetic-agent',...base.expectedFor(stage),factoryVersion:admitFactoryVersion??f.factoryVersion,sourceDigest:f.sourceDigest,
     inputCommit:start.commit,inputTree:start.tree,localSnapshotVersion:4,...admitOverrides}),
    ...(preflight?{preflight}:{}),
    async dispatch(b){probe.factory.push(b);return {known:true,value:'ok'};},fetchResult:n=>base.collectResult(n)},
   verifier:{async submit(hf){probe.verifier.push(hf);return {known:true,value:'ok'};},fetchVerdict:c=>base.collectVerdict(c)},
   myapps:{retainBuild:c=>base.retainBuild(c),observe:c=>base.observeDelivery(c)}};
  const env=wireJourneyEnvironment(config);
  return {env,probe,base,config};
 }
 const APPROVED='Run the approved dashboard qualification';
 /** Runtime bundle + environment for a world; credentials are referenced by NAME, never embedded. */
 async function runtime(w,{mutate,envMutate,calls=[]}={}){
  await w.db.query(JOURNAL_SCHEMA);
  const bundle={version:1,ownerId:w.policy.Q1.ownerId,notAfter:new Date(Date.now()+3600e3).toISOString(),policy:w.policy.Q1,project:w.project,plan:plan(),
   credentials:{accounting:'QDEV_ACCOUNTING_CREDENTIAL',relay:'QDEV_RELAY_CREDENTIAL',accountingDatabaseUrl:'QDEV_ACCOUNTING_DATABASE_URL',journalDatabaseUrl:'QDEV_JOURNAL_DATABASE_URL'},
   relay:{origin:'https://relay.example.test',grant:grantFor()},conversation:{approvedRequest:APPROVED,deliveryUrl:'https://dashboard.example.test/app'}};
  if(mutate)mutate(bundle);
  const env={MYEVE_QDEV_ENABLED:'true',MYEVE_QDEV_HOST_BUNDLE:JSON.stringify(bundle),QDEV_ACCOUNTING_CREDENTIAL:w.t1,QDEV_RELAY_CREDENTIAL:'relay-secret-'+randomBytes(8).toString('hex'),
   QDEV_ACCOUNTING_DATABASE_URL:'postgres://accounting.invalid/a',QDEV_JOURNAL_DATABASE_URL:'postgres://journal.invalid/j'};
  if(envMutate)envMutate(env);
  const relayCalls=[];
  const fetcher=async(url,init)=>{
   const body=JSON.parse(init.body);relayCalls.push({url:String(url),auth:init.headers.authorization,method:body.method});
   const result=body.method==='initialize'?{protocolVersion:'2024-11-05'}:{tools:[{name:'relay_github_repo_get'},{name:'relay_github_deploy_prod'}]};
   return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,result}),{status:200});
  };
  const opened=[];
  const base=wired(w),{project,relay,journal,...ports}=base.config;
  const source=createRuntimeHostSource({env,fetcher,database:url=>{opened.push(url);return url.includes('accounting')?{query:async(q,p)=>(await w.rt.query(q,p)).rows}:{query:async(q,p)=>(await w.db.query(q,p)).rows};},
   ports:async()=>calls.push('ports')&&ports});
  return {env,source,relayCalls,opened,probe:base.probe,calls};
 }
 await test('loader: disabled by default — no switch, no bundle, or any incomplete credential yields null and opens nothing',async()=>{
  const w=await world('l1');
  for(const [label,envMutate] of [['switch',e=>{e.MYEVE_QDEV_ENABLED='false'}],['bundle',e=>{delete e.MYEVE_QDEV_HOST_BUNDLE}],['accounting credential',e=>{delete e.QDEV_ACCOUNTING_CREDENTIAL}],
   ['malformed accounting credential',e=>{e.QDEV_ACCOUNTING_CREDENTIAL='nope'}],['relay credential',e=>{delete e.QDEV_RELAY_CREDENTIAL}],['journal database',e=>{delete e.QDEV_JOURNAL_DATABASE_URL}],
   ['non-postgres database',e=>{e.QDEV_ACCOUNTING_DATABASE_URL='https://x.invalid'}],['malformed bundle',e=>{e.MYEVE_QDEV_HOST_BUNDLE='{'}]]){
   const r=await runtime(w,{envMutate});
   assert.equal(await r.source.material(w.policy.Q1.ownerId),null,label);assert.equal(r.opened.length>0&&label==='switch',false,label);
  }
  const none=createRuntimeHostSource({env:(await runtime(w)).env,database:()=>assert.fail('no database without an enrolled ports provider')});
  assert.equal(await none.material(w.policy.Q1.ownerId),null);          // complete bundle but no protected ports: stays disabled
  assert.equal(await count(w,'qdev_work'),0);assert.equal(await count(w,'qdev_dispatch'),0);
 });
 await test('loader: foreign owner, mismatched policy owner, expired bundle and tampered bundle are refused',async()=>{
  const w=await world('l2');
  const ok=await runtime(w);assert.ok(await ok.source.material(w.policy.Q1.ownerId));
  assert.equal(await ok.source.material(w.policy.Q2.ownerId),null);
  assert.equal(await (await runtime(w,{mutate:b=>{b.policy={...b.policy,ownerId:w.policy.Q2.ownerId};}})).source.material(w.policy.Q1.ownerId),null);
  assert.equal(await (await runtime(w,{mutate:b=>{b.notAfter=new Date(Date.now()-1000).toISOString();}})).source.material(w.policy.Q1.ownerId),null);
  assert.equal(await (await runtime(w,{mutate:b=>{b.extra=1;}})).source.material(w.policy.Q1.ownerId),null);
  assert.equal(await (await runtime(w,{mutate:b=>{b.relay.grant.productionDeployment=true;}})).source.material(w.policy.Q1.ownerId),null);
  assert.equal(await (await runtime(w,{mutate:b=>{b.conversation.deliveryUrl='http://insecure.example.test';}})).source.material(w.policy.Q1.ownerId).catch(()=>null),null);
  assert.equal(JSON.stringify(ok.env.MYEVE_QDEV_HOST_BUNDLE).includes(ok.env.QDEV_RELAY_CREDENTIAL),false);   // credentials are referenced by name only
 });
 await test('loader: enrolled material runs the real root, wiring and journey over PG, with the real Relay transport on a fake endpoint',async()=>{
  const w=await world('l3'),r=await runtime(w);
  const host=assembleQualificationHost(r.source),owner=w.policy.Q1.ownerId;
  assert.equal(host.enabled(),true);
  const config=await host.config(owner);assert.ok(config);assert.equal(config.ownerId,owner);assert.equal('conversation' in config,false);
  const tools=await config.relay.discover();                                // real RelayMcpTransport -> fake HTTPS endpoint; unmapped/forbidden tool invisible
  assert.deepEqual(tools.map(t=>t.name),['relay_github_repo_get']);
  assert.ok(r.relayCalls.length>=2&&r.relayCalls.every(c=>c.url==='https://relay.example.test/mcp'&&c.auth==='Bearer '+r.env.QDEV_RELAY_CREDENTIAL));
  const out=await new QualificationRoot(host).run({ownerId:owner,kind:'human'});
  assert.equal(out.status,'COMPLETED_UNCLAIMED');assert.equal(out.readiness,'NOT_CLAIMED');assert.equal(out.authority,'NONE');assert.equal(out.stages.length,4);
  assert.equal(await count(w,'qdev_dispatch'),5);
  assert.ok((await w.db.query('SELECT count(*)::int n FROM qjourney_event')).rows[0].n>0);   // the PG journal received the durable events
  assert.equal((await new QualificationRoot(host).run({ownerId:w.policy.Q2.ownerId,kind:'human'}).catch(e=>e.code)),'QDEV_ROOT_UNCONFIGURED');
 });
 await test('loader: the conversation model proposes only the approved tool, revalidates against the ledger, and fails closed when the cohort is paused or the bundle changes',async()=>{
  const w=await world('l4'),r=await runtime(w),owner=w.policy.Q1.ownerId,host=assembleQualificationHost(r.source);
  const conversation=await host.conversation(owner);assert.ok(conversation);assert.equal(conversation.ownerId,owner);
  const tool=[{type:'function',name:'qualification_journey',inputSchema:{type:'object',properties:{}}}];
  const model=conversation.model({sessionId:'s1',stepKey:'s1:0'});
  const first=await model.doGenerate({prompt:[{role:'user',content:[{type:'text',text:APPROVED}]}],tools:tool});
  assert.equal(first.finishReason.unified,'tool-calls');assert.equal(first.content[0].toolName,'qualification_journey');assert.equal(first.usage.inputTokens.total,0);
  const other=await model.doGenerate({prompt:[{role:'user',content:[{type:'text',text:'Build something else'}]}],tools:tool});
  assert.equal(other.finishReason.unified,'stop');
  assert.equal(await count(w,'qdev_work'),0);assert.equal(await count(w,'qdev_dispatch'),0);        // outer conversation spends and reserves nothing
  // revoke through the ledger's own charter state: the next generation is refused before any proposal
  assert.equal((await w.accounting.status()).state,'active');
  await w.db.query('UPDATE qdev_charter SET revoked_at=clock_timestamp() WHERE id=$1',[w.cohort]);
  assert.equal((await w.accounting.status()).state,'revoked');
  await assert.rejects(model.doGenerate({prompt:[{role:'user',content:[{type:'text',text:APPROVED}]}],tools:tool}),/QDEV_CONVERSATION_UNAVAILABLE/);
  await assert.rejects(model.doStream({prompt:[{role:'user',content:[{type:'text',text:APPROVED}]}],tools:tool}),/QDEV_CONVERSATION_UNAVAILABLE/);
  // a changed bundle (rotated/replaced at runtime) is no longer the admitted installation
  r.env.MYEVE_QDEV_HOST_BUNDLE=r.env.MYEVE_QDEV_HOST_BUNDLE.replace(w.cohort,randomUUID());
  await assert.rejects(model.doGenerate({prompt:[{role:'user',content:[{type:'text',text:APPROVED}]}],tools:tool}),/QDEV_CONVERSATION_UNAVAILABLE/);
  const replaced=await r.source.material(owner);                       // a replaced bundle is a new, unenrolled installation: the ledger itself refuses it
  await assert.rejects(replaced.accounting.status());
 });
}finally{
 await Promise.all(clients.map(c=>c.end().catch(()=>{})));
 for(const n of names)await admin.query('DROP DATABASE IF EXISTS '+n+' WITH (FORCE)');
 for(const r of roles)await admin.query('DROP ROLE IF EXISTS '+r);
 await admin.end();
}
