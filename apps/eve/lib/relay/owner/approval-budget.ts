import { db } from "../../../agent/lib/receipts-db.ts";
import type { ExecutionDatabase } from "../../execution-types.ts";

/** Pause only an admitted, exact pending channel Action while its active deadline is valid. */
export async function pauseOwnerApprovalBudget(ownerId:string,runId:string,actionId:string,database:ExecutionDatabase=db() as ExecutionDatabase){
 await database.query(`WITH paused AS (
  UPDATE owner_channel_requests w SET remaining_runtime_ms=GREATEST(0,LEAST(r.max_duration_seconds*1000,FLOOR(EXTRACT(EPOCH FROM(r.deadline_at-clock_timestamp()))*1000)::integer))
  FROM task_runs r JOIN action_requests a ON a.owner_id=r.owner_id AND a.run_id=r.id
   JOIN task_approval_decisions p ON p.owner_id=a.owner_id AND p.task_id=a.run_id AND p.id=a.approval_id
  WHERE w.owner_id=$1 AND w.run_id=$2 AND r.owner_id=w.owner_id AND r.id=w.run_id AND a.id=$3
   AND w.remaining_runtime_ms IS NULL AND w.budget_resumed_at IS NULL AND w.revoked_at IS NULL AND w.expires_at>now()
   AND r.status='awaiting_approval' AND r.deadline_at>clock_timestamp() AND a.status='awaiting_approval'
   AND p.status='pending' AND p.expires_at>now()
  RETURNING w.owner_id,w.run_id
 ) UPDATE task_runs r SET deadline_at=NULL,updated_at=now()
 FROM paused WHERE r.owner_id=paused.owner_id AND r.id=paused.run_id AND r.status='awaiting_approval'`,[ownerId,runId,actionId]);
}

/** Restore only the saved active-time remainder, once, after canonical approval. */
export async function resumeOwnerApprovalBudget(ownerId:string,runId:string,actionId:string,database:ExecutionDatabase=db() as ExecutionDatabase){
 await database.query(`WITH resumed AS (
  UPDATE owner_channel_requests w SET budget_resumed_at=now()
  FROM task_runs r JOIN action_requests a ON a.owner_id=r.owner_id AND a.run_id=r.id
   JOIN task_approval_decisions p ON p.owner_id=a.owner_id AND p.task_id=a.run_id AND p.id=a.approval_id
  WHERE w.owner_id=$1 AND w.run_id=$2 AND r.owner_id=w.owner_id AND r.id=w.run_id AND a.id=$3
   AND w.budget_resumed_at IS NULL AND w.revoked_at IS NULL AND w.expires_at>now()
   AND w.remaining_runtime_ms>0 AND r.status='awaiting_approval' AND r.deadline_at IS NULL AND a.status='awaiting_approval'
   AND p.status='approved' AND p.expires_at>now()
  RETURNING w.owner_id,w.run_id,w.remaining_runtime_ms
 ) UPDATE task_runs r SET deadline_at=now()+resumed.remaining_runtime_ms*interval '1 millisecond',updated_at=now()
 FROM resumed WHERE r.owner_id=resumed.owner_id AND r.id=resumed.run_id AND r.status='awaiting_approval'`,[ownerId,runId,actionId]);
 const invalid=await database.query(`SELECT w.run_id FROM owner_channel_requests w JOIN task_runs r ON r.owner_id=w.owner_id AND r.id=w.run_id
  WHERE w.owner_id=$1 AND w.run_id=$2 AND (w.budget_resumed_at IS NULL OR w.remaining_runtime_ms<=0 OR r.deadline_at IS NULL OR r.deadline_at<=clock_timestamp())`,[ownerId,runId]);
 if(invalid.length)throw new Error("Owner approval active-time budget unavailable.");

}
