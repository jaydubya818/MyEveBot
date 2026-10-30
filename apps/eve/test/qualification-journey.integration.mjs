/** Synthetic end-to-end journey over disposable PostgreSQL. No real owner, model, Factory, verifier, repository or spend.
 * Run: MYEVE_ISOLATED_COHORT_TEST_DATABASE=postgres://postgres@127.0.0.1:PORT/postgres node --import tsx --test apps/eve/test/qualification-journey.integration.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {QualificationAccounting,qualificationBinding,QDEV_BASELINE} from '../lib/external-alpha/qualification-accounting.ts';
import {QualificationJourney,JourneyHalted} from '../lib/qualification/journey.ts';
import {QualificationGate,ProviderNotSent,QualificationGateRefused} from '../lib/qualification/gate.ts';
import {syntheticFactory,syntheticVerifier,verdictFor,h,digest} from './qualification-synthetic.mjs';

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
  async observeDelivery(c){env.observed.delivery++;return {schema:'myeve.qualification-delivery/v1',environment:'myeve-qdev-20261029',projectSha256:w.binding.projectSha256,sourceSha256:w.binding.sourceSha256,candidateCommit:c.commit,candidateTree:c.tree,servedBytesSha256:accepted().buildArtifactSha256,priorRevision:{kind:'ABSENT',authenticationSha256:h('7')},rollbackRestorePointId:'restore-synthetic',observedAt:'2026-10-27T00:10:00.000Z'};},
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
}finally{
 await Promise.all(clients.map(c=>c.end().catch(()=>{})));
 for(const n of names)await admin.query('DROP DATABASE IF EXISTS '+n+' WITH (FORCE)');
 for(const r of roles)await admin.query('DROP ROLE IF EXISTS '+r);
 await admin.end();
}
