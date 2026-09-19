import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { Pool } from "pg";
import { ExecutionStore } from "../lib/execution-store.ts";
import { routineConfigurationSchema } from "../lib/execution-types.ts";
import { ExecutionDelivery } from "../lib/execution-delivery.ts";
import { ActionGateway, ActionBlocked } from "../lib/action-gateway.ts";
import { RoutineReviewStore } from "../lib/routine-review.ts";
import { enqueueReviewedReminders } from "../lib/reminder-execution.ts";
import { resolveExecution } from "../lib/execution-auth.ts";
import { qualifyActionExecutors } from "./action-executor-cases.mjs";
import { qualifyRecovery } from "./action-recovery-cases.mjs";

// Deliberately never reads DATABASE_URL, .env files, or a caller-supplied host.
const pool = new Pool({ host:"127.0.0.1",port:55441,database:"postgres",user:process.env.USER,max:8 });
const schema = `execution_test_${Date.now()}`;
const clients = [];
try {
  const setup = await pool.connect();
  clients.push(setup);
  await setup.query(`CREATE SCHEMA ${schema}`);
  await setup.query(`SET search_path TO ${schema}`);
  const migrationDirectory = new URL("../migrations/",import.meta.url);
  for (const file of (await readdir(migrationDirectory)).filter(f=>f.endsWith(".sql")).sort()) {
    await setup.query(await readFile(new URL(file,migrationDirectory),"utf8"));
  }
  const second = await pool.connect(); clients.push(second);
  await second.query(`SET search_path TO ${schema}`);
  const database = client => ({ query:async (sql,params) => (await client.query(sql,params)).rows });
  const store = new ExecutionStore(database(setup));
  const other = new ExecutionStore(database(second));
  const ownerId="sarah";
  await setup.query(`INSERT INTO agents(id,owner_id,slug,name,role,instructions,is_primary,status,max_steps,max_runtime_seconds,max_estimated_cost_usd)
    VALUES('ava','sarah','ava','Ava','Research assistant','Research',true,'active',30,600,1)`);
  const configuration = routineConfigurationSchema.parse({instructions:"Daily Research Brief",authority:{allowedCapabilities:["web.read"]}});
  await store.createRoutine({id:"daily",ownerId,sourceKind:"manual",sourceId:"daily",name:"Daily Research Brief",agentId:"ava",configuration,changedBy:ownerId});
  const enqueue = {ownerId,routineId:"daily",key:"2026-09-18T08:00:00Z",scheduledFor:"2026-09-18T08:00:00Z"};
  await Promise.all([store.enqueue(enqueue),other.enqueue(enqueue)]);
  assert.equal((await setup.query("SELECT count(*) FROM execution_occurrences")).rows[0].count,"1");
  assert.equal((await setup.query("SELECT count(*) FROM task_runs")).rows[0].count,"1");
  const claims=await Promise.all([store.claim(ownerId,"a",10),other.claim(ownerId,"b",10)]);
  assert.equal(claims.filter(Boolean).length,1);
  const claim=claims.find(Boolean);
  await store.heartbeat(claim,60);
  assert.equal(await other.claim(ownerId,"b"),null);
  await store.fail(claim,"transient_provider_failure");
  assert.equal(await other.claim(ownerId,"b"),null,"backoff prevents immediate retries");
  await setup.query("UPDATE execution_occurrences SET next_attempt_at=now()-interval '1 second'");
  const retry=await other.claim(ownerId,"b");
  assert.equal(retry.attempt,2);
  await assert.rejects(store.heartbeat(claim),/ownership changed/);
  await other.complete(retry,"fixture:research-result");
  assert.equal((await setup.query("SELECT status FROM task_runs")).rows[0].status,"completed");
  assert.equal((await setup.query("SELECT count(*) FROM review_deliveries")).rows[0].count,"1");
  assert.equal((await setup.query("SELECT count(*) FROM execution_attempts")).rows[0].count,"2");
  const notifications = new ExecutionDelivery(database(setup));
  let sends=0;
  await notifications.deliverNext(ownerId,{deliver:async()=>{sends++;return {status:"definitely_failed",retryable:true};}});
  assert.equal((await setup.query("SELECT status FROM task_runs")).rows[0].status,"completed");
  await setup.query("UPDATE review_deliveries SET next_attempt_at=now()-interval '1 second'");
  await notifications.deliverNext(ownerId,{deliver:async()=>{sends++;return {status:"delivered"};}});
  assert.equal(sends,2);
  assert.equal((await setup.query("SELECT count(*) FROM execution_attempts")).rows[0].count,"2");
  assert.equal((await setup.query("SELECT status FROM review_deliveries")).rows[0].status,"delivered");
  await store.enqueue({...enqueue,key:"next"});
  const dying=await store.claim(ownerId,"dead",1);
  await setup.query("UPDATE execution_occurrences SET lease_expires_at=now()-interval '1 second' WHERE id=$1",[dying.occurrenceId]);
  assert.equal(await other.recoverExpired(ownerId),1);
  assert.equal(await other.claim(ownerId,"replacement"),null);
  await assert.rejects(store.complete(dying,"fixture:late-result"),/ownership changed/);
  assert.equal((await setup.query("SELECT status FROM execution_occurrences WHERE id=$1",[dying.occurrenceId])).rows[0].status,"recovery_required");
  await store.enqueue({...enqueue,key:"action"});
  const actionClaim=await store.claim(ownerId,"action-worker");
  const authority={evaluate:async()=>({decision:"ALLOW",source:"test",reason:"fixture grant"})};
  const gateway=new ActionGateway(database(setup),authority);
  const otherGateway=new ActionGateway(database(second),authority);
  const action={ownerId,runId:actionClaim.runId,actionKey:"write-once",capabilityId:"test.write",actionClass:"write",
    executor:{kind:"routine",agentId:"ava"},trigger:{kind:"scheduled_occurrence",id:actionClaim.occurrenceId},parameters:{body:"fixture",password:"synthetic-do-not-persist"},
    occurrence:{id:actionClaim.occurrenceId,claimVersion:actionClaim.version,workerId:actionClaim.workerId}};
  let writes=0;
  const adapter={resolveTarget:async()=>({provider:"fake",account:"sarah",resource:"document"}),execute:async()=>{writes++;return {id:"receipt-1"};},verify:async value=>({verified:true,receipt:{id:value.id,apiKey:"synthetic-do-not-persist"}})};
  const actionResults=await Promise.allSettled([gateway.execute(action,adapter),otherGateway.execute(action,adapter)]);
  if (!writes) throw actionResults.find(result=>result.status==="rejected").reason;
  assert.equal(writes,1,"concurrent actions transmit once");
  await gateway.execute(action,adapter);
  assert.equal(writes,1,"completed action replay returns receipt");
  await assert.rejects(gateway.execute({...action,parameters:{body:"changed"}},adapter),ActionBlocked);
  const uncertain={...action,actionKey:"uncertain-write"};
  await assert.rejects(gateway.execute(uncertain,{...adapter,execute:async()=>{writes++;throw new Error("timeout after transmission");}}),ActionBlocked);
  await assert.rejects(gateway.execute(uncertain,adapter),ActionBlocked);
  assert.equal(writes,2,"unknown action is never retransmitted");
  const unavailable=new ActionGateway(database(setup),{evaluate:async()=>{throw new Error("synthetic-do-not-persist");}});
  await assert.rejects(unavailable.execute({...action,actionKey:"authority-down"},adapter),ActionBlocked);
  await assert.rejects(gateway.execute({...action,actionKey:"target-unresolved"},{...adapter,resolveTarget:async()=>{throw new Error("provider unavailable");}}),ActionBlocked);
  assert.equal(writes,2,"authority and target failures never call the provider");
  const persisted=JSON.stringify((await setup.query("SELECT row_to_json(a) FROM action_requests a")).rows)
    +JSON.stringify((await setup.query("SELECT row_to_json(r) FROM action_receipts r")).rows);
  assert.ok(!persisted.includes("synthetic-do-not-persist"));
  await assert.rejects(store.complete(actionClaim,"fixture:unsafe-result"));
  await store.fail(actionClaim,"timeout");
  assert.equal((await setup.query("SELECT status FROM execution_occurrences WHERE id=$1",[actionClaim.occurrenceId])).rows[0].status,"recovery_required");
  for(let i=0;i<3;i++) {
    await store.enqueue({...enqueue,key:`failure-${i}`});
    await store.fail(await store.claim(ownerId,`failure-worker-${i}`),"invalid_input");
  }
  assert.equal((await setup.query("SELECT status FROM execution_routines")).rows[0].status,"auto_paused");
  assert.equal(await store.enqueue({...enqueue,key:"after-pause"}),null);
  assert.equal(await store.claim(ownerId,"after-pause"),null);
  assert.equal((await setup.query("SELECT count(*) FROM eve_events WHERE type='ROUTINE_AUTO_PAUSED'")).rows[0].count,"1");
  await store.resumeRoutine(ownerId,"daily",1);
  assert.equal((await setup.query("SELECT count(*) FROM execution_attempts WHERE failure_category='invalid_input'")).rows[0].count,"3");
  assert.equal((await setup.query("SELECT status FROM execution_routines")).rows[0].status,"active");
  const reviews=new RoutineReviewStore(database(setup),ownerId);
  const legacy=(await setup.query(`INSERT INTO reminders(prompt,cron,timezone,next_fire_at)
    VALUES('Daily Research Brief','0 9 * * *','UTC',now()-interval '2 days') RETURNING id`)).rows[0];
  assert.equal(await enqueueReviewedReminders(ownerId,database(setup)),0,"legacy reminders cannot execute before review");
  assert.equal((await reviews.list('another-owner')).length,0);
  const review={ownerId,reminderId:legacy.id,expectedVersion:1,agentId:'ava',configuration};
  await assert.rejects(reviews.review({...review,ownerId:'another-owner'}));
  await reviews.review(review);
  await assert.rejects(reviews.review(review),/changed/);
  let reminder=(await setup.query('SELECT * FROM reminders WHERE id=$1',[legacy.id])).rows[0];
  assert.equal(reminder.reviewed_version,1);
  assert.ok(reminder.execution_routine_id);
  assert.ok(new Date(reminder.next_fire_at)>new Date(),"approval does not replay missed recurring runs");
  await setup.query("UPDATE reminders SET next_fire_at=now()-interval '1 second' WHERE id=$1",[legacy.id]);
  assert.equal(await enqueueReviewedReminders(ownerId,database(setup)),1);
  assert.equal(await enqueueReviewedReminders(ownerId,database(setup)),0);
  const reviewedClaim=await store.claim(ownerId,'reviewed-worker');
  assert.ok(reviewedClaim);
  await resolveExecution(reviewedClaim,database(setup));
  await setup.query("UPDATE reminders SET prompt='Changed instructions' WHERE id=$1",[legacy.id]);
  reminder=(await setup.query('SELECT * FROM reminders WHERE id=$1',[legacy.id])).rows[0];
  assert.equal(reminder.configuration_version,2);
  assert.equal(reminder.reviewed_version,null);
  await assert.rejects(resolveExecution(reviewedClaim,database(setup)),/revoked/);
  assert.equal(await enqueueReviewedReminders(ownerId,database(setup)),0);
  await assert.rejects(reviews.review(review),/changed/);
  await reviews.review({...review,expectedVersion:2,configuration:{...configuration,instructions:'Changed instructions'}});
  await assert.rejects(resolveExecution(reviewedClaim,database(setup)),/revoked/,"re-review cannot authorize an old execution");
  await qualifyActionExecutors(setup,database(setup),reviewedClaim);
  await qualifyRecovery(setup,database(setup));
  await store.createRoutine({id:"delivery-policy",ownerId,sourceKind:"manual",sourceId:"delivery-policy",name:"Delivery policy fixture",agentId:"ava",
    configuration:{...configuration,deliveryChannel:"telegram"},changedBy:ownerId});
  await store.enqueue({ownerId,routineId:"delivery-policy",key:"once",scheduledFor:"2026-09-18T08:00:00Z"});
  const deliveryClaim=await store.claim(ownerId,"delivery-worker");
  await store.complete(deliveryClaim,"fixture:completed-work");
  let deliveryProviderCalls=0;
  const deniedDeliveryGateway=new ActionGateway(database(setup),{evaluate:async()=>({decision:"DENY",source:"fixture",reason:"Channel authority revoked"})});
  await notifications.deliverNext(ownerId,{deliver:async delivery=>{
    try {
      await deniedDeliveryGateway.execute({ownerId,runId:delivery.runId,actionKey:`delivery:${delivery.id}`,capabilityId:"notification.send",actionClass:"send",
        executor:{kind:"system",agentId:"ava"},trigger:{kind:"system",id:delivery.id},parameters:{channel:delivery.channel,resultReference:delivery.resultReference},
        delivery:{id:delivery.id,claimVersion:delivery.version,channel:delivery.channel,resultReference:delivery.resultReference}},
        {resolveTarget:async()=>({provider:"telegram",account:ownerId,resource:"fixture-chat"}),execute:async()=>{deliveryProviderCalls++;return {};},verify:async()=>({verified:true,receipt:{}})});
    } catch {return {status:"definitely_failed",retryable:false};}
    return {status:"delivered"};
  }});
  assert.equal(deliveryProviderCalls,0);
  assert.equal((await setup.query("SELECT status FROM task_runs WHERE id=$1",[deliveryClaim.runId])).rows[0].status,"completed");
  assert.equal((await setup.query("SELECT count(*) FROM execution_attempts WHERE occurrence_id=$1",[deliveryClaim.occurrenceId])).rows[0].count,"1");
  console.log('PASS: notification authority denial invokes zero providers and preserves completed work with one execution attempt');
  console.log('PASS: legacy owner review gate; owner isolation; duplicate/stale reviews; atomic linkage; no backlog replay; edit revocation; stale execution stays revoked after re-review');
  console.log("PASS: isolated migrations; duplicate occurrence/run suppression; claim race; heartbeat; stale-worker fence; bounded retry; delivery failure/recovery without rerun; action deduplication; changed parameters; unknown-result replay refusal; worker death; auto-pause, single notice and owner resume");
} finally {
  if(clients[0]) await clients[0].query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  for(const client of clients) client.release();
  await pool.end();
}
