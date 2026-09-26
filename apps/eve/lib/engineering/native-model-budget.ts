import { WorkError } from "./types.ts";
import { NativeRouteAuthority } from "./native-routing.ts";
import { WorkStore } from "./store.ts";

export interface NativeModelReservation {
  workId: string; sessionId: string; stepKey: string; requestHash: string; modelId: string;
  microUsd: number; maxCalls: number;
}
/** A persistent single-session writer, with no expiry-based takeover. A fresh
 * process may resume the same session, but an ambiguous provider call stops it. */
export class NativeModelBudget {
  constructor(readonly store: WorkStore, readonly authority = new NativeRouteAuthority(store)) {}
  private scope(id: string) { return [this.store.principal.scopeId, this.store.principal.scopeKind, id]; }

  async reserve(input: NativeModelReservation): Promise<{ result: unknown } | null> {
    if (!Number.isSafeInteger(input.microUsd) || input.microUsd <= 0 || input.microUsd > 100_000_000 ||
        !Number.isSafeInteger(input.maxCalls) || input.maxCalls < 1 || input.maxCalls > 30 ||
        !input.sessionId || input.stepKey.length > 300 || !/^.+:\d+$/.test(input.stepKey) ||
        !/^[a-f0-9]{64}$/.test(input.requestHash) || !input.modelId)
      throw new WorkError("native_model_bound", "A bounded, replay-safe model request is required.");
    const current = await this.authority.assertEffect(input.workId);
    const scope = this.scope(input.workId);
    const [prior] = await this.store.database.query(
      `SELECT c.*,r.session_id FROM engineering_native_model_calls c JOIN engineering_native_runtime r USING(scope_id,scope_kind,work_id)
       WHERE c.scope_id=$1 AND c.scope_kind=$2 AND c.work_id=$3 AND c.step_key=$4`, [...scope, input.stepKey]);
    if (prior) {
      if (prior.session_id !== input.sessionId || prior.request_hash !== input.requestHash || prior.model_id !== input.modelId || prior.status !== "COMPLETED")
        throw new WorkError("native_model_uncertain", "The model step changed or has an uncertain outcome. No repeat call is authorized.");
      return { result: prior.result };
    }
    await this.store.database.query(
      `INSERT INTO engineering_native_runtime(scope_id,scope_kind,work_id,route_run_id,session_id)
       VALUES($1,$2,$3,$4,$5) ON CONFLICT(scope_id,scope_kind,work_id) DO NOTHING`, [...scope, current.runId, input.sessionId]);
    // UPDATE serializes concurrent reservations and re-evaluates the allowance on
    // the newest locked row. A conflicting step INSERT rolls back this debit.
    const rows = await this.store.database.query(
      `WITH reserved AS (
         UPDATE engineering_native_runtime n SET reserved_microusd=n.reserved_microusd+$6,
           calls_started=n.calls_started+1,inflight=true,updated_at=clock_timestamp()
         FROM engineering_work w,engineering_route_runs r,agents a
         WHERE n.scope_id=$1 AND n.scope_kind=$2 AND n.work_id=$3 AND n.session_id=$4
           AND n.route_run_id=$5 AND NOT n.inflight AND NOT n.usage_unknown
           AND n.reserved_microusd+n.spent_microusd+$6<=$7 AND n.calls_started<$8
           AND w.scope_id=n.scope_id AND w.scope_kind=n.scope_kind AND w.id=n.work_id
           AND w.version=$9 AND w.generation=$10 AND w.control='agent' AND w.lifecycle='active'
           AND r.id=n.route_run_id AND r.status IN ('QUEUED','RUNNING')
           AND n.calls_started<a.max_steps AND a.owner_id=n.scope_id AND a.id=$11 AND a.status='active' AND a.updated_at::text=$12::text
           AND $13::timestamptz>clock_timestamp()
         RETURNING n.scope_id,n.scope_kind,n.work_id
       ) INSERT INTO engineering_native_model_calls(scope_id,scope_kind,work_id,step_key,request_hash,model_id,reserved_microusd,status)
       SELECT scope_id,scope_kind,work_id,$14,$15,$16,$6,'INFLIGHT' FROM reserved RETURNING step_key`,
      [...scope, input.sessionId, current.runId, input.microUsd, Math.floor(current.contract.budgetUsd * 1_000_000), input.maxCalls,
        current.contract.workVersion, current.binding.workGeneration, current.binding.agentId, current.binding.agentRevision,
        current.contract.deadline, input.stepKey, input.requestHash, input.modelId]);
    if (!rows.length) throw new WorkError("native_model_budget", "Work budget, writer session or current authority does not permit another model call.", 403);
    return null;
  }

  async settle(input: NativeModelReservation, microUsd: number, result: unknown) {
    if (!Number.isSafeInteger(microUsd) || microUsd < 0 || microUsd > input.microUsd || Buffer.byteLength(JSON.stringify(result)) > 2_000_000) {
      await this.unknown(input);
      throw new WorkError("native_model_usage", "Provider usage is missing or exceeds the reserved bound.");
    }
    const rows = await this.store.database.query(
      `WITH settled AS (
         UPDATE engineering_native_model_calls SET status='COMPLETED',spent_microusd=$6,result=$7::jsonb,completed_at=clock_timestamp()
         WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 AND step_key=$4 AND request_hash=$5 AND status='INFLIGHT'
         RETURNING scope_id,scope_kind,work_id,reserved_microusd
       ) UPDATE engineering_native_runtime n SET reserved_microusd=n.reserved_microusd-s.reserved_microusd,
         spent_microusd=n.spent_microusd+$6,inflight=false,updated_at=clock_timestamp()
       FROM settled s WHERE n.scope_id=s.scope_id AND n.scope_kind=s.scope_kind AND n.work_id=s.work_id RETURNING n.work_id`,
      [...this.scope(input.workId), input.stepKey, input.requestHash, microUsd, JSON.stringify(result)]);
    if (!rows.length) throw new WorkError("native_model_settlement", "The model call was already settled or fenced.");
  }

  async unknown(input: NativeModelReservation) {
    await this.store.database.query(
      `WITH uncertain AS (UPDATE engineering_native_model_calls SET status='UNKNOWN'
         WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 AND step_key=$4 AND request_hash=$5 AND status='INFLIGHT'
         RETURNING scope_id,scope_kind,work_id)
       UPDATE engineering_native_runtime n SET usage_unknown=true,updated_at=clock_timestamp()
       FROM uncertain u WHERE n.scope_id=u.scope_id AND n.scope_kind=u.scope_kind AND n.work_id=u.work_id`,
      [...this.scope(input.workId), input.stepKey, input.requestHash]);
  }

  async assertSession(workId: string, sessionId: string) {
    const [row] = await this.store.database.query(
      `SELECT 1 FROM engineering_native_runtime WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3
       AND session_id=$4 AND NOT inflight AND NOT usage_unknown`, [...this.scope(workId), sessionId]);
    if (!row) throw new WorkError("native_writer_session", "Use the native Work's admitted writer session. An uncertain model call must be reconciled first.", 403);
  }
}
