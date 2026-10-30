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
import {FactoryReceiptStore} from '../lib/engineering/factory-receipt-store.ts';
import {FactoryWriterStore} from '../lib/engineering/factory-writer.ts';
import {FactoryRouteAuthority} from '../lib/engineering/factory-routing.ts';
import {NativeRouteAuthority} from '../lib/engineering/native-routing.ts';
import {LiveFactoryAdapter} from '../lib/engineering/factory-live-adapter.ts';
import {digest} from '../lib/engineering/contract.ts';
import {capabilityRegistry} from '@mission-control/capability-control';
import {readFile} from 'node:fs/promises';
import {closeCapabilityWorkDatabase} from '../lib/capability-control/admission.ts';

const connection=process.env.MYEVE_ISOLATED_COHORT_TEST_DATABASE;
assert(connection,'Dedicated localhost PostgreSQL fixture URL required; never use DATABASE_URL');
const root=new URL(connection);
assert(['localhost','127.0.0.1'].includes(root.hostname)&&root.pathname==='/postgres','Dedicated localhost admin database required');
const name='myeve_qdev_ss_'+randomBytes(6).toString('hex');
const admin=new Client({connectionString:connection});await admin.connect();
admin.on('error',()=>{});
await admin.query('CREATE DATABASE '+name);
const dbUrl=new URL(root);dbUrl.pathname='/'+name;
const pool=new Pool({connectionString:dbUrl.href,max:4});
pool.on('error',()=>{});   // idle clients may be terminated by the forced DROP DATABASE at teardown; that is not a test failure
const query=async(s,p)=>(await pool.query(s,p)).rows;
const migrations=await loadMigrations();
await runMigrations({query,transaction:async statements=>{const c=await pool.connect();try{await c.query('BEGIN');for(const s of statements)await c.query(s.sql,s.params);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}},migrations);
test.after(async()=>{await closeCapabilityWorkDatabase();await pool.end();await admin.query('DROP DATABASE IF EXISTS '+name+' WITH (FORCE)');if(globalThis.__qdevRole)await admin.query('DROP ROLE IF EXISTS '+globalThis.__qdevRole);await admin.end();});

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

test('stage 2/3 writer authority is bound only to the authenticated predecessor start; any other prepared base, or a missing factory binding, is refused',async()=>{
  const id=await seedWork(),pred={commit:'a'.repeat(40),tree:'b'.repeat(40)},seen=[];
  const base={readConfig:async()=>baseConfig(),assess:async()=>({selection:{route:'MYFACTORY',reason:'x'},contract:{budgetUsd:1.3,routingProfile:ROUTING_PROFILE},context:{},facts:{}}),
    read:async(w,rid,prepared)=>{seen.push('production');return {factory:{requestId:rid,baseSha:'9'.repeat(40)}};}};
  let probe;
  const s=new StoreBackedStageSources({enabled:true,store,authority:base,receipts:{},writers:{inspect:async()=>({dispatch_state:'PREPARED'}),identity:async()=>({})},adapterFor:()=>({}),
    workIds:{1:'',2:id,3:''},baseline,predecessor:()=>pred,eligibility:()=>({admitted:true,reasons:[]}),admission:async()=>({synthetic:'proof'}),newRequestId:()=>randomUUID(),
    admitPrepared:async c=>{probe=c.authority;return {decisionId:c.decisionId,runId:randomUUID()};}});
  const w=await s.work(2),req=await s.request(2,await s.start(2)),readback={};
  await s.identity(2,w,readback,req);
  const bound=await probe.read(await store.get(id),'req-1',req);
  assert.equal(bound.factory.baseSha,pred.commit,'the writer base is the accepted predecessor, not the approved baseline');
  await assert.rejects(probe.read(await store.get(id),'req-1',{...req,input:{...req.input,baseRef:'f'.repeat(40)}}),code('QDEV_STAGE_AUTHORITY_BASE'));
  await assert.rejects(probe.read(await store.get(id),'req-1'),code('QDEV_STAGE_AUTHORITY_BASE'));
  base.read=async()=>({});
  await assert.rejects(probe.read(await store.get(id),'req-1',req),code('QDEV_STAGE_AUTHORITY_BASE'));
});

test('REAL authority + receipts + RouteAdmissionService.admit + writer SQL guard: stage 1 at the baseline and stage 2 at the accepted predecessor each admit exactly one PREPARED writer; a restart never admits a second',async()=>{
  const oldNativeRead=NativeRouteAuthority.prototype.read,oldLiveHealth=LiveFactoryAdapter.prototype.healthy;
  const agentId='agent-1';
  await pool.query(`INSERT INTO agents(id,owner_id,name,slug,role,instructions,is_primary,status,max_estimated_cost_usd,max_runtime_seconds,max_steps) VALUES($1,$2,'Sofie','sofie-real','engineer','qdev stage fixture',true,'active',1.3,3600,30) ON CONFLICT DO NOTHING`,[agentId,owner]);
  // Capability-control installation fixture (same SQL/evidence shape as the existing owner-route integration), disposable database only.
  for(const n of ['migration','enforcement','decisions','ordering','lifecycle'])await pool.query(await readFile(new URL('../../../docs/capability-control/'+n+'.sql',import.meta.url),'utf8'));
  const installation='qdev-installation-'+randomUUID(),ids=capabilityRegistry.capabilities.map(c=>c.id);
  const facts=Object.fromEntries(capabilityRegistry.capabilities.map(c=>[c.id,{supported:true,deployed:true,entitled:true,administrator:'ALLOW',
    setup:Object.fromEntries(c.setupRequirements.map(k=>[k,true])),qualification:Object.fromEntries(c.qualificationRequirements.map(k=>[k,'QUALIFIED'])),lifecycle:'ACTIVE'}]));
  await pool.query("INSERT INTO capability_control.installations VALUES($1,'fixture-organization','qualification',true)",[installation]);
  await pool.query("INSERT INTO capability_control.platform_owner_bindings VALUES($1,'fixture-organization',$2,'fixture-binding',1,'fixture-auth','fixture-admin','fixture-member','fixture-installation','fixture-audit','ACTIVE',clock_timestamp()+interval '1 hour')",[installation,owner]);
  await pool.query('INSERT INTO capability_control.owner_state(installation_id,owner_id,preferences) VALUES($1,$2,$3)',[installation,owner,Object.fromEntries(ids.map(i=>[i,'ENABLED']))]);
  await pool.query("INSERT INTO capability_control.evidence VALUES($1,'fixture-organization',$2,$3,$4,clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour','fixture-evidence')",[installation,owner,capabilityRegistry.version,facts]);
  await pool.query("INSERT INTO capability_control.relay_agent_evidence VALUES($1,$2,'fixture-organization',$3,1,$4,'ACTIVE',clock_timestamp()+interval '1 hour','fixture-agent-record')",[installation,owner,agentId,JSON.stringify(ids)]);
  await pool.query("INSERT INTO capability_control.policy_destinations VALUES($1,$2,'fixture-mc','fixture-incarnation',1,'fixture-key','{}')",[installation,owner]);
  await pool.query("INSERT INTO capability_control.policy_changes(installation_id,owner_id,revision,policy_id,organization_id,capability_id,operation,destinations,status) VALUES($1,$2,1,'fixture-policy','fixture-organization','enterprise.fleet','enable','[]','ACKNOWLEDGED')",[installation,owner]);
  const saved={};for(const [k,v] of Object.entries({MYEVE_CAPABILITY_CONTROL_ENABLED:'true',MYEVE_CAPABILITY_INSTALLATION_ID:installation,MYEVE_CAPABILITY_ENVIRONMENT:'qualification',
    MYEVE_CAPABILITY_DATABASE_URL:dbUrl.href,MYEVE_CAPABILITY_ORIGIN:'http://127.0.0.1:3000',VERCEL:undefined,VERCEL_ENV:undefined})){saved[k]=process.env[k];if(v===undefined)delete process.env[k];else process.env[k]=v;}
  // Capability admission refuses a superuser/bypass-RLS runtime, so the atomic transaction runs as a least-privilege role (same grants as the owner-route integration).
  const role='qdev_rt_'+randomBytes(5).toString('hex');globalThis.__qdevRole=role;
  await admin.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
  for(const sql of [`GRANT USAGE ON SCHEMA public,capability_control TO ${role}`,`GRANT SELECT ON ALL TABLES IN SCHEMA public,capability_control TO ${role}`,
    `GRANT UPDATE ON engineering_work TO ${role}`,`GRANT INSERT,UPDATE ON missioncontrol_control_attempts TO ${role}`,
    `GRANT INSERT ON missioncontrol_work_bindings,missioncontrol_execution_permits,missioncontrol_admission_receipts,missioncontrol_permit_controls,missioncontrol_factory_readbacks,missioncontrol_control_acknowledgments TO ${role}`,
    `GRANT EXECUTE ON FUNCTION capability_control.lock_admission_policy(text,text,text),missioncontrol_capability_snapshot(text,text,text,text),missioncontrol_enrollment_document(text) TO ${role}`,
    `GRANT EXECUTE ON FUNCTION missioncontrol_assert_dispatch(text,uuid,integer,integer,boolean,text),missioncontrol_assert_alpha_admission(text,uuid,integer,integer,text,text,text) TO ${role}`,
    `GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO ${role}`,`GRANT UPDATE ON agents,business_partnership TO ${role}`,
    `GRANT EXECUTE ON FUNCTION business_assert_effect(text,uuid,integer,integer,text,jsonb) TO ${role}`,
    `GRANT INSERT,UPDATE ON engineering_routing_decisions,engineering_route_runs,engineering_route_transitions,engineering_native_runtime TO ${role}`])await pool.query(sql);
  await pool.query(`GRANT ${role} TO CURRENT_USER`);
  const atomicDb={query:db.query,atomic:async action=>{const c=await pool.connect();try{await c.query('BEGIN');await c.query('SET LOCAL ROLE '+role);const r=await action({query:async(sql,v)=>(await c.query(sql,v)).rows});await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}};
  const astore=new WorkStore(store.principal,atomicDb);
  for(const reviewStage of [1,2]){
  try{
  const id=await seedWork();await pool.query("UPDATE engineering_work_model_budget SET deadline=clock_timestamp()+interval '120 seconds' WHERE work_id=$1",[id]);
  const e=fx.stage(1,baseline).manifest.execution,rid=randomUUID();
  const receipts=new FactoryReceiptStore(store.principal,db),writers=new FactoryWriterStore(astore);
  const cfg=baseConfig();Object.assign(cfg.connection,{factoryId:e.factoryId,factoryVersion:e.factoryVersion,sourceDigest:e.sourceDigest,configurationDigest:e.configurationDigest});
  const provider={id:cfg.connection.factoryId,version:cfg.connection.factoryVersion},scope={kind:'personal',id:owner};
  // Authority facts are synthetic seams (no MissionControl enrollment, no provider); the stores, SQL guards and RouteAdmissionService are the real bodies.
  const nativeFixtureAuthority={...authorityFor(cfg),read:async(work,receiptId,request)=>{
    const now=Date.now();
    const contract={contractVersion:2,workId:work.id,workVersion:work.version,criteriaVersion:work.criteriaVersion,scope,humanOwnerId:owner,coordinatingAgentId:agentId,objective:work.objective,
      criteria:work.criteria.map(c=>({id:c.id,statement:c.statement,evidence:'deterministic'})),resourceRefs:['repository:'+work.repository],allowedOperations:['factory.submit'],budgetUsd:1.3,
      deadline:request.deadline,policyVersion:1,composition:{role:{id:'software-engineer',version:1},capabilityPacks:[],mode:{id:'normal',version:1}},routingProfile:ROUTING_PROFILE,
      routePolicy:{id:'personal-factory',version:1},definitionOfDone:['A verified Factory candidate is retained.'],allowedRoutes:['MYFACTORY']};
    const context={contractVersion:2,workId:work.id,workVersion:work.version,scope,agentId,assembledAt:new Date(now).toISOString(),maxTokens:500,estimatedTokens:50,items:[]};
    const facts={currentWorkVersion:work.version,currentCriteriaVersion:work.criteriaVersion,currentPolicyVersion:1,workActive:true,scope,agentId,authority:'ALLOW',remainingBudgetUsd:1.3,
      allowedRoutes:['MYFACTORY'],allowedOperations:['factory.submit'],allowedResourceRefs:['repository:'+work.repository],
      routePolicy:{id:'personal-factory',version:1,allowedRoutes:['MYFACTORY'],providers:{DIRECT:null,DEEP_AGENT:null,EXECUTOR:null,MYFACTORY:provider,RELAY:null}},
      qualifications:{DIRECT:null,DEEP_AGENT:null,EXECUTOR:null,MYFACTORY:{provider,scope,status:'QUALIFIED',health:'HEALTHY',evidenceRef:'synthetic',observedAt:new Date(now).toISOString(),expiresAt:new Date(now+3600_000).toISOString()},RELAY:null},
      writerState:'NONE',factoryAdmission:'ALLOW',relayGrant:'UNKNOWN',peerPolicy:'UNKNOWN',observedAt:new Date(now).toISOString()};
    return {contract,context,facts,factory:{requestId:receiptId,repository:work.repository,baseSha:request.input.baseRef,profileHash:'5'.repeat(64),allowedPaths:['src/App.tsx'],deadline:request.deadline}};
  }};
  const chained={commit:'e'.repeat(40),tree:'f'.repeat(40)},requiredStart=reviewStage===1?baseline:chained;
  cfg.engineering.approvedBase={sha:baseline.commit};
  cfg.connection={...cfg.connection,origin:'http://127.0.0.1:12345',token:'c'.repeat(64),keys:[fx.key],sourceDigest:fx.sourceDigest,configurationDigest:fx.configurationDigest,factoryVersion:fx.factoryVersion,
    qualification:{...cfg.connection.qualification,profileHash:digest(cfg.engineering.profile),spendEnforced:true}};
  const oldNative=NativeRouteAuthority.prototype.read,oldHealth=LiveFactoryAdapter.prototype.healthy;
  NativeRouteAuthority.prototype.read=async function(work){return nativeFixtureAuthority.read(work,randomUUID(),{input:{baseRef:requiredStart.commit},deadline:new Date(Date.now()+100000).toISOString()});};
  LiveFactoryAdapter.prototype.healthy=async()=>true;
  const realAuthority=new FactoryRouteAuthority(astore,async()=>cfg);
  const adapter={prepare:async r=>({requestId:r.requestId,workOrderId:e.workOrderId,runId:e.runId,state:'PREPARED',snapshot:{...e,requestId:r.requestId,inputCommit:requiredStart.commit,inputTree:requiredStart.tree},spend:{status:'KNOWN',ceilingUsd:1}})};
  const mk=()=>new StoreBackedStageSources({enabled:true,store:astore,authority:realAuthority,receipts,writers,adapterFor:()=>adapter,workIds:{1:reviewStage===1?id:'',2:reviewStage===2?id:'',3:''},baseline,predecessor:()=>chained,
    admission:async()=>null,eligibility:()=>({admitted:true,reasons:[]}),newRequestId:()=>rid});
  // The admitter refuses a null MissionControl proof by design, so the sources are driven directly with a null proof: receipts, RouteAdmissionService and the writer store are real.
  const drive=async src=>{const w=await src.work(reviewStage),st=await src.start(reviewStage),req=await src.request(reviewStage,st);await src.missionControl(reviewStage,w);
    const readback=await src.prepare(req,null);return {req,identity:await src.identity(reviewStage,w,readback,req)};};
  const {req,identity}=await drive(mk());
  const runs=await query('SELECT id,status FROM engineering_route_runs WHERE work_id=$1',[id]);
  assert.equal(runs.length,1,'exactly one real run admitted');
  assert.equal((await writers.inspect(id,runs[0].id)).dispatch_state,'PREPARED');
  assert.equal(identity.runId,runs[0].id);assert.equal(identity.workId,id);assert.equal(identity.baseSha,requiredStart.commit);assert.equal(req.input.baseRef,requiredStart.commit);
  assert.equal((await query('SELECT count(*)::int n FROM engineering_factory_requests WHERE work_id=$1',[id]))[0].n,1);
  // A restarted source reuses the persisted preparation, but the already admitted decision fails closed instead of admitting a second writer.
  const again=await drive(mk()).then(()=>null,e=>e);assert.equal(again?.code,'routing_changed','an already admitted decision fails closed');
  assert.equal((await query('SELECT count(*)::int n FROM engineering_route_runs WHERE work_id=$1',[id]))[0].n,1,'no second writer');
  }finally{NativeRouteAuthority.prototype.read=oldNativeRead;LiveFactoryAdapter.prototype.healthy=oldLiveHealth;}
  }
});
