import { completeDelegatedTask,transitionTask } from "../../task-runs.ts";
import { db } from "../../../agent/lib/receipts-db.ts";
import { ActionGateway,type ActionAdapter } from "../../action-gateway.ts";
import { ActionRecovery } from "../../action-recovery.ts";
import { decideApproval } from "../../approvals.ts";
import { PendingActionContinuation } from "../../pending-action-continuation.ts";
import type { ExecutionDatabase } from "../../execution-types.ts";
import type { AcceptedOwnerCommand } from "./handoff.ts";
import { ownerCommandHash } from "./signing.ts";

/** Canonical decisions only. Adapter selection is server-owned; no provider or
 * target authority is accepted from Telegram text/callback parameters.
 */
export class OwnerRunControl {
 constructor(private readonly database:ExecutionDatabase=db() as ExecutionDatabase){}
 async apply(accepted:AcceptedOwnerCommand,resolveAdapter:(capability:string)=>ActionAdapter<unknown>){
  const {command,mapping,runId}=accepted;
  const [binding]=await this.database.query(`SELECT r.id FROM owner_channel_requests w
   JOIN task_runs r ON r.owner_id=w.owner_id AND r.id=w.run_id
   JOIN agents a ON a.owner_id=w.owner_id AND a.id=w.agent_id
   WHERE w.relay_account_id=$1 AND w.request_id=$2 AND w.owner_id=$3 AND w.agent_id=$4
    AND w.source_identity=$5 AND w.run_id=$6 AND w.revoked_at IS NULL AND w.expires_at>now() AND a.status='active'`,
  [command.work.accountId,command.work.requestId,mapping.ownerId,mapping.agentId,mapping.sourceIdentity,runId]);
  if(!binding)throw new Error("Owner channel binding unavailable.");
  const decision=command.decision;
  if(!decision || !["approval","recovery"].includes(command.operation))throw new Error("Exact decision required.");
  const continuation=new PendingActionContinuation(this.database),pending=await continuation.get(mapping.ownerId,runId);
  if(!pending||pending.action.executor.agentId!==mapping.agentId||pending.action.trigger.kind!=="owner_chat")throw new Error("Canonical pending action unavailable.");
  if(command.operation==="approval"){
   if(pending.approvalId!==decision.reference||pending.bindingHash!==decision.bindingHash||!["approve","reject"].includes(decision.choice))throw new Error("Approval binding changed.");
   const [approval]=await this.database.query(`SELECT status,decision FROM task_approval_decisions WHERE owner_id=$1 AND task_id=$2 AND id=$3 AND binding_hash=$4 AND expires_at>now()`,[mapping.ownerId,runId,pending.approvalId,pending.bindingHash]);
   const choice=decision.choice==="approve"?"approved":"denied";
   if(!approval)throw new Error("Approval unavailable or expired.");
   if(approval.status==="pending")await decideApproval({ownerId:mapping.ownerId,id:pending.approvalId!,bindingHash:pending.bindingHash,decision:choice,decidedBy:mapping.ownerId});
   else if(approval.status!==choice||approval.decision!==choice)throw new Error("Approval already decided differently.");
   if(choice==="denied"){
    const [run]=await this.database.query(`SELECT status FROM task_runs WHERE owner_id=$1 AND id=$2`,[mapping.ownerId,runId]);
    if(run?.status!=="cancelled")await transitionTask(mapping.ownerId,runId,"cancelled","owner","Exact Action rejected by owner.");
    return {state:"DENIED" as const,runId,actionId:pending.actionId};
   }
   const result=await continuation.resumeOwner({ownerId:mapping.ownerId,runId,agentId:mapping.agentId},new ActionGateway(this.database),resolveAdapter(pending.action.capabilityId));
   await completeDelegatedTask({ownerId:mapping.ownerId,taskId:runId,actionId:result.actionId,summary:"The approved action has a recorded completion.",evidenceSummary:`Canonical Action ${result.actionId} contains the provider receipt or explicitly labelled recovery evidence.`});
   return {state:"COMPLETED" as const,runId,...result};
  }
  const [action]=await this.database.query(`SELECT parameter_hash,updated_at::text AS revision,status FROM action_requests WHERE owner_id=$1 AND run_id=$2 AND id=$3`,[mapping.ownerId,runId,pending.actionId]);
  if(!action||decision.reference!==pending.actionId||decision.bindingHash!==ownerCommandHash([pending.actionId,action.parameter_hash,action.revision])||action.status!=="needs_you")throw new Error("Recovery binding changed.");
  if(decision.choice==="unresolved")return {state:"UNRESOLVED" as const,runId,actionId:pending.actionId};
  if(!["occurred","not_occurred"].includes(decision.choice))throw new Error("Invalid recovery decision.");
  const state=await new ActionRecovery(this.database).resolveByOwner(mapping.ownerId,pending.actionId,decision.choice as "occurred"|"not_occurred",String(action.revision));
  if(!state)throw new Error("Recovery decision changed.");
  // No adapter resolution or execution occurs on any recovery choice.
  return {state,runId,actionId:pending.actionId};
 }
}
