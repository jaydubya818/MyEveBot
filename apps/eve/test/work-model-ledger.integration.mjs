import {ActionGateway} from "./admission-fixtures.mjs";
import {approvalBinding,approvalRequestId} from "../lib/approvals.ts";
import {emailSendAdapter} from "../lib/action-adapters.ts";
import { NativeRouteAuthority, admitNativeWork, nativeProfileHash, NATIVE_PROVIDER } from "../lib/engineering/native-routing.ts";
import { EngineeringConversationBudget } from "../lib/engineering/conversation-budget.ts";
import { engineeringConversationModel, conversationPhase } from "../lib/engineering/conversation-model.ts";
import { nativeBudgetedModel } from "../lib/engineering/native-model.ts";
import { NativeModelBudget } from "../lib/engineering/native-model-budget.ts";
import { NativeResultStore } from "../lib/engineering/native-results.ts";
import { runtimeSchema } from "../lib/engineering/runtime.ts";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";
import { Client, Pool } from "pg";
import { loadMigrations, runMigrations } from "../scripts/migration-runner.ts";
import { manifestForSnapshot } from "../lib/engineering/base-preflight.ts";
import { digest, profileSchema } from "../lib/engineering/contract.ts";
import { DirectDevelopmentStore } from "../lib/engineering/direct-development.ts";
import { DirectVerificationDriver } from "../lib/engineering/direct-verification-driver.ts";
import { RouteAdmissionService } from "../lib/engineering/route-admission.ts";
import { RoutingStore } from "../lib/engineering/routing-store.ts";
import { WorkStore } from "../lib/engineering/store.ts";
import { EngineeringWorkerProjectionStore } from "../lib/engineering/worker-projection.ts";

const url=new URL(process.env.ENGINEERING_TEST_ADMIN_URL??"postgresql://postgres@127.0.0.1:55468/postgres");
assert.equal(url.hostname,"127.0.0.1");
assert(["55468","55469"].includes(url.port));
assert.equal(url.pathname,"/postgres");
const admin=new Client({connectionString:url.href});
await admin.connect();
const name=`direct_work_${randomBytes(8).toString("hex")}`;
let pool;
try {
  await admin.query(`CREATE DATABASE ${name}`);
  url.pathname=`/${name}`;
  pool=new Pool({connectionString:url.href});
  const migrationClient=await pool.connect();
  try {
    await runMigrations({
      query:async(sql,params)=>(await migrationClient.query(sql,params)).rows,
      transaction:async statements=>{
        await migrationClient.query("BEGIN");
        try { for(const statement of statements)await migrationClient.query(statement.sql,statement.params);
          await migrationClient.query("COMMIT"); }
        catch(error){await migrationClient.query("ROLLBACK");throw error;}
      },
    },(await loadMigrations()).slice(0,50));
  } finally { migrationClient.release(); }

  const database={query:async(sql,params)=>(await pool.query(sql,params)).rows};
  const owner="native-host-fixture",agentId="native-sofie";
  await pool.query(`INSERT INTO agents(id,owner_id,name,slug,role,instructions,is_primary,status,max_estimated_cost_usd,max_runtime_seconds,max_steps)
    VALUES($1,$2,'Sofie','sofie','engineer','Bounded fixture engineer',true,'active',2,300,20)`,[agentId,owner]);
  const workStore=new WorkStore({scopeId:owner,scopeKind:"personal",actorId:owner},database);
  const criterion={id:randomUUID(),statement:"Positive integer quantities are parsed",method:"test"};
  const source={sha:"a".repeat(40),files:{"README.md":"Synthetic host qualification fixture.\n"}};
  const profile=profileSchema.parse({id:"native-host-fixture",version:1,repository:"fixture/parser",
    privateQualification:true,baseBranch:"main",allowedPaths:["quantity.mjs"],
    checks:[{id:"positive",program:"quantity.mjs",input:"1\n",expectedOutput:"1\n",expectedExitCode:0,criterionIds:[criterion.id]}],
    requiredCI:["quantity-ci"],reviewerLogins:["owner"],policyVersion:1,executor:"claude-code",
    image:`node@sha256:${"b".repeat(64)}`,maxRuns:3,maxModelRequests:5,maxOutputTokens:1024});
  const config={mode:"isolated-dogfood",ownerId:owner,agentId,objective:"Implement a small quantity parser.",criteria:[criterion],
    profile,approvedBase:manifestForSnapshot(source),brokerPort:55470,model:"claude-sonnet-5"};
  const authority=new NativeRouteAuthority(workStore,async()=>runtimeSchema.parse(config));
  async function prepare(title){
    const {work}=await workStore.create({title,objective:config.objective,repository:profile.repository,criteria:config.criteria,
      maxCostUsd:2,maxDurationSeconds:300,idempotencyKey:randomUUID()});
    return workStore.change(work.id,{operation:"resume",expectedVersion:work.version});
  }
  const work=await prepare("Read and productive transition");
  config.nativeMode="normal";
  config.nativeQualification={provider:NATIVE_PROVIDER,modelId:"anthropic/claude-sonnet-5",scopeId:owner,
    profileHash:nativeProfileHash(config),evidenceRef:"local-test-only",qualifiedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+600000).toISOString()};
  const migrations=await loadMigrations();assert.equal(migrations.length,52);
  const migrationDb={query:database.query,transaction:async statements=>{
    const client=await pool.connect();await client.query("BEGIN");try{for(const s of statements)await client.query(s.sql,s.params);await client.query("COMMIT");}
    catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
  }};
  await runMigrations(migrationDb,migrations.slice(0,51),()=>{});
  const historical=await prepare('historical');
  await pool.query(`INSERT INTO engineering_conversation_budget(scope_id,scope_kind,work_id,binding_hash,ceiling_microusd,deadline,max_calls,spent_microusd,reserved_microusd,usage_unknown)
    VALUES($1,'personal',$2,$3,2000000,now()+interval '1 hour',5,1000,200000,true)`,[owner,historical.id,'f'.repeat(64)]);
  const historicalBefore=(await pool.query('SELECT to_jsonb(b) AS row FROM engineering_conversation_budget b WHERE work_id=$1',[historical.id])).rows[0].row;
  const bad=[...migrations.slice(0,51),{...migrations[51],statements:[...migrations[51].statements,"SELECT missing_qualification_function()"]}];
  await assert.rejects(runMigrations(migrationDb,bad,()=>{}),/does not exist/);
  assert.equal((await pool.query("SELECT to_regclass('engineering_work_model_budget') AS table")).rows[0].table,null);
  await runMigrations(migrationDb,migrations,()=>{});await runMigrations(migrationDb,migrations,()=>{});
  assert.equal((await workStore.get(work.id)).version,work.version);
  const budget=new EngineeringConversationBudget(workStore,authority),native=new NativeModelBudget(workStore,authority);
  const request=(workId,sessionId="observer",step=0)=>({workId,sessionId,stepKey:`${sessionId}:turn:${step}`,requestHash:digest({workId,sessionId,step}),modelId:"anthropic/claude-sonnet-5",microUsd:200000,maxCalls:5,pricing:{input:0.000003,output:0.000015},bounds:{inputBytes:4000,maxOutputTokens:1024}});
  await assert.rejects(budget.reserve(request(historical.id)),/budget denied/);
  assert.deepEqual((await pool.query('SELECT to_jsonb(b) AS row FROM engineering_conversation_budget b WHERE work_id=$1',[historical.id])).rows[0].row,historicalBefore);
  await assert.rejects(pool.query("SELECT engineering_model_reserve('{}'::jsonb)"),/provenance/);
  const first=request(work.id);await budget.reserve(first);
  const held=(await pool.query('SELECT id FROM engineering_work_model_calls WHERE work_id=$1',[work.id])).rows[0];
  await assert.rejects(pool.query('SELECT engineering_model_transition($1::jsonb)',[JSON.stringify({id:held.id,scope:owner,actor:owner,request:first.requestHash,operation:'dispatch'})]),/identity mismatch/);
  assert.equal((await pool.query("SELECT count(*)::int n FROM engineering_native_runtime")).rows[0].n,0);
  await budget.assertDispatch(first);await assert.rejects(budget.assertDispatch(first),/fence/);
  await budget.settle(first,1000,{content:[{type:"text",text:"Current Truth"}]});
  assert.deepEqual((await new EngineeringConversationBudget(workStore,authority).reserve(first)).result,{content:[{type:"text",text:"Current Truth"}]});
  await admitNativeWork(workStore,work.id,work.version,authority);
  const projection=(await new EngineeringWorkerProjectionStore(workStore).get(work.id)).projection;
  assert.equal(projection.currentRun.id,(await new RoutingStore(workStore).snapshot(work.id)).runs[0].id);
  assert.equal(projection.currentRun.startedAt,null);assert.equal(projection.readiness.ready,false);
  const execution=request(work.id,"writer",1);await native.reserve(execution);await native.assertDispatch(execution);await native.settle(execution,2000,{content:[]});
  await native.assertSession(work.id,"writer");await assert.rejects(native.assertSession(work.id,"other"),/writer/);
  assert.equal(Number((await pool.query("SELECT spent_microusd FROM engineering_work_model_budget WHERE work_id=$1",[work.id])).rows[0].spent_microusd),3000);
  await assert.rejects(pool.query("INSERT INTO engineering_native_model_calls(scope_id,scope_kind,work_id,step_key,request_hash,model_id,reserved_microusd,status) VALUES($1,'personal',$2,'bypass:0',$3,'anthropic/claude-sonnet-5',1,'INFLIGHT')",[owner,work.id,'a'.repeat(64)]),/immutable/);
  await pool.query("UPDATE engineering_routing_decisions SET admission_authority_snapshot=jsonb_set(admission_authority_snapshot,'{contract,deadline}',to_jsonb('2000-01-01T00:00:00.000Z'::text)) WHERE work_id=$1",[work.id]);
  await assert.rejects(native.reserve(request(work.id,'writer',3)),/deadline|expired/);
  const expiredObserver=request(work.id,'expired-observer',2);await budget.reserve(expiredObserver);await budget.assertDispatch(expiredObserver);await budget.settle(expiredObserver,1000,{content:[]});
  await assert.rejects(native.reserve(request(work.id,'writer',4)),/deadline|expired/);
  assert.equal((await pool.query("SELECT admission_authority_snapshot#>>'{contract,deadline}' AS deadline FROM engineering_routing_decisions WHERE work_id=$1",[work.id])).rows[0].deadline,'2000-01-01T00:00:00.000Z');
  console.log('PASS: expired productive admission stays expired after separately budgeted read-only recovery');
  for(const opponent of ["conversation","native"]){
    const w=await prepare(opponent);if(opponent==="native")await admitNativeWork(workStore,w.id,w.version,authority);
    const a={...request(w.id,"a"),microUsd:2000000},b={...request(w.id,"b"),microUsd:2000000};
    const results=await Promise.allSettled([budget.reserve(a),(opponent==="native"?native:budget).reserve(b)]);
    assert.equal(results.filter(x=>x.status==="fulfilled").length,1);
    assert.equal(Number((await pool.query("SELECT reserved_microusd FROM engineering_work_model_budget WHERE work_id=$1",[w.id])).rows[0].reserved_microusd),2000000);
  }
  const dup=await prepare("duplicate"),dr=request(dup.id);
  const results=await Promise.allSettled([budget.reserve(dr),new EngineeringConversationBudget(workStore,authority).reserve(dr)]);
  assert.equal(results.filter(x=>x.status==="fulfilled").length,1);
  await budget.recover(dr);await budget.releaseUndispatched(dr);await assert.rejects(budget.assertDispatch(dr),/fence|redispatch/);
  const unknown=await prepare("unknown"),ur=request(unknown.id);await budget.reserve(ur);await budget.assertDispatch(ur);await budget.unknown(ur);
  await assert.rejects(budget.releaseUndispatched(ur),/undispatched/);
  assert.equal(Number((await pool.query("SELECT reserved_microusd FROM engineering_work_model_budget WHERE work_id=$1",[unknown.id])).rows[0].reserved_microusd),200000);
  await budget.retain(ur,{content:[]},{providerRequestId:"synthetic-exact",cost:0.001,microUsd:1000});await budget.reconcile(ur,1000);
  await budget.reconcile(ur,1000);
  assert.equal(Number((await pool.query("SELECT spent_microusd FROM engineering_work_model_budget WHERE work_id=$1",[unknown.id])).rows[0].spent_microusd),1000);
  const stale=await prepare("stale"),sr=request(stale.id);await budget.reserve(sr);await workStore.change(stale.id,{operation:"pause",expectedVersion:stale.version});await assert.rejects(budget.assertDispatch(sr),/fence/);
  const policy=await prepare("policy"),pr=request(policy.id);await budget.reserve(pr);await pool.query("UPDATE engineering_work_model_budget SET policy_hash='revoked' WHERE work_id=$1",[policy.id]);await assert.rejects(budget.assertDispatch(pr),/fence/);
  const observers=await prepare('two observers');
  await Promise.all([budget.reserve(request(observers.id,'left')),budget.reserve(request(observers.id,'right'))]);
  assert.equal((await pool.query('SELECT count(*)::int n FROM engineering_native_runtime WHERE work_id=$1',[observers.id])).rows[0].n,0);
  for(const change of ['generation','policy','agent']){
    const w=await prepare(`concurrent-${change}`),r=request(w.id,'race');
    // Establish policy without consuming the next request identity.
    const seed=request(w.id,'seed');await budget.reserve(seed);await budget.releaseUndispatched(seed);
    const blocker=await pool.connect();await blocker.query('BEGIN');
    if(change==='generation')await blocker.query('UPDATE engineering_work SET generation=generation+1,version=version+1 WHERE id=$1',[w.id]);
    if(change==='policy')await blocker.query("UPDATE engineering_work_model_budget SET policy_hash='changed' WHERE work_id=$1",[w.id]);
    if(change==='agent')await blocker.query('UPDATE agents SET updated_at=clock_timestamp() WHERE id=$1',[agentId]);
    const attempt=budget.reserve(r).then(()=>({ok:true}),error=>({ok:false,error}));
    await new Promise(resolve=>setTimeout(resolve,30));await blocker.query('COMMIT');blocker.release();
    assert.equal((await attempt).ok,false);
    assert.equal((await pool.query('SELECT count(*)::int n FROM engineering_work_model_calls WHERE work_id=$1 AND session_id=$2',[w.id,'race'])).rows[0].n,0);
  }
  console.log('PASS: actual interleaved generation/policy/Agent transactions defeat stale admission; two observers acquire no writer');
  for(const stage of ['RESERVED','DISPATCHED','RESULT_RETAINED','RECONCILED']){
    const w=await prepare(stage),reservation=request(w.id,'crash');
    const child=fork(new URL('./work-model-process-fixture.mjs',import.meta.url),[],{execArgv:['--import','tsx'],stdio:['ignore','inherit','inherit','ipc']});
    const event=once(child,'message');child.send({databaseURL:url.href,config,reservation,stage});
    const [message]=await event;assert.equal(message.providerCalls,stage==='RESERVED'?0:1);
    const exited=once(child,'exit');child.kill('SIGKILL');await exited;
    const recovering=new EngineeringConversationBudget(workStore,authority);const receipt=await recovering.recover(reservation);assert.equal(receipt.status,stage);
    await assert.rejects(recovering.assertDispatch(reservation),/redispatch/);
    if(stage==='RESERVED')await recovering.releaseUndispatched(reservation);
    if(stage==='DISPATCHED'){await recovering.unknown(reservation);await assert.rejects(recovering.releaseUndispatched(reservation),/undispatched/);}
    if(stage==='RESULT_RETAINED')await recovering.reconcile(reservation,1000);
    if(stage==='RECONCILED')assert.equal((await recovering.reserve(reservation)).result.content[0].text,'retained');
    const row=(await pool.query('SELECT * FROM engineering_work_model_budget WHERE work_id=$1',[w.id])).rows[0];
    assert.equal(Number(row.reserved_microusd),stage==='DISPATCHED'?200000:0);
    assert.equal(Number(row.spent_microusd),['RESULT_RETAINED','RECONCILED'].includes(stage)?1000:0);
    assert.equal((await pool.query('SELECT count(*)::int n FROM engineering_native_runtime WHERE work_id=$1',[w.id])).rows[0].n,0);
    assert.equal((await pool.query('SELECT count(*)::int n FROM engineering_native_results WHERE work_id=$1',[w.id])).rows[0].n,0);
  }
  console.log('PASS: four actual SIGKILL boundaries; response recovery, reservation-only release, no blind redispatch, unchanged writer/result state');
  for(const kind of ['app','worker']){
    const role=`gap2_${kind}_${randomBytes(5).toString('hex')}`;
    const client=await pool.connect();
    try {
      await client.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE`);
      await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
      await client.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${role}`);
      await client.query(`GRANT EXECUTE ON FUNCTION engineering_model_reserve(jsonb),engineering_model_transition(jsonb) TO ${role}`);
      const w=await prepare(kind);
      await client.query(`SET ROLE ${role}`);
      const scopedStore=new WorkStore(workStore.principal,{query:async(sql,params)=>(await client.query(sql,params)).rows});
      const scopedBudget=new EngineeringConversationBudget(scopedStore,new NativeRouteAuthority(scopedStore,async()=>runtimeSchema.parse(config)));
      const r=request(w.id,kind);await scopedBudget.reserve(r);await scopedBudget.assertDispatch(r);await scopedBudget.settle(r,1000,{content:[]});
      await assert.rejects(client.query('UPDATE engineering_work_model_budget SET spent_microusd=0'),/permission denied/);
      await assert.rejects(client.query('DELETE FROM engineering_work_model_calls'),/permission denied/);
      await client.query('RESET ROLE');
      console.log(`PASS: restricted ${kind} role function path; direct economic mutation denied`);
    }finally{await client.query('RESET ROLE');await client.query(`DROP OWNED BY ${role}`);await client.query(`DROP ROLE ${role}`);client.release();}
  }
  const modelWork=await prepare('model boundary');let providerCalls=0;
  const provider=()=>({doGenerate:async()=>{providerCalls++;return {content:[{type:'text',text:'Current Truth remains PARTIAL'}],usage:{},finishReason:{unified:'stop',raw:'stop'},warnings:[],providerMetadata:{gateway:{cost:'0.001',generationId:`synthetic-${providerCalls}`}}};}});
  const catalog=async()=>({models:[{id:'anthropic/claude-sonnet-5',pricing:{input:'0.000003',output:'0.000015'}}]});
  const options={prompt:[{role:'user',content:[{type:'text',text:'Explain selected Work'}]}],tools:[{type:'function',name:'engineering_direct',inputSchema:{type:'object'}}]};
  const modelInput={store:workStore,workId:modelWork.id,sessionId:'model-owner',stepKey:'model-owner:0',modelId:'anthropic/claude-sonnet-5'};
  const observerModel=engineeringConversationModel({...modelInput,productive:false},{authority,catalog,model:provider});
  await observerModel.doGenerate(options);assert.equal(providerCalls,1);
  assert.equal((await pool.query('SELECT count(*)::int n FROM engineering_native_runtime WHERE work_id=$1',[modelWork.id])).rows[0].n,0);
  await admitNativeWork(workStore,modelWork.id,modelWork.version,authority);
  await nativeBudgetedModel({...modelInput,stepKey:'model-owner:1'},{authority,catalog,model:provider}).doGenerate(options);
  assert.equal(providerCalls,2);
  const receipts=(await pool.query('SELECT purpose,spent_microusd FROM engineering_work_model_calls WHERE work_id=$1 ORDER BY created_at',[modelWork.id])).rows;
  assert.deepEqual(receipts.map(x=>x.purpose),['CONVERSATION_REASONING','NATIVE_EXECUTION']);assert.equal(receipts.length,2);
  assert.equal(Number((await pool.query('SELECT spent_microusd FROM engineering_work_model_budget WHERE work_id=$1',[modelWork.id])).rows[0].spent_microusd),2000);
  await pool.query("UPDATE engineering_work_model_budget SET status='REVOKED' WHERE work_id=$1",[modelWork.id]);
  await assert.rejects(engineeringConversationModel({...modelInput,stepKey:'model-owner:2',productive:false},{authority,catalog,model:provider}).doGenerate(options));
  assert.equal(providerCalls,2);
  console.log('PASS: actual model wrappers with real SQL, controlled provider: first reasoning, no writer, explicit native transition, one receipt per call, denial adds zero provider calls');
  const legacy=await prepare('unrelated legacy executor');
  for(const w of [work,legacy])await pool.query("INSERT INTO engineering_execution(scope_id,scope_kind,work_id,revision,state) VALUES($1,'personal',$2,1,'{}')",[owner,w.id]);
  const oldCall=id=>pool.query("INSERT INTO engineering_model_calls(id,scope_id,scope_kind,work_id,attempt_id,reserved_usd,state) VALUES($1,$2,'personal',$3,$4,0.01,'RESERVED')",[randomUUID(),owner,id,randomUUID()]);
  await assert.rejects(oldCall(work.id),/common-ledger/);await oldCall(legacy.id);
  console.log('PASS: legacy executor cannot bypass canonical Work; unrelated legacy Work remains unchanged');
  console.log("PASS: populated 0050 -> 0051 -> 0052, failure rollback, rerun, conversation/native races, duplicate, release fence, UNKNOWN reconciliation, replay, provenance, native bypass rejection, writer custody, generation/policy dispatch fence");
} finally {
 await pool?.end();url.pathname="/postgres";await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);await admin.end();
}
