import {ActionGateway} from "./admission-fixtures.mjs";
import {approvalBinding,approvalRequestId} from "../lib/approvals.ts";
import {emailSendAdapter} from "../lib/action-adapters.ts";
import { NativeRouteAuthority, admitNativeWork, nativeProfileHash, NATIVE_PROVIDER } from "../lib/engineering/native-routing.ts";
import { EngineeringConversationBudget } from "../lib/engineering/conversation-budget.ts";
import { conversationPhase } from "../lib/engineering/conversation-model.ts";
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
  const migrations=await loadMigrations();assert.equal(migrations.length,51);
  const migrationDb={query:database.query,transaction:async statements=>{
    const client=await pool.connect();await client.query("BEGIN");try{for(const s of statements)await client.query(s.sql,s.params);await client.query("COMMIT");}
    catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
  }};
  const bad=[...migrations.slice(0,50),{...migrations[50],statements:[...migrations[50].statements,"SELECT missing_qualification_function()"]}];
  await assert.rejects(runMigrations(migrationDb,bad,()=>{}),/does not exist/);
  assert.equal((await pool.query("SELECT to_regclass('engineering_conversation_budget') AS table")).rows[0].table,null);
  assert.equal((await pool.query("SELECT count(*)::int n FROM sofie_schema_migrations")).rows[0].n,50);
  await runMigrations(migrationDb,migrations,()=>{});await runMigrations(migrationDb,migrations,()=>{});
  assert.equal((await workStore.get(work.id)).version,work.version);
  assert.equal((await pool.query("SELECT count(*)::int n FROM sofie_schema_migrations")).rows[0].n,51);
  console.log("Migration: populated 0050 upgrade, transactional failure rollback, exact rerun PASS; actual isolated app/worker role:",(await pool.query("SELECT current_user")).rows[0].current_user);
  const budget=new EngineeringConversationBudget(workStore,authority);
  const request=(workId,sessionId="observer",step=0)=>({workId,sessionId,stepKey:`${sessionId}:turn:${step}`,requestHash:digest({workId,sessionId,step}),modelId:"anthropic/claude-sonnet-5",microUsd:200000,maxCalls:5});
  const first=request(work.id);
  await budget.reserve(first);
  assert.equal((await pool.query("SELECT count(*)::int n FROM engineering_native_runtime")).rows[0].n,0);
  assert.equal((await new RoutingStore(workStore).snapshot(work.id)).decision,null);
  await assert.rejects(budget.reserve({...first,sessionId:"foreign"}),/uncertain/);
  await budget.settle(first,1000,{content:[{type:"text",text:"Current Truth"}]});
  assert.deepEqual((await new EngineeringConversationBudget(workStore,authority).reserve(first)).result,{content:[{type:"text",text:"Current Truth"}]});
  const fresh=request(work.id,"fresh",0);await budget.reserve(fresh);await budget.settle(fresh,1000,{content:[]});
  assert.equal((await pool.query("SELECT count(*)::int n FROM engineering_native_runtime")).rows[0].n,0);
  // Explicit productive request still requires the unchanged admission and session controls.
  const native=new NativeModelBudget(workStore,authority);
  await assert.rejects(native.reserve(request(work.id,"fresh",1)),/authority changed/);
  assert.equal(conversationPhase(true,false,null,"fresh"),"admission");
  await admitNativeWork(workStore,work.id,work.version,authority);
  const execution=request(work.id,"fresh",2);
  await budget.reserve(execution);await native.reserve(execution);await native.settle(execution,2000,{content:[]});await budget.settle(execution,2000,{content:[]});
  await native.assertSession(work.id,"fresh");await assert.rejects(native.assertSession(work.id,"observer"),/writer session/);
  const ledger=(await pool.query("SELECT spent_microusd FROM engineering_conversation_budget WHERE work_id=$1",[work.id])).rows[0];
  assert.equal(Number(ledger.spent_microusd),4000); // includes native 2000 exactly once, not twice
  assert.equal(conversationPhase(false,true,"fresh","observer"),"observation");
  assert.equal(conversationPhase(true,true,"fresh","observer"),"observation");
  const observer=request(work.id,"observer",3);await budget.reserve(observer);await budget.settle(observer,1000,{content:[]});
  await native.assertSession(work.id,"fresh");
  // Upgrading an existing native Work carries forward both usage and call count once.
  const priorWork=await prepare("Existing native accounting");
  await admitNativeWork(workStore,priorWork.id,priorWork.version,authority);
  const priorCall=request(priorWork.id,"prior-writer",0);
  await native.reserve(priorCall);await native.settle(priorCall,3000,{content:[]});
  const recoveredCall=request(priorWork.id,"prior-reader",1);
  await budget.reserve(recoveredCall);await budget.settle(recoveredCall,1000,{content:[]});
  const carried=(await pool.query("SELECT spent_microusd,calls_started FROM engineering_conversation_budget WHERE work_id=$1",[priorWork.id])).rows[0];
  assert.equal(Number(carried.spent_microusd),4000);assert.equal(carried.calls_started,2);
  // Expired route remains expired; observation accounting cannot renew it.
  await pool.query("UPDATE engineering_routing_decisions SET admission_authority_snapshot=jsonb_set(admission_authority_snapshot,'{contract,deadline}',to_jsonb('2000-01-01T00:00:00.000Z'::text)) WHERE work_id=$1",[work.id]);
  await assert.rejects(authority.assertEffect(work.id),/deadline|expired/i);
  const expiredRead=request(work.id,"reader",4);await budget.reserve(expiredRead);await budget.settle(expiredRead,1000,{content:[]});
  await assert.rejects(authority.assertEffect(work.id),/deadline|expired/i);
  assert.equal((await new EngineeringWorkerProjectionStore(workStore).get(work.id)).projection.readiness.ready,false);
  // Two conversations race for the final allowance; at most one dispatch permit exists.
  const racing=await prepare("Final allowance");const left={...request(racing.id,"left"),microUsd:2000000},right={...request(racing.id,"right"),microUsd:2000000};
  const attempts=await Promise.allSettled([budget.reserve(left),budget.reserve(right)]);assert.equal(attempts.filter(r=>r.status==="fulfilled").length,1);
  const winner=attempts[0].status==="fulfilled"?left:right;await budget.settle(winner,2000000,{content:[]});
  await assert.rejects(budget.reserve(request(racing.id,"third")),/budget/);
  const unknown=await prepare("Unknown usage");const u=request(unknown.id);await budget.reserve(u);await budget.unknown(u);
  await assert.rejects(budget.reserve(request(unknown.id,"new")),/budget/);
  assert.equal(Number((await pool.query("SELECT reserved_microusd FROM engineering_conversation_budget WHERE work_id=$1",[unknown.id])).rows[0].reserved_microusd),200000);
  // Authority changes fence old conversation bindings without rebinding historical rows.
  for(const changed of ["generation","policy","agent"]){
    const w=await prepare(changed),a=request(w.id);await budget.reserve(a);await budget.settle(a,1000,{content:[]});
    if(changed==="generation")await workStore.change(w.id,{operation:"pause",expectedVersion:w.version});
    if(changed==="policy")config.profile.policyVersion++;
    if(changed==="agent")await pool.query("UPDATE agents SET updated_at=clock_timestamp() WHERE id=$1",[agentId]);
    await assert.rejects(budget.reserve(request(w.id,"later")),/budget|authority|required/i);
    if(changed==="policy")config.profile.policyVersion--;
  }
  // Real process loss before dispatch, after dispatch marker and after response custody.
  for(const stage of ["reserved","dispatched","settled"]){
    const w=await prepare(stage),reservation=request(w.id,`crash-${stage}`);
    const child=fork(new URL("./conversation-process-fixture.mjs",import.meta.url),[],{execArgv:["--import","tsx"],stdio:["ignore","inherit","inherit","ipc"]});
    try{
      const event=once(child,"message");child.send({databaseURL:url.href,config,reservation,stage});const [message]=await event;assert.equal(message.stage,stage);assert.equal(message.dispatches,stage==="reserved"?0:1);const actual=message.reservation;
      const exited=once(child,"exit");child.kill("SIGKILL");assert.equal((await exited)[1],"SIGKILL");
      const freshBudget=new EngineeringConversationBudget(workStore,authority);
      if(stage==="settled")assert.equal((await freshBudget.reserve(actual)).result.content[0].text,"durably retained");
      else {await assert.rejects(freshBudget.reserve(actual),/uncertain/);await assert.rejects(freshBudget.reserve(request(w.id,"new")),/budget/);}
      const row=(await pool.query("SELECT calls_started,reserved_microusd FROM engineering_conversation_budget WHERE work_id=$1",[w.id])).rows[0];
      assert.equal(row.calls_started,1);assert.equal(Number(row.reserved_microusd),stage==="settled"?0:actual.microUsd);
    }finally{if(child.exitCode===null&&child.signalCode===null)child.kill("SIGKILL");}
  }
  await pool.query(`INSERT INTO task_runs(id,owner_id,kind,title,agent_id,status,max_duration_seconds,max_specialists,max_model_steps,max_retries_per_specialist,max_estimated_cost_usd)
    VALUES('gap2-approval',$1,'delegated_work','Approval fences',$2,'running',600,0,30,0,1)`,[owner,agentId]);
  await pool.query("INSERT INTO task_run_sessions(task_id,session_id,role) VALUES('gap2-approval','gap2-session','orchestrator')");
  const approvals=[];let effects=0,consumedHandle;
  const approvalStore=async input=>{
    const id=approvalRequestId(input);approvals.push(id);const hash=approvalBinding({taskId:input.taskId,capabilityId:input.capabilityId,resource:input.resource,action:input.action,parameters:input.parameters});
    await pool.query(`INSERT INTO task_approval_decisions(id,task_id,owner_id,requested_by,prompt,action,action_class,binding_hash,risk,expires_at,status,agent_id,capability_id)
      VALUES($1,$2,$3,$4,'Exact local test approval',$5,$6,$7,'high',now()+interval '1 hour','pending',$4,'tool.send_email')`,[id,input.taskId,input.ownerId,input.requestedBy,input.action,input.actionClass,hash]);
    return {decision:'REQUIRE_APPROVAL',approval:{id},reason:'local test'};
  };
  const gateway=new ActionGateway(database,{evaluate:async()=>({decision:'REQUIRE_APPROVAL',source:'fixture',reason:'exact'})},approvalStore);
  const action={ownerId:owner,runId:'gap2-approval',actionKey:'expired-approval',capabilityId:'tool.send_email',actionClass:'send',executor:{kind:'primary-agent',agentId},trigger:{kind:'owner_chat',id:'gap2-session'},parameters:{to:['owner@example.test'],subject:'Fixture',text:'Synthetic; no external provider'}};
  const adapter=emailSendAdapter('local-fixture',{resolveAccount:async()=>owner,send:async(_params,context)=>{effects++;consumedHandle=context;return {messageId:'retained',threadId:'fixture'}},inspect:async()=>({messageId:'retained',threadId:'fixture',account:owner})});
  await assert.rejects(gateway.execute(action,adapter));
  await pool.query("UPDATE task_approval_decisions SET status='approved',decision='approved',expires_at=now()-interval '1 second' WHERE id=$1",[approvals.at(-1)]);
  await assert.rejects(gateway.execute(action,adapter));assert.equal(effects,0);
  const currentAction={...action,actionKey:'current-approval',parameters:{...action.parameters,subject:'New exact binding'}};
  await assert.rejects(gateway.execute(currentAction,adapter));
  await pool.query("UPDATE task_approval_decisions SET status='approved',decision='approved' WHERE id=$1",[approvals.at(-1)]);
  await gateway.execute(currentAction,adapter);assert.equal(effects,1);
  await gateway.execute(currentAction,adapter);assert.equal(effects,1);
  await assert.rejects(adapter.execute(currentAction.parameters,consumedHandle));assert.equal(effects,1);
  console.log('Expired approval denies dispatch; completed exact action and consumed handle cannot duplicate effects.');
  console.log("Conversation budget: reserve/replay/concurrency/unknown/cost coverage/read-to-admission/native custody/expiry/Agent-policy-generation fences and three SIGKILL boundaries PASS.");
} finally {
  await pool?.end();url.pathname="/postgres";
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);await admin.end();
}
