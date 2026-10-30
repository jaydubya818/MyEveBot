/** StoreBackedStageSources on a disposable localhost PostgreSQL: real WorkStore, RoutingStore, SQL persistence and the real ordered FactoryStageAdmitter.
 * Fakes only at the Factory HTTP edge, MissionControl proof, route eligibility and the register/admit SQL function (the shared body is covered by the existing
 * writer integrations). No provider, spend, custody or tester authority.
 * Run: MYEVE_ISOLATED_COHORT_TEST_DATABASE=postgres://user@127.0.0.1:PORT/postgres node --import tsx --test apps/eve/test/qualification-stage-store-sources.integration.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {Client,Pool} from 'pg';
import {loadMigrations,runMigrations} from '../scripts/migration-runner.ts';
import {WorkStore} from '../lib/engineering/store.ts';
import {canonicalAlphaTasksWork} from '../lib/external-alpha/work-tuple.ts';
import {StoreBackedStageSources,StageSourcesRefused} from '../lib/qualification/factory-stage-store-sources.ts';
import {FactoryStageAdmitter,FactoryStageAdmissionRefused} from '../lib/qualification/factory-stage-admission.ts';
import {syntheticFactory} from './qualification-synthetic.mjs';

const connection=process.env.MYEVE_ISOLATED_COHORT_TEST_DATABASE;
assert(connection,'Dedicated localhost PostgreSQL fixture URL required; never use DATABASE_URL');
const root=new URL(connection);
assert(['localhost','127.0.0.1'].includes(root.hostname)&&root.pathname==='/postgres','Dedicated localhost admin database required');
const name='myeve_qdev_ss_'+randomBytes(6).toString('hex');
const admin=new Client({connectionString:connection});await admin.connect();
await admin.query('CREATE DATABASE '+name);
const dbUrl=new URL(root);dbUrl.pathname='/'+name;
const pool=new Pool({connectionString:dbUrl.href,max:4});
const query=async(s,p)=>(await pool.query(s,p)).rows;
const migrations=await loadMigrations();
await runMigrations({query,transaction:async statements=>{const c=await pool.connect();try{await c.query('BEGIN');for(const s of statements)await c.query(s.sql,s.params);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}},migrations);
test.after(async()=>{await pool.end();await admin.query('DROP DATABASE IF EXISTS '+name+' WITH (FORCE)');await admin.end();});

const owner=randomUUID(),db={query};
const store=new WorkStore({scopeId:owner,scopeKind:'personal',actorId:owner},db);
const fx=syntheticFactory(),baseline=fx.baseline;
async function seedWork({deadline='future'}={}){
  const id=randomUUID(),w=canonicalAlphaTasksWork('fixture/myeve-alpha-workspace-01',owner);
  await pool.query(`INSERT INTO engineering_work(id,scope_id,scope_kind,created_by,title,objective,repository,lifecycle,control,version,generation,criteria_version,max_cost_usd,max_duration_seconds,idempotency_key,request_hash) VALUES($1,$2,'personal',$2,$3,$4,$5,'active','agent',1,1,1,1.3,180,$6,'synthetic')`,[id,owner,w.title,w.objective,w.repository,randomUUID()]);
  await pool.query("INSERT INTO engineering_work_criteria(scope_id,scope_kind,work_id,version,items,created_by)VALUES($1,'personal',$2,1,$3::jsonb,$1)",[owner,id,JSON.stringify(w.criteria)]);
  if(deadline!=='none')await pool.query(`INSERT INTO engineering_work_model_budget(scope_id,scope_kind,work_id,actor_id,agent_id,agent_revision,policy_hash,policy_version,ceiling_microusd,max_calls,deadline,status)
    VALUES($1,'personal',$2,$1,'agent-1','1','p',1,1300000,5,$3,'ACTIVE')`,[owner,id,deadline==='past'?new Date(Date.now()-1000).toISOString():new Date(Date.now()+3600_000).toISOString()]);
  return id;
}
const profile={id:'synthetic-profile',version:1,repository:'fixture/repo',privateQualification:true,baseBranch:'main',allowedPaths:['src/App.tsx'],checks:[],requiredCI:[],reviewerLogins:[],policyVersion:1,executor:'claude-code',image:'synthetic@sha256:'+'a'.repeat(64),maxRuns:1,maxModelRequests:1,maxOutputTokens:256};
const baseConfig=()=>({engineering:{ownerId:owner,agentId:'agent-1',profile},routing:{intent:'PRODUCE'},commands:['npm run typecheck'],
  connection:{factoryId:'synthetic-factory',sourceDigest:'1'.repeat(64),configurationDigest:'2'.repeat(64),factoryVersion:'3'.repeat(64),repositoryPath:'/synthetic',
    qualification:{scopeId:owner,profileHash:'4'.repeat(64),qualifiedAt:'2026-01-01T00:00:00.000Z',expiresAt:'2099-01-01T00:00:00.000Z',mode:'LOCAL_FIXTURE',evidenceRef:'synthetic'}}});
const ROUTING_PROFILE={profileVersion:1,workShape:'bounded',decomposition:'single-thread',interaction:'autonomous',parallelism:'low',verification:'standard',duration:'short',ambiguity:'low',externalExpertise:'none',humanJudgment:'none',risk:'low'};
function authorityFor(config,{route='MYFACTORY'}={}){
  return {readConfig:async()=>config,assess:async()=>({selection:{route,reason:'synthetic'},contract:{budgetUsd:1.3,routingProfile:ROUTING_PROFILE},context:{},facts:{}}),read:async()=>({})};
}
const calls=[];
function sources(workIds,over={}){
  const config=over.config??baseConfig();
  return new StoreBackedStageSources({enabled:true,store,authority:authorityFor(config,over),receipts:{},writers:over.writers??{},adapterFor:()=>over.adapter??{prepare:async()=>{throw new Error('unexpected prepare');}},
    workIds,baseline,predecessor:over.predecessor??(()=>null),admission:over.admission??(async()=>({synthetic:'proof'})),eligibility:over.eligibility??(()=>({admitted:true,reasons:[]})),
    admitPrepared:over.admitPrepared??(async c=>({decisionId:c.decisionId,runId:randomUUID()})),newRequestId:over.newRequestId,...(over.enabled===false?{enabled:false}:{})});
}
const code=c=>e=>(e instanceof StageSourcesRefused||e instanceof FactoryStageAdmissionRefused)&&e.code===c;
const prep=async id=>(await query('SELECT factory_preparation,status FROM engineering_routing_decisions WHERE work_id=$1',[id]))[0];

test('work(): only the host-pinned engineering Work of the stage is read, with the configured agent',async()=>{
  const id=await seedWork(),s=sources({1:id,2:'',3:''});
  const w=await s.work(1);assert.deepEqual(w,{id,version:1,generation:1,criteriaVersion:1,agentId:'agent-1'});
  await assert.rejects(s.work(2),code('QDEV_STAGE_WORK_UNPINNED'));
  await assert.rejects(sources({1:randomUUID(),2:'',3:''}).work(1));
  await pool.query("UPDATE engineering_work SET control='stopping' WHERE id=$1",[id]);
  await assert.rejects(s.work(1),code('QDEV_STAGE_WORK_NOT_ACTIVE'));
});

test('request(): the preparation is persisted once at the required base and a restarted source reuses it exactly',async()=>{
  const id=await seedWork(),ids={1:id,2:'',3:''};
  const a=sources(ids,{newRequestId:()=>'11111111-1111-4111-8111-111111111111'});
  await a.work(1);const start=await a.start(1);assert.deepEqual(start,baseline);
  const request=await a.request(1,start);
  assert.equal(request.workId,id);assert.equal(request.workGeneration,1);assert.equal(request.input.baseRef,baseline.commit);assert.equal(request.requestId,'11111111-1111-4111-8111-111111111111');
  assert.deepEqual(request.input.allowedPaths,['src/App.tsx']);assert.deepEqual(request.input.checkCommands,['npm run typecheck']);assert.equal(request.maxSpendUsd,1.3);
  const row=await prep(id);assert.equal(row.status,'PROPOSED');assert.equal(row.factory_preparation.request.requestId,request.requestId);
  const b=sources(ids,{newRequestId:()=>randomUUID()});await b.work(1);
  assert.deepEqual(await b.request(1,start),request,'a restarted process reuses the persisted request, never a new one');
  const c=sources(ids);await c.work(1);
  await assert.rejects(c.request(1,{commit:'f'.repeat(40),tree:'e'.repeat(40)}),code('QDEV_STAGE_PREPARATION_BASE'));
  const changed=baseConfig();changed.commands=['npm run something-else'];
  const d=sources(ids,{config:changed});await d.work(1);
  await assert.rejects(d.request(1,start),code('QDEV_STAGE_CONFIGURATION_CHANGED'));
});

test('stages 2 and 3 start only at the accepted predecessor candidate; none accepted means no start',async()=>{
  const id=await seedWork(),pred={commit:'a'.repeat(40),tree:'b'.repeat(40)};let accepted=null;
  const s=sources({1:'',2:id,3:''},{predecessor:stage=>{assert.equal(stage,2);return accepted;}});
  await assert.rejects(s.start(2),code('QDEV_STAGE_START_UNAVAILABLE'));
  accepted=pred;assert.deepEqual(await s.start(2),pred);
  await s.work(2);const request=await s.request(2,pred);assert.equal(request.input.baseRef,pred.commit);
  assert.equal((await prep(id)).factory_preparation.request.input.baseRef,pred.commit);
});

test('route, eligibility and deadline refusals persist nothing; a persisted preparation is immutable at the database',async()=>{
  const cases=[['route not Factory',{route:'HUMAN'},{},'QDEV_STAGE_ROUTE_NOT_FACTORY'],
    ['eligibility denied',{eligibility:()=>({admitted:false,reasons:['no']})},{},'QDEV_STAGE_ROUTE_DENIED'],
    ['no deadline',{},{deadline:'none'},'QDEV_STAGE_BUDGET_DEADLINE'],
    ['expired deadline',{},{deadline:'past'},'QDEV_STAGE_BUDGET_DEADLINE']];
  for(const [label,over,seed,expected] of cases){
    const id=await seedWork(seed),s=sources({1:id,2:'',3:''},over);await s.work(1);
    await assert.rejects(s.request(1,baseline),code(expected),label);
    assert.equal((await prep(id))?.factory_preparation??null,null,label);
  }
  const id=await seedWork(),s=sources({1:id,2:'',3:''});await s.work(1);await s.request(1,baseline);
  await assert.rejects(pool.query(`UPDATE engineering_routing_decisions SET factory_preparation=jsonb_set(factory_preparation,'{request,input,baseRef}','"x"') WHERE work_id=$1`,[id]),/Factory preparation identity is immutable/);
});

test('FactoryStageAdmitter over the store sources: MissionControl, then prepare, then register/admit, then the PREPARED writer identity; once only',async()=>{
  const id=await seedWork(),order=[],rid=randomUUID();
  const s0=fx.stage(1,baseline),e=s0.manifest.execution;
  const writerIdentity={runId:randomUUID(),writerGeneration:1,dispatchIdentity:'d',workId:id,workGeneration:1,factoryId:e.factoryId,factoryVersion:e.factoryVersion,requestId:rid,
    workOrderId:e.workOrderId,remoteRunId:e.runId,baseSha:baseline.commit,allowedPaths:['src/App.tsx']};
  const writers={inspect:async(w,r)=>{order.push('inspect');return {id:r,dispatch_state:'PREPARED'};},identity:async run=>({...writerIdentity,repository:'x',deadline:'2099-01-01T00:00:00.000Z'})};
  const adapter={prepare:async(r,proof)=>{order.push('prepare');assert.deepEqual(proof,{synthetic:'proof'});
    return {requestId:r.requestId,workOrderId:e.workOrderId,runId:e.runId,state:'PREPARED',snapshot:{...e,requestId:r.requestId},spend:{status:'KNOWN',ceilingUsd:1}};}};
  const src=sources({1:id,2:'',3:''},{adapter,writers,newRequestId:()=>rid,
    admission:async()=>{order.push('proof');return {synthetic:'proof'};},
    admitPrepared:async c=>{order.push('admit');assert.deepEqual(c.missionControl,{synthetic:'proof'});return {decisionId:c.decisionId,runId:randomUUID()};}});
  const admitter=new FactoryStageAdmitter(src);
  const retained=await admitter.retained(1);
  assert.deepEqual(order,['proof','prepare','admit','inspect']);
  assert.equal(retained.binding.workId,id);assert.equal(retained.binding.inputCommit,baseline.commit);assert.equal(retained.request.input.baseRef,baseline.commit);
  await admitter.retained(1);assert.equal(order.length,4,'a second call never re-prepares');
});

test('identity refuses a writer that is not PREPARED, and the admitter refuses when the sources are disabled or MissionControl yields no proof',async()=>{
  const id=await seedWork(),e=fx.stage(1,baseline).manifest.execution;
  const adapter={prepare:async r=>({requestId:r.requestId,workOrderId:e.workOrderId,runId:e.runId,state:'PREPARED',snapshot:{...e,requestId:r.requestId},spend:{status:'KNOWN',ceilingUsd:1}})};
  const run=async state=>sources({1:id,2:'',3:''},{adapter,writers:{inspect:async()=>({dispatch_state:state})},newRequestId:()=>randomUUID(),
    admitPrepared:async c=>({decisionId:c.decisionId,runId:randomUUID()})});
  await assert.rejects(new FactoryStageAdmitter(await run('DISPATCHED')).retained(1),code('QDEV_STAGE_WRITER_STATE'));
  await assert.rejects(new FactoryStageAdmitter(sources({1:id,2:'',3:''},{enabled:false})).retained(1),code('QDEV_STAGE_ADMISSION_DISABLED'));
  await assert.rejects(new FactoryStageAdmitter(sources({1:id,2:'',3:''},{admission:async()=>null})).retained(1),code('QDEV_STAGE_ADMISSION_REQUIRED'));
});
