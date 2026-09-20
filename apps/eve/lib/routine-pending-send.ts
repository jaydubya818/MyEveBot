import { db } from "../agent/lib/receipts-db.ts";
import { ActionGateway,type ActionAdapter,type ActionRequest } from "./action-gateway.ts";
import type { ExecutionClaim,ExecutionDatabase } from "./execution-types.ts";

/** A checkpoint is a continuation, never an authorization or a resend queue. */
export class RoutinePendingSend {
  private database:ExecutionDatabase;
  constructor(database:ExecutionDatabase=db() as ExecutionDatabase){this.database=database;}
  async save(action:ActionRequest,actionId:string):Promise<void> {
    if(!action.occurrence || action.capabilityId!=="tool.send_email")throw new Error("Unsupported pending action");
    const rows=await this.database.query(`INSERT INTO routine_pending_sends(owner_id,run_id,action_id,request)
      SELECT $1,$2,$3,$4::jsonb FROM action_requests a
      WHERE a.owner_id=$1 AND a.run_id=$2 AND a.id=$3 AND a.status='awaiting_approval'
      ON CONFLICT(owner_id,run_id) DO UPDATE SET action_id=routine_pending_sends.action_id
      WHERE routine_pending_sends.action_id=EXCLUDED.action_id AND routine_pending_sends.request=EXCLUDED.request
      RETURNING action_id`,[action.ownerId,action.runId,actionId,JSON.stringify(action)]);
    if(!rows.length)throw new Error("Routine pending action changed");
  }
  async get(ownerId:string,runId:string):Promise<{action:ActionRequest;status:string;resultReference:string|null}|null> {
    const rows=await this.database.query(`SELECT p.request,a.status,t.thread_id FROM routine_pending_sends p
      JOIN action_requests a ON a.owner_id=p.owner_id AND a.id=p.action_id
      JOIN task_runs t ON t.owner_id=p.owner_id AND t.id=p.run_id
      WHERE p.owner_id=$1 AND p.run_id=$2`,[ownerId,runId]);
    return rows[0]?{action:rows[0].request as ActionRequest,status:String(rows[0].status),resultReference:rows[0].thread_id?String(rows[0].thread_id):null}:null;
  }
  async resume<T>(claim:ExecutionClaim,gateway:ActionGateway,adapter:ActionAdapter<T>,signal?:AbortSignal):Promise<string> {
    const pending=await this.get(claim.ownerId,claim.runId);
    if(!pending?.resultReference || pending.action.occurrence?.id!==claim.occurrenceId
      || pending.action.capabilityId!=="tool.send_email")throw new Error("Pending send checkpoint unavailable");
    await gateway.execute({...pending.action,occurrence:{id:claim.occurrenceId,claimVersion:claim.version,workerId:claim.workerId}},adapter,signal);
    return pending.resultReference;
  }
}
