import { workRequestSchema } from "./contracts.ts";
import { ownerCommandHash } from "./signing.ts";
import { ActionRecovery,recoveryStrategy } from "../../action-recovery.ts";
import { randomUUID } from "node:crypto";
import { Client,type HandleMessageStreamEvent } from "eve/client";
import { db } from "../../../agent/lib/receipts-db.ts";
import { completeDelegatedTask,transitionTask } from "../../task-runs.ts";
import { PendingActionContinuation } from "../../pending-action-continuation.ts";
import { ownerChannelConfiguration } from "./config.ts";
import { OWNER_RUNTIME_HEADER,signOwnerRuntime,type OwnerRuntimeClaim } from "./runtime.ts";
import type { AcceptedOwnerCommand } from "./handoff.ts";

function runtimeHost(){return process.env.VERCEL_URL?`https://${process.env.VERCEL_URL}`:`http://localhost:${process.env.PORT??"3000"}`;}
function runtimeClient(claim:OwnerRuntimeClaim){
 const host=runtimeHost();
 return new Client({host,redirect:"error",headers:()=>({[OWNER_RUNTIME_HEADER]:signOwnerRuntime(claim)})});
}
/** Dispatch is durable and at most once. A lost send response is reconciled by
 * the session recorded inside authenticated turn admission, never another send.
 */
export async function dispatchOwnerRun(accepted:AcceptedOwnerCommand){
 if(!ownerChannelConfiguration().enabled)throw new Error("Owner runtime is not qualified.");
 const {mapping,runId,command}=accepted;const dispatchId=randomUUID();
 // Prepare authentication before crossing the irreversible dispatch boundary.
 const claim={ownerId:mapping.ownerId,agentId:mapping.agentId,runId,dispatchId,expiresAt:Date.now()+60000,purpose:"execute" as const};
 signOwnerRuntime(claim);
 const [row]=await db().query(`WITH dispatched AS (
 UPDATE owner_channel_requests SET dispatch_id=$3,dispatched_at=now() WHERE owner_id=$1 AND run_id=$2
 AND dispatch_id IS NULL AND revoked_at IS NULL AND expires_at>now() RETURNING run_id
 ), started AS (
 UPDATE task_runs SET status='running',started_at=now(),deadline_at=now()+max_duration_seconds*interval '1 second',updated_at=now()
 WHERE owner_id=$1 AND id IN(SELECT run_id FROM dispatched) AND status='queued' RETURNING id
 ) INSERT INTO task_transitions(task_id,from_status,to_status,actor,reason)
 SELECT id,'queued','running','agent','Authenticated owner-channel dispatch' FROM started RETURNING task_id`,[mapping.ownerId,runId,dispatchId]);
 if(!row)return;
 const session=runtimeClient(claim).session();
 try{
  const events=await session.send({message:command.work.message,signal:AbortSignal.timeout(60000),streamReconnectPolicy:{reconnect:false}});
  if(!session.state.sessionId)throw new Error("Eve session identity unavailable.");
  const bound=await db().query(`UPDATE owner_channel_requests SET session_id=$4 WHERE owner_id=$1 AND run_id=$2 AND dispatch_id=$3 AND (session_id IS NULL OR session_id=$4) RETURNING run_id`,[mapping.ownerId,runId,dispatchId,session.state.sessionId]);
  if(!bound.length)throw new Error("Eve session identity changed.");
  await settleOwnerStream(accepted,events);
 }catch{
  // Unknown admission or interrupted observation stays recoverable by STATUS.
  // Authenticated turn admission has already bound the session if it ran.
 }
}
export async function reconcileOwnerRun(accepted:AcceptedOwnerCommand){
 const [row]=await db().query(`SELECT w.session_id,w.dispatch_id,r.status,r.deadline_at FROM owner_channel_requests w JOIN task_runs r ON r.owner_id=w.owner_id AND r.id=w.run_id WHERE w.owner_id=$1 AND w.run_id=$2`,[accepted.mapping.ownerId,accepted.runId]);
 if(!row||!['running','awaiting_approval','waiting_for_owner'].includes(String(row.status)))return;
 let pending=await new PendingActionContinuation().get(accepted.mapping.ownerId,accepted.runId);
 if(pending){
  if(['result_unknown','executing','verifying','recovering'].includes(pending.status)){
   await new ActionRecovery().recover(accepted.mapping.ownerId,pending.actionId,recoveryStrategy);
   pending=await new PendingActionContinuation().get(accepted.mapping.ownerId,accepted.runId);
  }
  if(pending?.status==='completed')await completeDelegatedTask({ownerId:accepted.mapping.ownerId,taskId:accepted.runId,actionId:pending.actionId,summary:'The saved Action has a recorded completion.',evidenceSummary:`Review canonical Action ${pending.actionId} for provider evidence or explicitly labelled owner attestation.`});
  if(pending&&['denied','cancelled','retryable'].includes(pending.status))await transitionTask(accepted.mapping.ownerId,accepted.runId,'cancelled','owner','Saved Action will not be resent; a new request is required.');
  return;
 } // Exact saved Action owns continuation; no model replay.
 if(row.session_id){
  const claim={ownerId:accepted.mapping.ownerId,agentId:accepted.mapping.agentId,runId:accepted.runId,dispatchId:String(row.dispatch_id),expiresAt:Date.now()+60000,purpose:"observe" as const};
  // Eve treats a string as a continuation token, not a durable session ID.
  const stream=runtimeClient(claim).session({sessionId:String(row.session_id),streamIndex:0}).stream({follow:false,startIndex:0,signal:AbortSignal.timeout(5000),streamReconnectPolicy:{reconnect:false}});
  try{await settleOwnerStream(accepted,stream);}catch{
   if(!row.deadline_at||new Date(String(row.deadline_at)).getTime()>=Date.now())throw new Error("Canonical stream observation unavailable.");
  }
 }
 if(row.deadline_at&&new Date(String(row.deadline_at)).getTime()<Date.now()){
  const [current]=await db().query(`SELECT status FROM task_runs WHERE owner_id=$1 AND id=$2`,[accepted.mapping.ownerId,accepted.runId]);
  if(current?.status==="running")await transitionTask(accepted.mapping.ownerId,accepted.runId,"failed","agent","Runtime deadline reached; dispatch is never repeated.");
 }
}
async function settleOwnerStream(accepted:AcceptedOwnerCommand,events:AsyncIterable<HandleMessageStreamEvent>){
 let summary="",completed=false,failed=false;
 for await(const event of events){
  if(event.type==="message.completed"&&event.data.finishReason!=="tool-calls")summary=event.data.message??"";
  if(event.type==="turn.completed")completed=true;
  if(["turn.failed","turn.cancelled","session.failed"].includes(event.type))failed=true;
 }
 const {mapping,runId}=accepted;
 if(await new PendingActionContinuation().get(mapping.ownerId,runId))return;
 if(completed&&!failed&&summary.trim())await completeDelegatedTask({ownerId:mapping.ownerId,taskId:runId,summary,evidenceSummary:"Canonical Eve session reached turn.completed with no pending Action."});
 else if(failed)await transitionTask(mapping.ownerId,runId,"failed","agent","Canonical Eve turn did not complete.");
}

/** Scheduled wake-up reuses the admitted request; it never admits work or
 * dispatches another Eve session after the durable dispatch boundary. */
export async function ownerChannelCycle(){
 const config=ownerChannelConfiguration();if(!config.enabled||!config.trust)return;
 const [cancelled]=await db().query(`SELECT w.owner_id,w.run_id,w.agent_id FROM owner_channel_requests w JOIN task_runs r ON r.owner_id=w.owner_id AND r.id=w.run_id WHERE r.status IN ('cancelled','failed') AND w.session_id IS NOT NULL AND w.cancel_acknowledged_at IS NULL ORDER BY w.last_observed_at NULLS FIRST LIMIT 1`);
 if(cancelled)await cancelOwnerRuntime(String(cancelled.owner_id),String(cancelled.run_id),String(cancelled.agent_id));
 const rows=await db().query(`SELECT w.* FROM owner_channel_requests w JOIN task_runs r ON r.owner_id=w.owner_id AND r.id=w.run_id
 WHERE r.status IN ('queued','running','awaiting_approval','waiting_for_owner') AND w.revoked_at IS NULL
 ORDER BY w.last_observed_at NULLS FIRST,w.admitted_at LIMIT 1`);
 for(const row of rows){
  const work=workRequestSchema.parse(row.request);
  if(ownerCommandHash(work)!==row.work_hash)throw new Error("Persisted owner Work Request changed.");
  const mapping=config.trust.mappings.find(m=>m.enabled&&m.relayAccountId===work.accountId&&m.relayOwnerPrincipalId===work.ownerPrincipalId&&m.relayAgentId===work.agentId&&m.sourceIdentity===work.sourceIdentity&&m.ownerId===row.owner_id&&m.agentId===row.agent_id);
  if(!mapping||new Date(String(row.expires_at)).getTime()<=Date.now()){
   await db().query(`UPDATE owner_channel_requests SET revoked_at=now() WHERE owner_id=$1 AND run_id=$2`,[row.owner_id,row.run_id]);
   await transitionTask(String(row.owner_id),String(row.run_id),'cancelled','owner','Owner channel mapping unavailable or request expired.');continue;
  }
  const accepted={mapping,runId:String(row.run_id),command:{commandId:`local-observe:${row.run_id}`,operation:'status' as const,work}};
  try{if(!row.dispatch_id)await dispatchOwnerRun(accepted);else await reconcileOwnerRun(accepted);}
  finally{await db().query(`UPDATE owner_channel_requests SET last_observed_at=now() WHERE owner_id=$1 AND run_id=$2`,[row.owner_id,row.run_id]);}
 }
 // Signatures expire after sixty seconds. Keep a day of replay evidence, then
 // bound cleanup without removing canonical Runs, Actions, receipts or Outcomes.
 await db().query(`DELETE FROM owner_channel_nonces WHERE nonce IN(SELECT nonce FROM owner_channel_nonces WHERE expires_at<now()-interval '1 day' LIMIT 1000)`);
}

/** Canonical cancellation wins first; cooperative Eve cancellation follows.
 * Provider work already transmitted remains governed by Action recovery. */
export async function cancelOwnerRuntime(ownerId:string,runId:string,agentId:string){
 const config=ownerChannelConfiguration();if(!config.enabled)return;
 const [row]=await db().query(`SELECT w.session_id,w.dispatch_id FROM owner_channel_requests w JOIN task_runs r ON r.owner_id=w.owner_id AND r.id=w.run_id WHERE w.owner_id=$1 AND w.run_id=$2 AND w.agent_id=$3 AND r.status IN ('cancelled','failed') AND w.cancel_acknowledged_at IS NULL`,[ownerId,runId,agentId]);
 if(!row?.session_id)return;
 const claim={ownerId,runId,agentId,dispatchId:String(row.dispatch_id),expiresAt:Date.now()+60000,purpose:'cancel' as const};
 try{
  const response=await fetch(new URL(`/eve/v1/session/${encodeURIComponent(String(row.session_id))}/cancel`,runtimeHost()),{method:'POST',headers:{'content-type':'application/json',[OWNER_RUNTIME_HEADER]:signOwnerRuntime(claim)},body:'{}',redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!response.ok)return;
  const result=await response.json() as {sessionId?:string;status?:string};
  if(result.sessionId!==row.session_id||!['accepted','no_active_turn'].includes(result.status??''))return;
  await db().query(`UPDATE owner_channel_requests SET cancel_acknowledged_at=now() WHERE owner_id=$1 AND run_id=$2 AND session_id=$3`,[ownerId,runId,row.session_id]);
 }finally{await db().query(`UPDATE owner_channel_requests SET last_observed_at=now() WHERE owner_id=$1 AND run_id=$2`,[ownerId,runId]);}
}
