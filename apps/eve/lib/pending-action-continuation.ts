import { db } from "../agent/lib/receipts-db.ts";
import type { ActionAdapter, ActionGateway, ActionRequest } from "./action-gateway.ts";
import type { ExecutionDatabase } from "./execution-types.ts";

/** Reuses the existing private checkpoint table. A checkpoint is not authority.
 * Its historical table name is retained to avoid a destructive migration.
 * One terminal pending action per Run; a second different action fails closed.
 */
export class PendingActionContinuation {
  constructor(private readonly database: ExecutionDatabase = db() as ExecutionDatabase) {}

  async save(action: ActionRequest, actionId: string): Promise<void> {
    const ownerRequest = action.trigger.kind === "owner_chat"
      && ["primary-agent", "persistent-agent", "on-demand-role"].includes(action.executor.kind)
      && !action.occurrence && !action.delivery;
    const routineRequest = action.trigger.kind === "scheduled_occurrence"
      && action.executor.kind === "routine" && Boolean(action.occurrence) && !action.delivery;
    if (!ownerRequest && !routineRequest) throw new Error("Unsupported continuation authority.");
    const saved = await this.database.query(`INSERT INTO routine_pending_sends(owner_id,run_id,action_id,request)
      SELECT $1,$2,$3,$4::jsonb FROM action_requests a
      JOIN task_runs r ON r.owner_id=a.owner_id AND r.id=a.run_id
      WHERE a.owner_id=$1 AND a.run_id=$2 AND a.id=$3 AND a.status='awaiting_approval'
        AND a.action_key=$5 AND a.capability_id=$6 AND r.agent_id=$7
        AND a.executor=$8::jsonb AND a.trigger=$9::jsonb
      ON CONFLICT(owner_id,run_id) DO UPDATE SET action_id=routine_pending_sends.action_id
      WHERE routine_pending_sends.action_id=EXCLUDED.action_id AND routine_pending_sends.request=EXCLUDED.request
      RETURNING action_id`, [action.ownerId, action.runId, actionId, JSON.stringify(action),
      action.actionKey, action.capabilityId, action.executor.agentId, JSON.stringify(action.executor), JSON.stringify(action.trigger)]);
    if (!saved.length) throw new Error("Pending action checkpoint changed or unavailable.");
  }

  async get(ownerId: string, runId: string) {
    const found = await this.database.query(`SELECT p.request,p.action_id,a.status,a.parameter_hash,a.approval_id,
        r.thread_id,r.agent_id FROM routine_pending_sends p
      JOIN action_requests a ON a.owner_id=p.owner_id AND a.id=p.action_id AND a.run_id=p.run_id
      JOIN task_runs r ON r.owner_id=p.owner_id AND r.id=p.run_id
      WHERE p.owner_id=$1 AND p.run_id=$2`, [ownerId, runId]);
    const row = found[0];
    if (!row) return null;
    const action = row.request as ActionRequest;
    if (action.ownerId !== ownerId || action.runId !== runId || action.executor.agentId !== row.agent_id) {
      throw new Error("Pending action identity changed.");
    }
    return { action, actionId: String(row.action_id), status: String(row.status),
      bindingHash: String(row.parameter_hash), approvalId: row.approval_id ? String(row.approval_id) : null,
      resultReference: row.thread_id ? String(row.thread_id) : null };
  }

  async resumeOwner<Result>(identity: { ownerId: string; runId: string; agentId: string },
    gateway: ActionGateway, adapter: ActionAdapter<Result>, signal?: AbortSignal) {
    const pending = await this.get(identity.ownerId, identity.runId);
    if (!pending || pending.action.executor.agentId !== identity.agentId
      || pending.action.trigger.kind !== "owner_chat" || pending.action.occurrence || pending.action.delivery
      || !["primary-agent", "persistent-agent", "on-demand-role"].includes(pending.action.executor.kind)) {
      throw new Error("Owner continuation binding unavailable.");
    }
    // Recovery's retryable state never means automatic resend after a callback.
    if (!["awaiting_approval", "completed"].includes(pending.status)) {
      throw new Error("Pending action requires canonical recovery or a new owner request.");
    }
    return gateway.execute(pending.action, adapter, signal);
  }
}
