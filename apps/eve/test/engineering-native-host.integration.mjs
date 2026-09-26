import { NativeRouteAuthority, admitNativeWork, nativeProfileHash, NATIVE_PROVIDER } from "../lib/engineering/native-routing.ts";
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
    },await loadMigrations());
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
  const work=await prepare("Native host custody");
  await assert.rejects(admitNativeWork(workStore,work.id,work.version,authority),/qualified/);
  assert.equal((await new RoutingStore(workStore).snapshot(work.id)).decision,null);
  config.nativeQualification={provider:NATIVE_PROVIDER,modelId:"anthropic/claude-sonnet-5",scopeId:owner,
    profileHash:nativeProfileHash(config),evidenceRef:"fixture-only:synthetic-host-checks",qualifiedAt:new Date(Date.now()-1000).toISOString(),
    expiresAt:new Date(Date.now()+600000).toISOString()};
  const normal=await authority.read(work);
  config.nativeMode="potato";
  const potato=await authority.read(work);
  assert.equal(normal.contract.composition.mode.id,"normal-mode");
  assert.equal(potato.contract.composition.mode.id,"potato-mode");
  for(const key of ["scope","humanOwnerId","coordinatingAgentId","allowedOperations","resourceRefs","budgetUsd","allowedRoutes","policyVersion"])
    assert.deepEqual(normal.contract[key],potato.contract[key]);
  config.nativeMode="normal";
  const receipt=await admitNativeWork(workStore,work.id,work.version,authority);
  assert.equal(receipt.status,"QUEUED");
  assert.equal((await admitNativeWork(workStore,work.id,work.version,authority)).alreadyAdmitted,true);
  assert.equal((await authority.assertEffect(work.id)).runId,receipt.runId);
  config.nativeQualification.profileHash="f".repeat(64);
  await assert.rejects(authority.assertEffect(work.id),/authority changed/);
  config.nativeQualification.profileHash=nativeProfileHash(config);
  const budget=new NativeModelBudget(workStore,authority);
  const input={workId:work.id,sessionId:"native-session",stepKey:"native-session:turn:0",requestHash:digest({input:"bounded"}),modelId:"anthropic/claude-sonnet-5",microUsd:400000,maxCalls:5};
  const raced=await Promise.allSettled([budget.reserve(input),budget.reserve({...input,stepKey:"native-session:turn:1"})]);
  assert.equal(raced.filter(result=>result.status==="fulfilled").length,1);
  const winning={...input,stepKey:raced[0].status==="fulfilled"?input.stepKey:"native-session:turn:1"};
  await assert.rejects(new NativeModelBudget(workStore,authority).reserve(winning),/uncertain/);
  await assert.rejects(budget.assertSession(work.id,input.sessionId),/uncertain/);
  await budget.settle(winning,120000,{content:[{type:"text",text:"Retained result"}]});
  assert.deepEqual((await new NativeModelBudget(workStore,authority).reserve(winning)).result,{content:[{type:"text",text:"Retained result"}]});
  await assert.rejects(budget.reserve({...winning,requestHash:digest("changed")}),/changed/);
  await assert.rejects(budget.reserve({...input,stepKey:"native-session:turn:2",sessionId:"another-session"}),/writer session/);
  await budget.assertSession(work.id,input.sessionId);
  await assert.rejects(budget.reserve({...input,stepKey:"native-session:over-budget:3",microUsd:2000001}),/budget/);
  const [ledger]=await pool.query(`SELECT * FROM engineering_native_runtime WHERE work_id=$1`,[work.id]).then(result=>result.rows);
  assert.equal(Number(ledger.calls_started),1);assert.equal(Number(ledger.spent_microusd),120000);assert.equal(Number(ledger.reserved_microusd),0);

  const directConfig={profile,approvedBase:config.approvedBase,objective:config.objective,criteria:config.criteria,agentId,issueNumber:1,
    assertCurrentAuthority:id=>authority.assertEffect(id)};
  const direct=new DirectDevelopmentStore(workStore,directConfig);
  await assert.rejects(new DirectDevelopmentStore(workStore,{...directConfig,assertCurrentAuthority:undefined}).requireAdmission(work.id),/trusted runtime host/);
  let workspace=await direct.open(work.id,source);
  workspace=await direct.plan(work.id,workspace.revision,"Implement the bounded parser and request independent checks.");
  workspace=await direct.write(work.id,workspace.revision,"quantity.mjs","console.log(1);\n");
  const submitted=await direct.submit(work.id,workspace.revision);
  await assert.rejects(new NativeResultStore(direct).retain(work.id),/independently checked/);
  const verifier={verify:async(contract,candidate)=>profile.checks.map(check=>{
    const artifact={stdout:"1\n",stderr:"",exitCode:0};
    return {workId:work.id,candidate:candidate.sha,base:source.sha,criteriaVersion:work.criteriaVersion,
      profileHash:digest(profile),environment:profile.image,attemptId:candidate.attemptId,producer:"protected-supervisor",
      check:check.id,result:"PASS",artifact,artifactHash:digest(artifact),observedAt:new Date().toISOString()};
  })};
  await new DirectVerificationDriver(direct,verifier).run(work.id);
  const retained=await new NativeResultStore(direct).retain(work.id);
  assert.equal(retained.proof.resultRevision,submitted.candidate.sha);assert.equal(retained.proof.outcome,"PARTIAL");
  const freshDirect=new DirectDevelopmentStore(new WorkStore(workStore.principal,database),directConfig);
  assert.equal((await new NativeResultStore(freshDirect).retain(work.id)).id,retained.id);
  const truth=(await new EngineeringWorkerProjectionStore(workStore).get(work.id)).projection;
  assert.equal(truth.nativeResult.id,retained.id);
  // Successful local verification must never satisfy the Ready contract.
  assert.equal(truth.readiness.ready,false);assert.notEqual(truth.status,"Ready for Review");
  assert.match(truth.readiness.reasons.join(" "),/PARTIAL.*Publication/);
  assert.equal(truth.nativeResult.proof.outcome,"PARTIAL");
  await assert.rejects(pool.query("UPDATE engineering_native_results SET proof='{}' WHERE id=$1",[retained.id]),/immutable/);
  await assert.rejects(pool.query("DELETE FROM engineering_native_results WHERE id=$1",[retained.id]),/immutable/);

  // Kill real Node processes at both sides of model-result custody. No live
  // model is called: this checks durable host behavior, not provider cancellation.
  for(const settled of [false,true]) {
    const recovering=await prepare(settled?"Retained model process recovery":"Ambiguous model process loss");
    await admitNativeWork(workStore,recovering.id,recovering.version,authority);
    const reservation={...input,workId:recovering.id,stepKey:`native-session:crash:${settled?1:0}`};
    const child=fork(new URL('./native-process-fixture.mjs',import.meta.url),[],{execArgv:['--import','tsx'],stdio:['ignore','ignore','pipe','ipc']});
    try {
      const event=Promise.race([once(child,'message'),once(child,'exit').then(()=>{throw new Error('Native child exited before custody checkpoint.');}),
        new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Native child checkpoint timeout.')),10000);timer.unref();})]);
      child.send({databaseURL:url.href,config,reservation,settle:settled});
      const [checkpoint]=await event;assert.equal(checkpoint.state,settled?'SETTLED':'RESERVED');
      const exited=once(child,'exit');child.kill('SIGKILL');const [,signal]=await exited;assert.equal(signal,'SIGKILL');
      const fresh=new NativeModelBudget(new WorkStore(workStore.principal,database),authority);
      if(settled)assert.deepEqual((await fresh.reserve(reservation)).result,{content:[{type:'text',text:'Retained before process loss'}]});
      else {
        await assert.rejects(fresh.reserve(reservation),/uncertain/);
        await assert.rejects(fresh.reserve({...reservation,stepKey:'native-session:crash:2'}),/budget|writer session/);
        await assert.rejects(fresh.assertSession(recovering.id,input.sessionId),/uncertain/);
      }
      const [custody]=(await pool.query('SELECT calls_started,reserved_microusd FROM engineering_native_runtime WHERE work_id=$1',[recovering.id])).rows;
      assert.equal(Number(custody.calls_started),1);assert.equal(Number(custody.reserved_microusd),settled?0:input.microUsd);
    } finally {child.kill('SIGKILL');}
  }

  if (process.env.MYEVE_NATIVE_UI_FIXTURE==="1") {
    const pending=await prepare("Native development needs qualification");
    const {writeFile}=await import("node:fs/promises");
    const uiConfig={...config};delete uiConfig.nativeQualification;
    await writeFile("/private/tmp/native-ui-fixture.json",JSON.stringify({databaseURL:url.href,owner,agentId,verifiedWorkId:work.id,pendingWorkId:pending.id,config:uiConfig}));
  }
  await pool.query("UPDATE agents SET updated_at=clock_timestamp(),instructions='Changed policy' WHERE id=$1",[agentId]);
  await assert.rejects(authority.assertEffect(work.id),/authority changed/);
  const uncertain=await prepare("Ambiguous model outcome");
  await admitNativeWork(workStore,uncertain.id,uncertain.version,authority);
  const ambiguous={...input,workId:uncertain.id,stepKey:"native-session:turn:3"};
  await budget.reserve(ambiguous);await budget.unknown(ambiguous);
  await assert.rejects(budget.reserve({...ambiguous,stepKey:"native-session:turn:4"}),/denied|unavailable/);
  const paused=await prepare("Pause fences provider calls");await admitNativeWork(workStore,paused.id,paused.version,authority);
  await workStore.change(paused.id,{operation:"pause",expectedVersion:paused.version});
  await assert.rejects(budget.reserve({...input,workId:paused.id}),/authority changed/);
  const historical=(await new EngineeringWorkerProjectionStore(workStore).get(work.id)).projection.nativeResult;
  assert.equal(historical.id,retained.id);
  console.log("Native host: trusted qualification, admission, policy/Agent/pause fences, concurrent spend, single-session writer, fresh-instance replay, real SIGKILL before/after model result custody, uncertain-call denial, immutable independent result and shared projection passed (synthetic fixture).");
} finally {
  await pool?.end();
  url.pathname="/postgres";
  if(process.env.MYEVE_NATIVE_UI_FIXTURE!=="1")await admin.query(`DROP DATABASE IF EXISTS ${name}`);
  await admin.end();
}
