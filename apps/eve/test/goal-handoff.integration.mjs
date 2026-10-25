import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {integrationRuntime} from "./fixtures/goal-work/integration-runtime.mjs";
const rt = await integrationRuntime();
try {
 const owner=rt.service("alice","owner"), agent=rt.service("alice","agent");
 const goalId=randomUUID(), taskId=randomUUID();
 await owner.create({id:goalId,objective:"Disposable coding project",criteria:["Combined candidate independently verified"]});
 await owner.addTask(goalId,{id:taskId,objective:"Implement bounded role",criteria:["Role tests pass"],assignedTo:"coder-one",provenance:{kind:"owner",reference:"qualification"}});
 let goal=await rt.queries().goal(goalId);
 const input={commandId:randomUUID(),expectedRevision:goal.revision,expectedTaskGeneration:1,assignedTo:"coder-two",reason:"Retain plan and transfer role before dispatch"};
 await assert.rejects(agent.handoffTask(goalId,taskId,input),/Owner decision/);
 await assert.rejects(rt.service("bob","owner").handoffTask(goalId,taskId,input),/not found/i);
 const first=await owner.handoffTask(goalId,taskId,input);
 await owner.handoffTask(goalId,taskId,input); // replay succeeds despite the old revision
 await assert.rejects(owner.handoffTask(goalId,taskId,{...input,reason:"different"}),/identity conflict/);
 goal=await rt.queries().goal(goalId);assert.equal(goal.tasks[0].assignedTo,"coder-two");
 assert.equal(goal.history.filter(e=>e.type==="TASK_HANDOFF").length,1);
 const context=await owner.context(goalId,taskId);
 const [a,b]=await Promise.all([owner.continue(context),owner.continue(context)]);
 assert.equal(a.workId,b.workId);
 const [linked]=await rt.raw.query("SELECT request FROM goal_work_links WHERE owner_id='alice' AND task_id=$1",[taskId]);
 assert.deepEqual(linked.request.continuation,first.context);
 assert.equal(linked.request.assignedTo,"coder-two");
 goal=await rt.queries().goal(goalId);
 const next={...input,commandId:randomUUID(),expectedRevision:goal.revision,expectedTaskGeneration:context.taskGeneration,assignedTo:"coder-one"};
 await assert.rejects(owner.handoffTask(goalId,taskId,next),/deferred/);
 // Simulated canonical terminal reader, not a Factory quiescence claim.
 rt.gateway.continuation=async (ownerId,workId)=>{
  assert.equal(ownerId,"alice");assert.equal(workId,a.workId);
  return {workId,workVersion:2,workGeneration:2,candidate:"a".repeat(40),artifactRefs:["fixture-retained-artifact"],result:null,disposition:"TERMINAL_FENCED"};
 };
 await owner.handoffTask(goalId,taskId,next);
 await rt.restart();
 const resumed=await owner.continue(await owner.context(goalId,taskId));
 assert.notEqual(resumed.workId,a.workId);
 const rows=await rt.raw.query("SELECT request,state FROM goal_work_links WHERE owner_id='alice' AND task_id=$1 ORDER BY created_at",[taskId]);
 assert.equal(rows.length,2);assert.equal(rows[0].state,"superseded");
 assert.equal(rows[1].request.continuation.sources[0].candidate,"a".repeat(40));
 assert.equal(rows[1].request.continuation.fromAgent,"coder-two");
 const [successor]=await rt.raw.query("SELECT input FROM fixture_canonical WHERE owner_id='alice' AND work_id=$1",[resumed.workId]);
 assert.ok(successor.input.objective.includes("Retained continuation context"));
 assert.ok(successor.input.objective.includes("a".repeat(40)));
 assert.equal((await rt.queries().goal(goalId)).status,"active");
 // Full history remains durable while the prompt references a bounded summary.
 const prior=rows[1].request;const large={...prior,correlationKey:randomUUID(),continuation:{fromAgent:"coder-two",reason:"r".repeat(1000),sources:Array.from({length:40},(_,i)=>({...prior.continuation.sources[0],workId:randomUUID(),artifactRefs:["x".repeat(900),"y".repeat(900)]}))}};
 const materialized=await rt.work.ensure(large);
 const [bounded]=await rt.raw.query("SELECT input,intent FROM fixture_canonical WHERE owner_id='alice' AND work_id=$1",[materialized.id]);
 assert.ok(bounded.input.objective.length<=4000);assert.ok(bounded.input.objective.includes("contextSha256"));
 assert.equal(bounded.intent.continuation.sources.length,40);
 console.log(JSON.stringify({mode:"SYNTHETIC_CANONICAL_TERMINAL_READER",passed:true,duplicateWork:0,ownerIsolation:true,restartRetainsContext:true,authorityGranted:false}));
} finally { await rt.close(); }
