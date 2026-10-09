import { db } from "../../../agent/lib/receipts-db.ts";
import type { ExecutionDatabase } from "../../execution-types.ts";

export interface ModelReservation {
  ownerId: string;
  runId: string;
  stepKey: string;
  requestHash: string;
  modelId: string;
  microUsd: number;
  tokens: number;
}

/** A call crosses the uncertainty boundary when this reservation commits.
 * Crashes, cancellation and transport errors never refund an ambiguous call.
 * Completed calls may replay their durable result, but may not call the model again.
 */
export class OwnerModelBudget {
  constructor(private readonly database: ExecutionDatabase = db() as ExecutionDatabase) {}

  async reserve(input: ModelReservation): Promise<{ result: unknown } | null> {
    if (!Number.isSafeInteger(input.microUsd) || input.microUsd <= 0 || input.microUsd > 5_000_000 ||
        !Number.isSafeInteger(input.tokens) || input.tokens <= 0 || input.tokens > 12000 ||
        !input.stepKey || !input.modelId || !input.requestHash) throw new Error("Invalid model reservation.");
    const values = [input.ownerId, input.runId, input.stepKey, input.requestHash, input.modelId, input.microUsd, input.tokens];
    const [prior] = await this.database.query(
      `SELECT status,result,request_hash,model_id FROM owner_model_calls WHERE owner_id=$1 AND run_id=$2 AND step_key=$3`, values.slice(0, 3));
    if (prior) {
      if (prior.request_hash !== input.requestHash || prior.model_id !== input.modelId || prior.status !== "completed") {
        throw new Error("Model attempt is ambiguous or its material request changed; no retry authorized.");
      }
      return { result: prior.result };
    }
    // UPDATE row locking serializes concurrent reservations. A conflicting step
    // INSERT rolls back its UPDATE in the same statement, including its counters.
    const admitted = await this.database.query(`WITH reserved AS (
      UPDATE owner_channel_requests w SET
        model_reserved_microusd=w.model_reserved_microusd+$6,
        tokens_reserved=w.tokens_reserved+$7,model_calls_started=w.model_calls_started+1
      FROM task_runs r,agents a
      WHERE w.owner_id=$1 AND w.run_id=$2 AND r.owner_id=w.owner_id AND r.id=w.run_id
        AND a.owner_id=w.owner_id AND a.id=w.agent_id AND a.status='active'
        AND w.revoked_at IS NULL AND w.expires_at>now() AND NOT w.usage_unknown
        AND r.status='running' AND r.deadline_at>now()
        AND w.model_calls_started<LEAST(8,r.max_model_steps,a.max_steps)
        AND w.tokens_used+w.tokens_reserved+$7<=12000
        AND w.model_spent_microusd+w.model_reserved_microusd+$6<=LEAST(100000,5000000,FLOOR(r.max_estimated_cost_usd*1000000),FLOOR(a.max_estimated_cost_usd*1000000))
      RETURNING w.owner_id,w.run_id
    ) INSERT INTO owner_model_calls(owner_id,run_id,step_key,request_hash,model_id,reserved_microusd,reserved_tokens,status)
      SELECT owner_id,run_id,$3,$4,$5,$6,$7,'inflight' FROM reserved RETURNING step_key`, values);
    if (!admitted.length) throw new Error("Model budget exhausted or execution authority unavailable.");
    return null;
  }

  async settle(input: ModelReservation, usage: { microUsd: number; tokens: number }, result: unknown) {
    if (!Number.isSafeInteger(usage.microUsd) || usage.microUsd < 0 || usage.microUsd > input.microUsd ||
        !Number.isSafeInteger(usage.tokens) || usage.tokens < 0 || usage.tokens > input.tokens) {
      await this.unknown(input);
      throw new Error("Model usage unavailable or outside its reserved bound.");
    }
    const rows = await this.database.query(`WITH settled AS (
      UPDATE owner_model_calls SET status='completed',spent_microusd=$4,used_tokens=$5,result=$6::jsonb,completed_at=now()
      WHERE owner_id=$1 AND run_id=$2 AND step_key=$3 AND status='inflight' AND request_hash=$7
      RETURNING owner_id,run_id,reserved_microusd,reserved_tokens
    ), accounted AS (
      UPDATE owner_channel_requests w SET model_reserved_microusd=w.model_reserved_microusd-s.reserved_microusd,
        model_spent_microusd=w.model_spent_microusd+$4,tokens_reserved=w.tokens_reserved-s.reserved_tokens,tokens_used=w.tokens_used+$5
      FROM settled s WHERE w.owner_id=s.owner_id AND w.run_id=s.run_id RETURNING w.run_id
    ) UPDATE task_runs SET estimated_cost_usd=estimated_cost_usd+$4::numeric/1000000,model_steps=model_steps+1,updated_at=now()
      WHERE owner_id=$1 AND id IN(SELECT run_id FROM accounted) RETURNING id`,
    [input.ownerId,input.runId,input.stepKey,usage.microUsd,usage.tokens,JSON.stringify(result),input.requestHash]);
    if (!rows.length) throw new Error("Model settlement already recorded or changed.");
  }

  async unknown(input: ModelReservation) {
    await this.database.query(`WITH uncertain AS (
      UPDATE owner_model_calls SET status='unknown' WHERE owner_id=$1 AND run_id=$2 AND step_key=$3 AND status='inflight'
      RETURNING owner_id,run_id
    ) UPDATE owner_channel_requests w SET usage_unknown=true FROM uncertain u WHERE w.owner_id=u.owner_id AND w.run_id=u.run_id`,
    [input.ownerId,input.runId,input.stepKey]);
  }
}
