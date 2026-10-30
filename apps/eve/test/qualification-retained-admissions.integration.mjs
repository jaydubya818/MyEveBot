/** Durable stage-admission retention over disposable PostgreSQL. Synthetic Factory identity only; no network, provider or spend.
 * Run: MYEVE_ISOLATED_COHORT_TEST_DATABASE=postgres://postgres@127.0.0.1:PORT/postgres node --import tsx --test apps/eve/test/qualification-retained-admissions.integration.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {DurableStageAdmitter,RetainedAdmissionRefused,RETAINED_ADMISSION_SCHEMA} from '../lib/qualification/retained-admissions.ts';
import {syntheticFactory} from './qualification-synthetic.mjs';

const connection=process.env.MYEVE_ISOLATED_COHORT_TEST_DATABASE;
assert(connection,'Dedicated localhost PostgreSQL fixture URL required; never use DATABASE_URL');
const root=new URL(connection);
assert(['localhost','127.0.0.1'].includes(root.hostname)&&root.pathname==='/postgres','Dedicated localhost admin database required');
const admin=new Client({connectionString:connection});await admin.connect();
const name='myeve_qdev_ra_'+randomBytes(6).toString('hex');
await admin.query('CREATE DATABASE '+name);
const u=new URL(root);u.pathname='/'+name;
const db=new Client({connectionString:u.href});await db.connect();await db.query(RETAINED_ADMISSION_SCHEMA);
const sql={query:async(q,p)=>(await db.query(q,p)).rows};

const fx=syntheticFactory(),s=fx.stage(1,fx.baseline),e=s.manifest.execution;
const raw=()=>({workId:randomUUID(),workVersion:1,workGeneration:1,criteriaVersion:1,agentId:'synthetic-agent',factoryId:fx.factoryId,factoryVersion:fx.factoryVersion,
  requestId:e.requestId,requestDigest:e.requestDigest,sourceDigest:fx.sourceDigest,configurationDigest:fx.configurationDigest,workOrderId:e.workOrderId,runId:e.runId,attemptNumber:1,
  inputCommit:e.inputCommit,inputTree:e.inputTree,localSnapshotVersion:4,configuration:fx.configuration});
function admission(){
  const binding=raw();
  const request={requestId:e.requestId,workId:binding.workId,workGeneration:1,repository:'synthetic/repo',deadline:'2099-01-01T00:00:00.000Z',maxSpendUsd:1,
    input:{baseRef:e.inputCommit,allowedPaths:fx.configuration.allowedPaths}};
  const identity={runId:randomUUID(),writerGeneration:1,dispatchIdentity:'d',workId:binding.workId,workGeneration:1,factoryId:fx.factoryId,factoryVersion:fx.factoryVersion,requestId:e.requestId,
    workOrderId:e.workOrderId,remoteRunId:e.runId,repository:request.repository,baseSha:e.inputCommit,allowedPaths:request.input.allowedPaths,deadline:request.deadline};
  return {binding,identity,request};
}
const innerFor=(calls,make=admission)=>({retained:async stage=>{calls.push(stage);return make();}});

try{
 await test('first admission prepares once, persists, and is returned identically after a restart without calling the inner admitter',async()=>{
  const journey='j-'+randomUUID(),calls=[];
  const a=new DurableStageAdmitter({db:sql,journeyId:journey,inner:innerFor(calls)});
  const first=await a.retained(1);
  assert.deepEqual(calls,[1]);
  const restarted=new DurableStageAdmitter({db:sql,journeyId:journey,inner:innerFor(calls)});
  assert.deepEqual(await restarted.retained(1),first);
  assert.deepEqual(await a.retained(1),first);
  assert.deepEqual(calls,[1],'never prepared again');
  assert.equal((await db.query('SELECT count(*)::int n FROM qdev_retained_admission WHERE journey_id=$1',[journey])).rows[0].n,1);
 });

 await test('concurrent callers in one process share one preparation; concurrent processes cannot both prepare',async()=>{
  const journey='j-'+randomUUID(),calls=[];
  const slow={retained:async stage=>{calls.push(stage);await new Promise(r=>setTimeout(r,50));return admission();}};
  const a=new DurableStageAdmitter({db:sql,journeyId:journey,inner:slow});
  const same=await Promise.all([a.retained(2),a.retained(2),a.retained(2)]);
  assert.equal(calls.length,1);assert.ok(same.every(x=>JSON.stringify(x)===JSON.stringify(same[0])));
  const j2='j-'+randomUUID(),calls2=[];
  const p1=new DurableStageAdmitter({db:sql,journeyId:j2,inner:{retained:async stage=>{calls2.push('p1');await new Promise(r=>setTimeout(r,80));return admission();}}});
  const p2=new DurableStageAdmitter({db:sql,journeyId:j2,inner:{retained:async stage=>{calls2.push('p2');return admission();}}});
  const results=await Promise.allSettled([p1.retained(1),(async()=>{await new Promise(r=>setTimeout(r,20));return p2.retained(1);})()]);
  assert.deepEqual(calls2,['p1'],'only the claimant prepared');
  assert.equal(results[0].status,'fulfilled');
  assert.ok(results[1].status==='rejected'&&results[1].reason instanceof RetainedAdmissionRefused&&results[1].reason.code==='QDEV_RETAINED_ADMISSION_PENDING');
  assert.equal((await new DurableStageAdmitter({db:sql,journeyId:j2,inner:innerFor([])}).retained(1)).request.requestId,results[0].value.request.requestId);
 });

 await test('a claim with no admission (crash or failed preparation) is fenced: PENDING forever, never re-prepared',async()=>{
  const journey='j-'+randomUUID(),calls=[];
  await assert.rejects(new DurableStageAdmitter({db:sql,journeyId:journey,inner:{retained:async()=>{calls.push('a');throw new Error('terminal declined');}}}).retained(3),/terminal declined/);
  for(let i=0;i<2;i++)
   await assert.rejects(new DurableStageAdmitter({db:sql,journeyId:journey,inner:innerFor(calls)}).retained(3),e2=>e2 instanceof RetainedAdmissionRefused&&e2.code==='QDEV_RETAINED_ADMISSION_PENDING');
  assert.deepEqual(calls,['a']);
 });

 await test('an inner admission that is inconsistent is refused before it is stored',async()=>{
  const journey='j-'+randomUUID();
  const bad=[a=>({...a,identity:{...a.identity,requestId:'other'}}),a=>({...a,request:{...a.request,workId:randomUUID()}}),a=>({...a,binding:{...a.binding,runId:'not-a-uuid'}}),a=>({...a,extra:1})];
  for(const [i,mutate] of bad.entries()){
   const j=journey+'-'+i;
   await assert.rejects(new DurableStageAdmitter({db:sql,journeyId:j,inner:{retained:async()=>mutate(admission())}}).retained(1),e2=>e2 instanceof RetainedAdmissionRefused&&e2.code==='QDEV_RETAINED_ADMISSION_INVALID');
   assert.equal((await db.query('SELECT count(*)::int n FROM qdev_retained_admission WHERE journey_id=$1',[j])).rows[0].n,0);
  }
 });

 await test('storage is append-only and a tampered stored row is refused, never repaired; stages are limited to 1-3',async()=>{
  const journey='j-'+randomUUID(),calls=[];
  const a=new DurableStageAdmitter({db:sql,journeyId:journey,inner:innerFor(calls)});await a.retained(1);
  await assert.rejects(db.query('UPDATE qdev_retained_admission SET admission=$2::jsonb WHERE journey_id=$1',[journey,'{}']),/QDEV_RETENTION_IMMUTABLE/);
  await assert.rejects(db.query('DELETE FROM qdev_retained_admission WHERE journey_id=$1',[journey]),/QDEV_RETENTION_IMMUTABLE/);
  await assert.rejects(db.query('DELETE FROM qdev_admission_claim WHERE journey_id=$1',[journey]),/QDEV_RETENTION_IMMUTABLE/);
  // a row written around the application (e.g. restored from a foreign backup) must not be trusted
  const j2='j-'+randomUUID();
  await db.query('INSERT INTO qdev_retained_admission(journey_id,stage,admission) VALUES($1,1,$2::jsonb)',[j2,JSON.stringify({...admission(),identity:{...admission().identity,requestId:'forged'}})]);
  await assert.rejects(new DurableStageAdmitter({db:sql,journeyId:j2,inner:innerFor(calls)}).retained(1),e2=>e2 instanceof RetainedAdmissionRefused&&e2.code==='QDEV_RETAINED_ADMISSION_INVALID');
  for(const stage of [0,4,1.5,'1'])await assert.rejects(a.retained(stage),e2=>e2 instanceof RetainedAdmissionRefused&&e2.code==='QDEV_RETAINED_ADMISSION_STAGE');
  assert.throws(()=>new DurableStageAdmitter({db:sql,journeyId:'',inner:innerFor([])}),RetainedAdmissionRefused);
 });
}finally{
 await db.end();await admin.query('DROP DATABASE IF EXISTS '+name+' WITH (FORCE)');await admin.end();
}
