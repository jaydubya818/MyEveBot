import { EngineeringConversationBudget, type WorkModelReservation } from "./conversation-budget.ts";
import { NativeRouteAuthority } from "./native-routing.ts";
import { WorkStore } from "./store.ts";
import { WorkError } from "./types.ts";

export interface NativeModelReservation {
  workId: string; sessionId: string; stepKey: string; requestHash: string; modelId: string;
  microUsd: number; maxCalls: number;
}
/** Native custody remains a separate restrictive gate. Spending belongs only to the common ledger. */
export class NativeModelBudget extends EngineeringConversationBudget {
  constructor(store: WorkStore, authority = new NativeRouteAuthority(store)) { super(store,authority); }
  override reserve(input: WorkModelReservation) { return super.reserve({...input,purpose:"NATIVE_EXECUTION"}); }
  async assertSession(workId: string, sessionId: string) {
    const [row]=await this.store.database.query(`SELECT 1 FROM engineering_native_runtime n
      WHERE n.scope_id=$1 AND n.scope_kind=$2 AND n.work_id=$3 AND n.session_id=$4 AND NOT n.inflight AND NOT n.usage_unknown
        AND NOT EXISTS(SELECT 1 FROM engineering_work_model_calls c WHERE c.scope_id=n.scope_id AND c.scope_kind=n.scope_kind AND c.work_id=n.work_id
          AND c.purpose='NATIVE_EXECUTION' AND c.status IN ('RESERVED','DISPATCHED','RESULT_RETAINED','USAGE_UNKNOWN'))`,
      [this.store.principal.scopeId,this.store.principal.scopeKind,workId,sessionId]);
    if(!row)throw new WorkError("native_writer_session","Use the admitted writer session; unresolved native calls require reconciliation.",403);
  }
}
