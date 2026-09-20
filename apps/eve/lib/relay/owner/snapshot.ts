import { db } from "../../../agent/lib/receipts-db.ts";
import type { ExecutionDatabase } from "../../execution-types.ts";
import { PendingActionContinuation } from "../../pending-action-continuation.ts";
import { executionSnapshotSchema,type ExecutionSnapshot } from "./contracts.ts";
import type { AcceptedOwnerCommand } from "./handoff.ts";
import { ownerCommandHash } from "./signing.ts";

/** Projection only: canonical Run/Approval/Action/Outcome remain authoritative. */
export async function ownerRunSnapshot(accepted:AcceptedOwnerCommand,database:ExecutionDatabase=db() as ExecutionDatabase):Promise<ExecutionSnapshot>{
 const {command,mapping,runId}=accepted;
 const [run]=await database.query(`SELECT r.status,r.result_summary,o.id AS result_id FROM task_runs r
  LEFT JOIN outcomes o ON o.owner_id=r.owner_id AND o.run_id=r.id AND o.idempotency_key='task-result:'||r.id
  WHERE r.owner_id=$1 AND r.id=$2 AND r.agent_id=$3`,[mapping.ownerId,runId,mapping.agentId]);
 if(!run)throw new Error("Canonical Run unavailable.");
 const base={requestId:command.work.requestId,ownerPrincipalId:command.work.ownerPrincipalId,agentId:command.work.agentId,runId};
 if(run.status==="completed")return executionSnapshotSchema.parse({...base,state:"COMPLETED",resultId:run.result_id,text:run.result_summary});
 if(run.status==="cancelled"||run.status==="failed")return {...base,state:run.status==="cancelled"?"CANCELLED":"FAILED"};
 const [targetRow]=await database.query(`SELECT target FROM action_requests WHERE owner_id=$1 AND run_id=$2 AND id=(SELECT action_id FROM routine_pending_sends WHERE owner_id=$1 AND run_id=$2)`,[mapping.ownerId,runId]);
 const target=targetRow?.target as {provider?:string;account?:string;resource?:string}|undefined;
 const targetSummary=target?JSON.stringify(target):null;
 const pending=await new PendingActionContinuation(database).get(mapping.ownerId,runId);
 if(pending?.status==="awaiting_approval"){
  const [approval]=await database.query(`SELECT id,binding_hash,expires_at::text AS expires_at,status,estimated_cost_usd FROM task_approval_decisions WHERE owner_id=$1 AND task_id=$2 AND id=$3`,[mapping.ownerId,runId,pending.approvalId]);
  if(approval?.status==="pending")return executionSnapshotSchema.parse({...base,state:"WAITING_APPROVAL",pending:{kind:"approval",reference:approval.id,bindingHash:approval.binding_hash,summary:`Approve ${pending.action.capabilityId}`,consequence:"Executes the saved exact action once; rejection executes nothing.",target:targetSummary,expiresAt:new Date(approval.expires_at as string).toISOString(),estimatedCost:approval.estimated_cost_usd==null?null:String(approval.estimated_cost_usd)}});
 }
 if(pending?.status==="needs_you"){
  const [action]=await database.query(`SELECT updated_at::text AS revision,parameter_hash FROM action_requests WHERE owner_id=$1 AND run_id=$2 AND id=$3`,[mapping.ownerId,runId,pending.actionId]);
  return executionSnapshotSchema.parse({...base,state:"RECOVERY_REQUIRED",pending:{kind:"recovery",reference:pending.actionId,bindingHash:ownerCommandHash([pending.actionId,action.parameter_hash,action.revision]),summary:"The saved action has an unknown outcome",consequence:"Your decision records what happened. It never resends the action.",target:targetSummary,expiresAt:command.work.expiresAt,estimatedCost:null}});
 }
 return {...base,state:"RUNNING"};
}
