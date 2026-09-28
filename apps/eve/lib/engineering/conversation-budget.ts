import { randomUUID } from "node:crypto";
import { digest } from "./contract.ts";
import { NativeRouteAuthority } from "./native-routing.ts";
import { WorkStore } from "./store.ts";
import { WorkError } from "./types.ts";
import type { NativeModelReservation } from "./native-model-budget.ts";

export interface WorkModelReservation extends NativeModelReservation {
  purpose?: "CONVERSATION_REASONING" | "NATIVE_EXECUTION";
  pricing?: unknown;
  bounds?: unknown;
}
/** The sole economic authority. Legacy 0050/0051 rows are read-only evidence. */
export class EngineeringConversationBudget {
  private readonly claims = new Map<string, Record<string, any>>();
  constructor(readonly store: WorkStore, readonly authority = new NativeRouteAuthority(store)) {}
  private key(input: NativeModelReservation) { return `${input.workId}:${input.sessionId}:${input.stepKey}`; }
  async reserve(input: WorkModelReservation): Promise<{result: unknown} | null> {
    if (!Number.isSafeInteger(input.microUsd) || input.microUsd<=0 || input.microUsd>100_000_000 ||
        !Number.isSafeInteger(input.maxCalls) || input.maxCalls<1 || input.maxCalls>30 || !input.sessionId ||
        !/^.+:\d+$/.test(input.stepKey) || input.stepKey.length>300 || !/^[a-f0-9]{64}$/.test(input.requestHash) ||
        !input.pricing || !input.bounds) throw new WorkError("work_model_bound", "Exact pricing, request and output bounds are required.");
    const work=await this.store.get(input.workId), current=await this.authority.read(work), config=await this.authority.readConfig();
    if(input.modelId!==`anthropic/${config.model}` || current.facts.qualifications.DEEP_AGENT?.status!=="QUALIFIED")
      throw new WorkError("work_model_provider","Current qualified provider required.",403);
    const purpose=input.purpose??"CONVERSATION_REASONING";
    const productive=purpose==="NATIVE_EXECUTION"?await this.authority.assertEffect(input.workId):null;
    const id=randomUUID(),token=randomUUID();
    const p={id,token,scope:this.store.principal.scopeId,actor:this.store.principal.actorId,work:input.workId,
      version:work.version,generation:work.generation,agent:current.binding.agentId,agentRevision:current.binding.agentRevision,
      policyHash:digest(config),policyVersion:config.profile.policyVersion,budgetVersion:1,
      ceiling:Math.floor(current.contract.budgetUsd*1_000_000),deadline:new Date(Math.min(Date.parse(current.contract.deadline),Date.parse(config.nativeQualification!.expiresAt))).toISOString(),maxCalls:input.maxCalls,
      session:input.sessionId,step:input.stepKey,request:input.requestHash,purpose,run:productive?.runId,
      provider:"vercel-gateway/anthropic",model:input.modelId,exposure:input.microUsd,pricing:input.pricing,bounds:input.bounds};
    const [row]=await this.store.database.query("SELECT engineering_model_reserve($1::jsonb) AS receipt",[JSON.stringify(p)]);
    const c=row.receipt;
    if(c.status==="RECONCILED") return {result:c.result};
    if(c.id!==id) throw new WorkError("work_model_uncertain","Retained or uncertain request requires reconciliation; no redispatch.");
    this.claims.set(this.key(input),c); return null;
  }
  private async transition(input: NativeModelReservation, operation: string, extra: Record<string,unknown>={}) {
    const c=this.claims.get(this.key(input));
    if(!c) throw new WorkError("work_model_claim","This process has no dispatch claim.");
    const [row]=await this.store.database.query("SELECT engineering_model_transition($1::jsonb) AS receipt",[JSON.stringify({
      id:c.id,token:c.dispatch_token,scope:this.store.principal.scopeId,actor:this.store.principal.actorId,
      request:input.requestHash,operation,...extra})]);
    return row.receipt;
  }
  /** Recovery loads an exact receipt for release/custody/reconciliation. It never dispatches. */
  async recover(input: NativeModelReservation) {
    await this.store.get(input.workId);
    const [c]=await this.store.database.query(`SELECT * FROM engineering_work_model_calls
      WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 AND actor_id=$4 AND session_id=$5 AND step_key=$6 AND request_hash=$7 AND model_id=$8`,
      [this.store.principal.scopeId,this.store.principal.scopeKind,input.workId,this.store.principal.actorId,input.sessionId,input.stepKey,input.requestHash,input.modelId]);
    if(!c)throw new WorkError("receipt_missing","Exact owned receipt required for recovery.");
    this.claims.set(this.key(input),{...c,recoveryOnly:true});
    return {id:c.id,status:c.status,result:c.result,usageReceipt:c.usage_receipt,reservedMicroUsd:Number(c.reserved_microusd)};
  }
  async assertDispatch(input: NativeModelReservation) {
    const config=await this.authority.readConfig();
    const c=this.claims.get(this.key(input));
    if(c?.recoveryOnly)throw new WorkError("recovery_read_only","Recovery cannot redispatch an old request.");
    if(!config.nativeQualification || Date.parse(config.nativeQualification.expiresAt)<=Date.now())
      throw new WorkError("provider_expired","Provider qualification expired before dispatch.",403);
    await this.transition(input,"dispatch",{policyHash:digest(config)});
  }
  async assertOutput(input: NativeModelReservation) {
    const c=this.claims.get(this.key(input));
    if(!c)throw new WorkError("receipt_missing","Output requires the retained call binding.");
    const current=await this.authority.read(await this.store.get(input.workId));
    if(current.contract.workVersion!==c.work_version || current.binding.workGeneration!==c.work_generation ||
       current.binding.agentRevision!==c.agent_revision || current.binding.configurationHash!==c.policy_hash)
      throw new WorkError("output_stale","Usage is retained, but changed authority prevents exposing stale model output.");
  }
  async retain(input: NativeModelReservation, result: unknown, receipt: unknown, semantics="INCREMENTAL") {
    return this.transition(input,"retain",{result,resultHash:digest(result),receipt,semantics});
  }
  async reconcile(input: NativeModelReservation, microUsd: number) {
    if(!Number.isSafeInteger(microUsd)||microUsd<0) throw new WorkError("work_model_usage","Exact incremental usage is required.");
    return this.transition(input,"reconcile",{actual:microUsd,note:"Exact provider response retained before settlement"});
  }
  async settle(input: NativeModelReservation, microUsd: number, result: unknown) {
    const metadata=(result as {providerMetadata?: {gateway?: Record<string,unknown>}})?.providerMetadata?.gateway;
    await this.retain(input,result,{microUsd,source:"gateway.cost",semantics:"INCREMENTAL",providerMetadata:metadata??null,
      providerRequestId:metadata?.generationId??metadata?.requestId??null});
    await this.reconcile(input,microUsd);
  }
  async unknown(input: NativeModelReservation) {
    return this.transition(input,"unknown",{note:"Dispatch outcome uncertain; exposure retained, no automatic retry"});
  }
  async releaseUndispatched(input: NativeModelReservation) {
    return this.transition(input,"release",{note:"Pre-dispatch fenced cancellation"});
  }
}
