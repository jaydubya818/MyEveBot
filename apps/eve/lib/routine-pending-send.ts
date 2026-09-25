import { PendingActionContinuation } from "./pending-action-continuation.ts";
import { db } from "../agent/lib/receipts-db.ts";
import { ActionGateway,type ActionAdapter,type ActionRequest } from "./action-gateway.ts";
import type { ExecutionClaim,ExecutionDatabase } from "./execution-types.ts";

/** A checkpoint is a continuation, never an authorization or a resend queue. */
export class RoutinePendingSend {
  private database:ExecutionDatabase;
  constructor(database:ExecutionDatabase=db() as ExecutionDatabase){this.database=database;}
  async save(action:ActionRequest,actionId:string):Promise<void> {
    if(!action.occurrence || action.capabilityId!=="tool.send_email")throw new Error("Unsupported pending action");
    await new PendingActionContinuation(this.database).save(action,actionId);
  }
  async get(ownerId:string,runId:string) {
    return new PendingActionContinuation(this.database).get(ownerId,runId);
  }

  async resume<T>(claim:ExecutionClaim,gateway:ActionGateway,adapter:ActionAdapter<T>,signal?:AbortSignal):Promise<string> {
    const pending=await this.get(claim.ownerId,claim.runId);
    if(!pending?.resultReference || pending.action.occurrence?.id!==claim.occurrenceId
      || pending.action.capabilityId!=="tool.send_email")throw new Error("Pending send checkpoint unavailable");
    await gateway.execute({...pending.action,occurrence:{id:claim.occurrenceId,claimVersion:claim.version,workerId:claim.workerId}},adapter,signal);
    return pending.resultReference;
  }
}
