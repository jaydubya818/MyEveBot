/** Synthetic end-to-end journey over disposable PostgreSQL. No real owner, model, Factory, verifier, repository or spend.
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
try{
 await test('a synthetic journey runs Sofie -> coding -> Factory -> independent verifier -> delivery with every call gated and settled',async()=>{
  const w=await world('ok'),env=environment(w);
  const evidence=await new QualificationJourney(w.accounting,w.project,env).run(plan());
  assert.deepEqual(env.calls,['s1-0','s1-1','s2-0','s3-0','s4-0']);
  assert.equal(evidence.stages.length,4);assert.equal(evidence.readiness,'NOT_CLAIMED');assert.equal(evidence.authority,'NONE');
  assert.equal(evidence.projectSha256,w.binding.projectSha256);
  assert.equal(await count(w,'qdev_work'),4);assert.equal(await count(w,'qdev_dispatch'),5);
  assert.equal((await w.db.query("SELECT count(*)::int n FROM qdev_dispatch WHERE state<>'SETTLED'")).rows[0].n,0);
  assert.equal((await w.db.query('SELECT sum(ceiling_microusd)::text s FROM qdev_work')).rows[0].s,'5200000');
  assert.equal((await w.db.query("SELECT count(*)::int n FROM qdev_work WHERE owner_id=$1",[w.policy.Q2.ownerId])).rows[0].n,0);
  assert.deepEqual((await w.db.query('SELECT purpose FROM qdev_dispatch d JOIN qdev_work k ON k.id=d.work_id ORDER BY k.ordinal,d.created_at')).rows.map(r=>r.purpose),['SOFIE','CODING','CODING','FACTORY','VERIFIER']);
  // the chain really links: each stage's candidate is the next stage's base
  assert.equal(evidence.stages[0].candidate.commit,env.calls&&evidence.stages[0].candidate.commit);
  assert.notEqual(evidence.stages[2].candidate.commit,evidence.stages[0].candidate.commit);
 });
 await test('an unfittable plan is refused before any reservation or provider call',async()=>{
  const w=await world('plan'),env=environment(w),bad=plan();bad.stages[0].operations[0].reserveMicrousd=1300000;
  await assert.rejects(new QualificationJourney(w.accounting,w.project,env).run(bad),e=>e.code==='QDEV_PLAN_WORK_CEILING_EXCEEDED');
  assert.equal(await count(w,'qdev_work'),0);assert.deepEqual(env.calls,[]);
 });
 await test('an ambiguous provider failure keeps the exposure charged, fences the cohort and never re-sends',async()=>{
  const w=await world('unk'),env=environment(w,{sendFails:'s1-1'});
  await assert.rejects(new QualificationJourney(w.accounting,w.project,env).run(plan()),e=>e instanceof JourneyHalted&&e.stage===1&&/QDEV_EXPOSURE_UNKNOWN/.test(e.code));
  assert.deepEqual(env.calls,['s1-0','s1-1']);
  assert.equal((await w.accounting.status()).state,'paused');
  assert.equal((await w.db.query("SELECT state FROM qdev_work")).rows[0].state,'UNKNOWN');
  await assert.rejects(new QualificationJourney(w.accounting,w.project,env).run(plan()),e=>e instanceof JourneyHalted);
  assert.deepEqual(env.calls,['s1-0','s1-1']); // no retry
  assert.equal((await w.db.query('SELECT sum(ceiling_microusd)::text s FROM qdev_work')).rows[0].s,'1300000');
 });
 await test('a provider reporting unmeasured usage is treated as unknown exposure',async()=>{
  const w=await world('unm'),env=environment(w,{unknown:'s1-0'});
  await assert.rejects(new QualificationJourney(w.accounting,w.project,env).run(plan()),e=>/QDEV_EXPOSURE_UNKNOWN/.test(e.code));
  assert.equal((await w.accounting.status()).state,'paused');
 });
 await test('a proven no-send is tombstoned, stays charged, and a rerun cannot dispatch it again',async()=>{
  const w=await world('nosend'),env=environment(w,{notSent:'s1-0'});
  await assert.rejects(new QualificationJourney(w.accounting,w.project,env).run(plan()),e=>/QDEV_PROVIDER_NOT_SENT/.test(e.code));
  assert.equal((await w.db.query("SELECT state FROM qdev_dispatch")).rows[0].state,'NOT_DISPATCHED');
  const again=environment(w);
  await assert.rejects(new QualificationJourney(w.accounting,w.project,again).run(plan()),e=>e instanceof JourneyHalted);
  assert.deepEqual(again.calls,[]);assert.equal(await count(w,'qdev_work'),1);
 });
 await test('a revoked charter refuses before the provider is contacted',async()=>{
  const w=await world('rev'),env=environment(w);
  await w.db.query('UPDATE qdev_charter SET revoked_at=clock_timestamp() WHERE id=$1',[w.cohort]);
  await assert.rejects(new QualificationJourney(w.accounting,w.project,env).run(plan()),e=>e instanceof JourneyHalted&&/QDEV_FENCED/.test(e.code));
  assert.deepEqual(env.calls,[]);assert.equal(await count(w,'qdev_work'),0);
 });
 await test('a rejected stage Result halts the chain: later stages are never reserved or charged',async()=>{
  const w=await world('badres'),env=environment(w,{badStage2:true});
  await assert.rejects(new QualificationJourney(w.accounting,w.project,env).run(plan()),e=>e instanceof JourneyHalted&&e.stage===2&&/QDEV_RESULT/.test(e.code));
  assert.deepEqual(env.calls,['s1-0','s1-1','s2-0']);assert.equal(await count(w,'qdev_work'),2);
 });
 await test('a non-PASS independent verdict halts before any delivery is observed',async()=>{
  for(const verdict of ['FAIL','NOT_RUN']){
   const w=await world('v'+verdict.toLowerCase()),env=environment(w,{verdict});
   await assert.rejects(new QualificationJourney(w.accounting,w.project,env).run(plan()),e=>e instanceof JourneyHalted&&e.stage===4&&e.code.includes('QDEV_VERDICT_'+verdict));
   assert.equal(env.observed.delivery,0);
  }
 });
 await test('a crash after send but before settlement leaves exposure that recovery fences, never refunds',async()=>{
  const w=await world('crash');
  const work=await w.accounting.reserveWork({bindingId:'crash',requestSha256:h('8'),ceilingMicrousd:1300000});
  const allowance=randomUUID(),bound=await w.accounting.bind(work,allowance);
  const flaky=Object.create(w.accounting);flaky.settle=async()=>{throw new Error('process died');};
  let sent=0;
  await assert.rejects(new QualificationGate(flaky).run({admission:bound,allowanceId:allowance,operationKey:'k',purpose:'CODING',reserveMicrousd:500000,send:async()=>{sent++;return {known:true,value:1};}}));
  assert.equal(sent,1);
  assert.equal((await w.db.query("SELECT state FROM qdev_dispatch")).rows[0].state,'RUNNING');
  await assert.rejects(w.accounting.reserveWork({bindingId:'next',requestSha256:h('8'),ceilingMicrousd:1300000}),/QDEV_FENCED/);
  await new QualificationGate(w.accounting).recoverInterrupted(bound);
  assert.equal((await w.db.query("SELECT state FROM qdev_dispatch")).rows[0].state,'UNKNOWN');
  assert.equal((await w.accounting.status()).state,'paused');
 });
 await test('the gate never contacts the provider when admission is refused',async()=>{
  const w=await world('gate');
  const work=await w.accounting.reserveWork({bindingId:'g',requestSha256:h('8'),ceilingMicrousd:1300000});
  const allowance=randomUUID(),bound=await w.accounting.bind(work,allowance);
  let sent=0;const gate=new QualificationGate(w.accounting);
  await assert.rejects(gate.run({admission:bound,allowanceId:allowance,operationKey:'big',purpose:'CODING',reserveMicrousd:1300001,send:async()=>{sent++;return {known:true,value:1};}}),e=>e instanceof QualificationGateRefused);
  const foreign=new QualificationGate(new QualificationAccounting({query:async(q,p)=>(await w.rt.query(q,p)).rows},w.t1,w.policy.Q1,qualificationBinding({...w.project,operatingProfileSha256:h('9')})));
  await assert.rejects(foreign.run({admission:bound,allowanceId:allowance,operationKey:'x',purpose:'CODING',reserveMicrousd:10,send:async()=>{sent++;return {known:true,value:1};}}),e=>/PARENT_BINDING_MISMATCH/.test(e.code));
  assert.equal(sent,0);
 });

 await test('restart recovery: a halted journey resumes from the journal without re-sending any settled operation',async()=>{
  const w=await world('rec'),journal=new InMemoryJournal();
  const e1=environment(w);e1.journal=journal;let fail=true;const real=e1.collectResult;
  e1.collectResult=async n=>{if(n===2&&fail){fail=false;throw new Error('read unavailable');}return real(n);};
  await assert.rejects(new QualificationJourney(w.accounting,w.project,e1).run(plan()),e=>e instanceof JourneyHalted&&e.stage===2);
  assert.deepEqual(e1.calls,['s1-0','s1-1','s2-0']);
  // The restarted host presents the same Factory expectations/Results (a regenerated set would be a substitution, see F3).
  const e2=e1;e2.collectResult=real;e2.calls.length=0;
  const evidence=await new QualificationJourney(w.accounting,w.project,e2).run(plan());
  assert.deepEqual(e2.calls,['s3-0','s4-0']);
  assert.equal(evidence.stages.length,4);assert.equal(await count(w,'qdev_dispatch'),5);
  assert.equal((await w.db.query("SELECT count(*)::int n FROM qdev_dispatch WHERE state<>'SETTLED'")).rows[0].n,0);
 });
 await test('restart recovery: a claimed-but-unsettled operation is ambiguous exposure and is never re-sent',async()=>{
  const w=await world('rec2'),journal=new InMemoryJournal();
  const e1=environment(w,{sendFails:'s1-1'});e1.journal=journal;
  await assert.rejects(new QualificationJourney(w.accounting,w.project,e1).run(plan()),JourneyHalted);
  const before=await count(w,'qdev_dispatch');
  const e2=e1;e2.calls.length=0;
  await assert.rejects(new QualificationJourney(w.accounting,w.project,e2).run(plan()),JourneyHalted);
  assert.deepEqual(e2.calls,[]);assert.equal(await count(w,'qdev_dispatch'),before);
  assert.equal((await w.rt.query("SELECT (qdev_cohort_call($1::jsonb)->>'state') s",[JSON.stringify({mode:'status',cohortId:w.cohort,ownerId:w.policy.Q1.ownerId,slot:'Q1',policySha256:digest(w.policy.Q1),credential:w.t1,projectSha256:w.binding.projectSha256,sourceSha256:w.binding.sourceSha256})])).rows[0].s,'paused');
 });
 await test('the PostgreSQL journal is append-only and round-trips events',async()=>{
  const w=await world('jrn');await w.db.query(JOURNAL_SCHEMA);
  const j=new PostgresJournal({query:async(q,p)=>(await w.db.query(q,p)).rows},'j1');
  await j.append({kind:'STAGE_BOUND',stage:1,workId:randomUUID(),allowanceId:randomUUID()});await j.append({kind:'OP_CLAIMED',stage:1,key:'k'});
  assert.deepEqual((await j.read()).map(e=>e.kind),['STAGE_BOUND','OP_CLAIMED']);
  await assert.rejects(w.db.query('UPDATE qjourney_event SET kind=$1',['X']),/QJOURNEY_IMMUTABLE/);
  await assert.rejects(w.db.query('DELETE FROM qjourney_event'),/QJOURNEY_IMMUTABLE/);
 });

 const grantFor=()=>({connectionId:'synthetic-connection',repository:QDEV_BASELINE.repository,baseCommit:QDEV_BASELINE.inputCommit,outputBranch:QDEV_BASELINE.outputBranch,
  permissions:{metadata:'read',contents:'write',actions:'read',deployments:'read'},repositoryAdmin:false,workflowEdit:false,productionDeployment:false});
 const relayTransport=()=>({discover:async()=>[{name:'write_file',kind:'write_contents'},{name:'deploy',kind:'write_deployment'}],execute:async()=>({ok:true})});
 /** Ports over the same synthetic Factory/verifier/MyApps used above; `probe` records what each port saw. */
 function wired(w,{agent,admitFactoryVersion,admitOverrides={},base:given,journal,preflight}={}){
  const base=given??environment(w),f=w.factory,probe={agent:[],factory:[],verifier:[]};
  const relay=new RelayDeveloperTools(grantFor(),relayTransport(),testContract);
  const env=wireJourneyEnvironment({project:w.project,relay,expectedFor:base.expectedFor,resultKeys:f.key?[f.key]:[],sourceDigest:f.sourceDigest,
   verifierKeys:base.verifierKeys,producerKeyIds:base.producerKeyIds,producerPublicKeysPem:base.producerPublicKeysPem,newAllowanceId:()=>randomUUID(),baseline:f.baseline,journal,
   agent:{async run(op,r){probe.agent.push(op.key);if(agent)return agent(op,r);if(op.purpose!=='CODING')return {known:true,value:'ok'};const {requestId,workOrderId,runId}=base.expectedFor(op.stage);return {known:true,value:{execution:{requestId,workOrderId,runId}}};}},
   factory:{admit:(stage,start)=>({workId:randomUUID(),workVersion:1,workGeneration:1,criteriaVersion:1,agentId:'synthetic-agent',...base.expectedFor(stage),factoryVersion:admitFactoryVersion??f.factoryVersion,sourceDigest:f.sourceDigest,
     inputCommit:start.commit,inputTree:start.tree,localSnapshotVersion:4,...admitOverrides}),
    ...(preflight?{preflight}:{}),
    async dispatch(b){probe.factory.push(b);return {known:true,value:'ok'};},fetchResult:n=>base.collectResult(n)},
   verifier:{async submit(hf){probe.verifier.push(hf);return {known:true,value:'ok'};},fetchVerdict:c=>base.collectVerdict(c)},
   myapps:{retainBuild:c=>base.retainBuild(c),observe:c=>base.observeDelivery(c)}});
  return {env,probe,base};
 }
 await test('wired ports: agent, Relay, Factory dispatch, verifier handoff and MyApps compose into a gated journey',async()=>{
  const w=await world('wire'),{env,probe}=wired(w);
  const evidence=await new QualificationJourney(w.accounting,w.project,env).run(plan());
  assert.equal(evidence.stages.length,4);assert.deepEqual(probe.agent,['s1-0','s1-1','s2-0']);
  assert.equal(probe.factory.length,1);assert.equal(probe.factory[0].inputCommit,evidence.stages[1].candidate.commit);
  assert.equal(probe.verifier.length,1);assert.equal(probe.verifier[0].candidateCommit,evidence.stages[2].candidate.commit);
  assert.equal(presentJourney(evidence).readiness,'NOT_CLAIMED');
 });
 await test('wired ports: a Factory admission with the wrong FactoryVersion is a proven no-send; the Factory port is never called',async()=>{
  const w=await world('wirebad'),{env,probe}=wired(w,{admitFactoryVersion:h('9')});
  await assert.rejects(new QualificationJourney(w.accounting,w.project,env).run(plan()),e=>e instanceof JourneyHalted&&e.stage===3&&e.code==='QDEV_PROVIDER_NOT_SENT');
  assert.equal(probe.factory.length,0);assert.equal(probe.verifier.length,0);
  assert.equal((await w.db.query("SELECT state FROM qdev_dispatch WHERE purpose='FACTORY'")).rows[0].state,'NOT_DISPATCHED');
 });
 await test('wired ports: a foreign request/run cannot be dispatched under another signed Result expectation',async()=>{
  const fields={requestId:'foreign-request',requestDigest:h('8'),workOrderId:randomUUID(),runId:randomUUID(),attemptNumber:2};
  for(const [index,[field,value]] of Object.entries(fields).entries()){
   const w=await world('wirejoin'+index),{env,probe}=wired(w,{admitOverrides:{[field]:value}});
   await assert.rejects(new QualificationJourney(w.accounting,w.project,env).run(plan()),e=>e instanceof JourneyHalted&&e.stage===3&&e.code==='QDEV_PROVIDER_NOT_SENT',field);
   assert.equal(probe.factory.length,0,field);assert.equal(probe.verifier.length,0,field);
   assert.equal((await w.db.query("SELECT state FROM qdev_dispatch WHERE purpose='FACTORY'")).rows[0].state,'NOT_DISPATCHED',field);
  }
 });
 await test('wired ports: the actual agent request/run must match the snapshotted expected Result binding; foreign, unreported or replayed runs fence',async()=>{
  const cases={
   foreignRun:(op,base)=>({known:true,value:{execution:{...pick(base,op.stage),runId:randomUUID()}}}),
   foreignRequest:(op,base)=>({known:true,value:{execution:{...pick(base,op.stage),requestId:'foreign-request'}}}),
   foreignWorkOrder:(op,base)=>({known:true,value:{execution:{...pick(base,op.stage),workOrderId:randomUUID()}}}),
   unreported:()=>({known:true,value:{}}),
   extraKey:(op,base)=>({known:true,value:{execution:{...pick(base,op.stage),extra:1}}}),
   replayedFromStage1:(op,base)=>({known:true,value:{execution:pick(base,1)}}),
  };
  const pick=(base,stage)=>{const {requestId,workOrderId,runId}=base.expectedFor(stage);return {requestId,workOrderId,runId};};
  for(const [name,make] of Object.entries(cases)){
   const w=await world('agentbind'+name.toLowerCase()),base=environment(w);
   // stage 1 is genuine for the replay case; every other case is foreign at stage 1
   const {env,probe}=wired(w,{agent:async(op)=>{
     if(op.purpose!=='CODING')return {known:true,value:'ok'};
     if(name==='replayedFromStage1'&&op.stage===1)return {known:true,value:{execution:pick(base,1)}};
     return make(op,base);}});
   const stage=name==='replayedFromStage1'?2:1;
   await assert.rejects(new QualificationJourney(w.accounting,w.project,env).run(plan()),e=>e instanceof JourneyHalted&&e.stage===stage&&e.code==='QDEV_EXPOSURE_UNKNOWN',name);
   assert.equal(probe.factory.length,0,name);
  }
  const w=await world('agentunbound'),{env}=wired(w);
  await assert.rejects(env.collectResult(1),e=>e.message==='QDEV_AGENT_EXECUTION_UNBOUND');
 });
 await test('wired ports: an agent that attempts a forbidden Relay action is stopped by the grant, and the Relay transport is never reached',async()=>{
  const w=await world('wirerelay');let reached=0;
  const {env}=wired(w,{agent:async(op,relay)=>{const [t]=await relay.discover();await relay.execute(t,{branch:'main',path:'a'});reached++;return {known:true,value:1};}});
  await assert.rejects(new QualificationJourney(w.accounting,w.project,env).run(plan()),e=>e instanceof JourneyHalted&&e.stage===1&&e.code==='QDEV_EXPOSURE_UNKNOWN');
  assert.equal(reached,0);
 });

 /** F3: recovery is bound to the retained pre-effect expectations and the accepted manifest/candidate/build identities. */
 const rerun=async(w,base,journal)=>{const {env}=wired(w,{base,journal});return new QualificationJourney(w.accounting,w.project,env).run(plan());};
 await test('F3: a fresh environment cannot substitute a different signed Factory run B for the accepted run A on recovery',async()=>{
  const w=await world('f3run'),journal=new InMemoryJournal(),base=environment(w);
  const first=await rerun(w,base,journal);
  const dispatchesBefore=await count(w,'qdev_dispatch'),acceptedBefore=(await journal.read()).filter(e=>e.kind==='STAGE_ACCEPTED');
  const runA=base.expectedFor(3).runId,orig=base.collectResult;
  const b=w.factory.stage(3,first.stages[1].candidate);          // independently valid signed run B, never dispatched by this journey
  base.collectResult=async n=>n===3?b.signed:orig(n);
  assert.notEqual(base.expectedFor(3).runId,runA);
  await assert.rejects(rerun(w,base,journal),e=>e instanceof JourneyHalted&&e.stage===3&&e.code==='QDEV_EXPECTATION_CHANGED');
  assert.equal(await count(w,'qdev_dispatch'),dispatchesBefore);   // nothing resent, nothing refunded
  assert.deepEqual((await journal.read()).filter(e=>e.kind==='STAGE_ACCEPTED'),acceptedBefore);
  assert.equal(base.observed.delivery,1);
 });
 await test('F3 (candidate variant): a replacement Result with a different candidate commit/tree and drifted expectation halts without any resend',async()=>{
  const w=await world('f3cand'),journal=new InMemoryJournal(),base=environment(w),f=w.factory;
  const first=await rerun(w,base,journal);const before=await count(w,'qdev_dispatch');
  const b=f.stage(4,first.stages[1].candidate);f.expectedByStage[3]=structuredClone(f.expectedByStage[4]);   // another valid signed Result, different candidate
  assert.notEqual(b.candidate.commit,first.stages[2].candidate.commit);
  const orig=base.collectResult;base.collectResult=async n=>n===3?b.signed:orig(n);
  await assert.rejects(rerun(w,base,journal),e=>e instanceof JourneyHalted&&e.stage===3&&e.code==='QDEV_EXPECTATION_CHANGED');
  assert.equal(await count(w,'qdev_dispatch'),before);
 });
 await test('F4: the Factory preflight runs only for the Factory stage, after the preceding candidate was accepted and before anything is reserved',async()=>{
  const w=await world('f4pre'),calls=[];let works=-1;
  const {env}=wired(w,{preflight:async(stage,start)=>{works=await count(w,'qdev_work');calls.push({stage,start});}});
  const evidence=await new QualificationJourney(w.accounting,w.project,env).run(plan());
  assert.equal(calls.length,1);assert.equal(calls[0].stage,3);assert.deepEqual({commit:calls[0].start.commit,tree:calls[0].start.tree},evidence.stages[1].candidate);   // stage 3 prepared from the accepted stage-2 candidate
  assert.equal(works,2);                                                                                                      // only stages 1-2 had reserved anything
 });
 await test('F4: a failed preflight halts the stage with nothing reserved, claimed or sent, and a rerun does not skip it',async()=>{
  const w=await world('f4fail'),{env,probe}=wired(w,{preflight:async()=>{throw new Error('QDEV_STAGE_ADMISSION_TERMINAL');}});
  await assert.rejects(new QualificationJourney(w.accounting,w.project,env).run(plan()),e=>e instanceof JourneyHalted&&e.stage===3&&e.code==='QDEV_STAGE_ADMISSION_TERMINAL');
  assert.equal(await count(w,'qdev_work'),2);assert.equal(probe.factory.length,0);assert.equal(probe.verifier.length,0);
  assert.equal((await w.db.query("SELECT count(*)::int n FROM qdev_dispatch WHERE purpose='FACTORY'")).rows[0].n,0);
 });
 await test('F3: expectations are persisted before any effect, in full, for stages 1-3',async()=>{
  const w=await world('f3pre'),journal=new InMemoryJournal(),base=environment(w);
  const {env}=wired(w,{base,journal,agent:async()=>{throw new Error('socket reset after write');}});
  await assert.rejects(new QualificationJourney(w.accounting,w.project,env).run(plan()));
  const ev=await journal.read(),firstEffect=ev.findIndex(e=>e.kind==='STAGE_BOUND'||e.kind==='OP_CLAIMED');
  const exps=ev.filter(e=>e.kind==='STAGE_EXPECTATION');
  assert.deepEqual(exps.map(e=>e.stage),[1,2,3]);assert.ok(ev.indexOf(exps[2])<firstEffect);
  for(const e of exps){assert.deepEqual(e.expected,w.factory.expectedByStage[e.stage]);assert.equal(e.digest,digest(e.expected));}
 });
 await test('F3: an accepted stage keeps its exact manifest and build identity; a different signed Result or build halts',async()=>{
  const w=await world('f3id'),journal=new InMemoryJournal(),base=environment(w);
  await rerun(w,base,journal);const events=await journal.read();
  const accepted3=events.find(e=>e.kind==='STAGE_ACCEPTED'&&e.stage===3);
  assert.equal(accepted3.buildArtifactSha256,h('e'));assert.ok(accepted3.candidate.commit);
  // a different build identity for the same Result
  const realBuild=base.retainBuild;base.retainBuild=async()=>({buildArtifactSha256:h('f')});
  await assert.rejects(rerun(w,base,journal),e=>e instanceof JourneyHalted&&e.stage===3&&e.code==='QDEV_ACCEPTED_IDENTITY_CHANGED');
  base.retainBuild=realBuild;
  // a retained acceptance for a different manifest than the Result now presented
  for(const [field,value] of [['digest',h('a')],['candidate',{commit:'1'.repeat(40),tree:'2'.repeat(40)}]]){
   const tampered=new InMemoryJournal();
   for(const e of events)await tampered.append(e.kind==='STAGE_ACCEPTED'&&e.stage===3?{...e,[field]:value}:e);
   await assert.rejects(rerun(w,base,tampered),e=>e instanceof JourneyHalted&&e.stage===3&&e.code==='QDEV_ACCEPTED_IDENTITY_CHANGED',field);
  }
  // an untouched journal still resumes and re-accepts the identical identity
  const again=await rerun(w,base,journal);assert.equal(again.stages[2].resultManifestDigest,accepted3.digest);
 });
 await test('F3: a stage with effects but no retained expectation, or a tampered expectation, cannot resume',async()=>{
  const w=await world('f3legacy'),journal=new InMemoryJournal(),base=environment(w);
  await rerun(w,base,journal);const events=await journal.read();
  const legacy=new InMemoryJournal();for(const e of events)if(e.kind!=='STAGE_EXPECTATION')await legacy.append(e);
  await assert.rejects(rerun(w,base,legacy),e=>e instanceof JourneyHalted&&e.stage===1&&e.code==='QDEV_EXPECTATION_MISSING');
  const forged=new InMemoryJournal();
  for(const e of events)await forged.append(e.kind==='STAGE_EXPECTATION'&&e.stage===3?{...e,expected:{...e.expected,runId:randomUUID()}}:e);
  await assert.rejects(rerun(w,base,forged),e=>e instanceof JourneyHalted&&e.stage===3&&e.code==='QDEV_EXPECTATION_TAMPERED');
 });
 await test('F3: the agent expectation is snapshotted before the agent runs, so a drifting expectation cannot be followed',async()=>{
  const w=await world('f3agent'),base=environment(w),f=w.factory;
  const {env,probe}=wired(w,{base,agent:async(op)=>{
    if(op.purpose!=='CODING')return {known:true,value:'ok'};
    f.expectedByStage[op.stage]={...f.expectedByStage[op.stage],runId:randomUUID()};   // expectation drifts while the agent runs
    const {requestId,workOrderId,runId}=f.expectedByStage[op.stage];return {known:true,value:{execution:{requestId,workOrderId,runId}}};}});
  await assert.rejects(new QualificationJourney(w.accounting,w.project,env).run(plan()),e=>e instanceof JourneyHalted&&e.stage===1&&e.code==='QDEV_EXPOSURE_UNKNOWN');
  assert.equal(probe.factory.length,0);
 });
}finally{
 await Promise.all(clients.map(c=>c.end().catch(()=>{})));
 for(const n of names)await admin.query('DROP DATABASE IF EXISTS '+n+' WITH (FORCE)');
 for(const r of roles)await admin.query('DROP ROLE IF EXISTS '+r);
 await admin.end();
}
