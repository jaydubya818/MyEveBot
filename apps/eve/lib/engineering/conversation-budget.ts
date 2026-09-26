import { digest } from "./contract.ts";
import { NativeRouteAuthority } from "./native-routing.ts";
import { WorkStore } from "./store.ts";
import { WorkError } from "./types.ts";
import type { NativeModelReservation } from "./native-model-budget.ts";

/** Additional spending fence across admission, execution and read-only recovery.
 * Never creates or changes native route/session/writer custody. */
export class EngineeringConversationBudget {
  constructor(readonly store: WorkStore, readonly authority = new NativeRouteAuthority(store)) {}
  private scope(id: string) { return [this.store.principal.scopeId, this.store.principal.scopeKind, id]; }

  async reserve(input: NativeModelReservation): Promise<{result: unknown} | null> {
    if (!Number.isSafeInteger(input.microUsd) || input.microUsd <= 0 || input.microUsd > 100_000_000 ||
        !Number.isSafeInteger(input.maxCalls) || input.maxCalls < 1 || input.maxCalls > 30 ||
        !input.sessionId || !/^.+:\d+$/.test(input.stepKey) || input.stepKey.length > 300 ||
        !/^[a-f0-9]{64}$/.test(input.requestHash))
      throw new WorkError("conversation_bound", "A bounded, replay-safe model step is required.");
    const current = await this.authority.read(await this.store.get(input.workId));
    const config = await this.authority.readConfig();
    if (input.modelId !== `anthropic/${config.model}` || !current.facts.workActive ||
        current.facts.authority !== "ALLOW" || current.facts.qualifications.DEEP_AGENT?.status !== "QUALIFIED")
      throw new WorkError("conversation_authority", "Current owner, Work, Agent and qualified model are required.", 403);
    const scope = this.scope(input.workId), binding = digest({...current.binding,workVersion:current.contract.workVersion,criteriaVersion:current.contract.criteriaVersion});
    const [old] = await this.store.database.query(`SELECT c.* FROM engineering_conversation_calls c
      JOIN engineering_conversation_budget b USING(scope_id,scope_kind,work_id)
      WHERE c.scope_id=$1 AND c.scope_kind=$2 AND c.work_id=$3 AND c.step_key=$4
        AND b.binding_hash=$5 AND b.deadline>clock_timestamp() AND NOT b.usage_unknown`, [...scope,input.stepKey,binding]);
    if (old) {
      if (old.session_id !== input.sessionId || old.request_hash !== input.requestHash ||
          old.model_id !== input.modelId || old.status !== "COMPLETED")
        throw new WorkError("conversation_uncertain", "Changed or uncertain calls cannot be repeated.");
      return {result:old.result};
    }
    // Existing native charges are brought forward once, never reset or refunded.
    await this.store.database.query(`INSERT INTO engineering_conversation_budget
      (scope_id,scope_kind,work_id,binding_hash,ceiling_microusd,deadline,max_calls,calls_started,spent_microusd,reserved_microusd,usage_unknown)
      SELECT $1,$2,$3,$4,$5,$6,$7,COALESCE(n.calls_started,0),COALESCE(n.spent_microusd,0),COALESCE(n.reserved_microusd,0),COALESCE(n.usage_unknown OR n.inflight,false)
      FROM (SELECT 1) seed LEFT JOIN engineering_native_runtime n ON n.scope_id=$1 AND n.scope_kind=$2 AND n.work_id=$3
      ON CONFLICT(scope_id,scope_kind,work_id) DO NOTHING`,
      [...scope,binding,Math.floor(current.contract.budgetUsd*1_000_000),current.contract.deadline,Math.min(config.profile.maxModelRequests,input.maxCalls)]);
    const rows = await this.store.database.query(`WITH debit AS (
      UPDATE engineering_conversation_budget b SET reserved_microusd=reserved_microusd+$5,calls_started=calls_started+1,inflight=true
      FROM engineering_work w,agents a
      WHERE b.scope_id=$1 AND b.scope_kind=$2 AND b.work_id=$3 AND b.binding_hash=$4
        AND NOT b.inflight AND NOT b.usage_unknown AND b.deadline>clock_timestamp()
        AND b.spent_microusd+b.reserved_microusd+$5<=b.ceiling_microusd AND b.calls_started<b.max_calls
        AND w.id=b.work_id AND w.scope_id=b.scope_id AND w.scope_kind=b.scope_kind
        AND w.version=$6 AND w.generation=$7 AND w.control='agent' AND w.lifecycle='active'
        AND a.id=$8 AND a.owner_id=b.scope_id AND a.status='active' AND a.updated_at::text=$9::text AND b.calls_started<a.max_steps
      RETURNING b.scope_id,b.scope_kind,b.work_id
    ) INSERT INTO engineering_conversation_calls(scope_id,scope_kind,work_id,step_key,session_id,request_hash,model_id,reserved_microusd,status)
      SELECT scope_id,scope_kind,work_id,$10,$11,$12,$13,$5,'INFLIGHT' FROM debit RETURNING step_key`,
      [...scope,binding,input.microUsd,current.contract.workVersion,current.binding.workGeneration,current.binding.agentId,current.binding.agentRevision,input.stepKey,input.sessionId,input.requestHash,input.modelId]);
    if (!rows.length) throw new WorkError("conversation_budget", "Conversation budget, current authority or uncertain usage prevents another request.",403);
    return null;
  }

  /** Recheck the frozen binding immediately before provider dispatch. */
  async assertDispatch(input: NativeModelReservation) {
    const current=await this.authority.read(await this.store.get(input.workId));
    const [row]=await this.store.database.query(`SELECT 1 FROM engineering_conversation_budget b
      JOIN engineering_conversation_calls c USING(scope_id,scope_kind,work_id)
      WHERE b.scope_id=$1 AND b.scope_kind=$2 AND b.work_id=$3 AND b.binding_hash=$4
        AND b.deadline>clock_timestamp() AND b.inflight AND NOT b.usage_unknown
        AND c.step_key=$5 AND c.session_id=$6 AND c.request_hash=$7 AND c.model_id=$8 AND c.status='INFLIGHT'`,
      [...this.scope(input.workId),digest({...current.binding,workVersion:current.contract.workVersion,criteriaVersion:current.contract.criteriaVersion}),input.stepKey,input.sessionId,input.requestHash,input.modelId]);
    if(!row || !current.facts.workActive || current.facts.authority!=="ALLOW" ||
        current.facts.qualifications.DEEP_AGENT?.status!=="QUALIFIED")
      throw new WorkError("conversation_changed","Conversation authority changed before dispatch.",403);
  }

  async settle(input: NativeModelReservation, microUsd: number, result: unknown) {
    if (!Number.isSafeInteger(microUsd) || microUsd<0 || microUsd>input.microUsd || Buffer.byteLength(JSON.stringify(result))>2_000_000) {
      await this.unknown(input);
      throw new WorkError("conversation_usage", "Unknown or excessive usage remains reserved.");
    }
    const rows=await this.store.database.query(`WITH settled AS (
      UPDATE engineering_conversation_calls SET status='COMPLETED',spent_microusd=$6,result=$7::jsonb
      WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 AND step_key=$4 AND request_hash=$5 AND session_id=$8 AND model_id=$9 AND status='INFLIGHT'
      RETURNING scope_id,scope_kind,work_id,reserved_microusd
    ) UPDATE engineering_conversation_budget b SET spent_microusd=b.spent_microusd+$6,
      reserved_microusd=b.reserved_microusd-s.reserved_microusd,inflight=false
      FROM settled s WHERE b.scope_id=s.scope_id AND b.scope_kind=s.scope_kind AND b.work_id=s.work_id RETURNING b.work_id`,
      [...this.scope(input.workId),input.stepKey,input.requestHash,microUsd,JSON.stringify(result),input.sessionId,input.modelId]);
    if (!rows.length) throw new WorkError("conversation_settlement", "Settlement is already retained or fenced.");
  }

  async unknown(input: NativeModelReservation) {
    await this.store.database.query(`WITH fenced AS (
      UPDATE engineering_conversation_calls SET status='UNKNOWN' WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3
        AND step_key=$4 AND request_hash=$5 AND session_id=$6 AND model_id=$7 AND status='INFLIGHT' RETURNING scope_id,scope_kind,work_id
    ) UPDATE engineering_conversation_budget b SET usage_unknown=true FROM fenced f
      WHERE b.scope_id=f.scope_id AND b.scope_kind=f.scope_kind AND b.work_id=f.work_id`,
      [...this.scope(input.workId),input.stepKey,input.requestHash,input.sessionId,input.modelId]);
  }
}
