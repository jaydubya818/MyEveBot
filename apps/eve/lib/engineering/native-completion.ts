import { z } from "zod";
import { WorkStore } from "./store.ts";
import { WorkError } from "./types.ts";
import { NativeRouteAuthority } from "./native-routing.ts";
import { digest } from "./contract.ts";

export const nativeCompletionPolicySchema=z.object({
  inputBytes:z.number().int().min(5120).max(180000).default(14336),
  implementationCalls:z.number().int().min(5).max(12).default(5),
  repairCalls:z.number().int().min(3).max(6).default(3),
  explanationCalls:z.literal(1).default(1),
  repairIterations:z.literal(1).default(1),
}).strict();
export type CompletionStage="IMPLEMENT"|"REPAIR"|"EXPLAIN";
export function completionExposure(pricing:Record<string,unknown>,inputBytes:number,maxOutputTokens:number) {
  const rates=[pricing.input,pricing.output,pricing.cachedInputTokens??pricing.input,pricing.cacheCreationInputTokens??pricing.input].map(Number);
  if(rates.some(rate=>!Number.isFinite(rate)||rate<=0))throw new WorkError("completion_pricing","Current complete provider pricing is required.");
  return Math.ceil(2*(inputBytes*Math.max(rates[0],rates[2],rates[3])+maxOutputTokens*rates[1])*1_000_000);
}
export function completionPlan(policy: z.infer<typeof nativeCompletionPolicySchema>,pricing:Record<string,unknown>,maxOutputTokens:number) {
  const microUsd=completionExposure(pricing,policy.inputBytes,maxOutputTokens);
  const stages=[{id:"IMPLEMENT",calls:policy.implementationCalls,microUsd},{id:"REPAIR",calls:policy.repairCalls,microUsd},{id:"EXPLAIN",calls:policy.explanationCalls,microUsd}];
  return {stages,maxExposureMicrousd:stages.reduce((n,s)=>n+s.calls*s.microUsd,0),inputBytes:policy.inputBytes,maxOutputTokens,repairIterations:policy.repairIterations};
}
/** Prepared from the exact admitted conversation's retained pricing. SQL installs
 * the contract atomically with the route; this read is not a reservation. */
export async function prepareNativeCompletion(store:WorkStore,authority:NativeRouteAuthority,workId:string,sessionId:string) {
  const work=await store.get(workId),current=await authority.read(work),config=await authority.readConfig();
  const [call]=await store.database.query(`SELECT c.pricing,c.model_id,b.deadline,b.budget_version
    FROM engineering_work_model_calls c JOIN engineering_work_model_budget b USING(scope_id,scope_kind,work_id)
    WHERE c.scope_id=$1 AND c.scope_kind=$2 AND c.work_id=$3 AND c.session_id=$4
      AND c.actor_id=$1 AND c.work_version=$5 AND c.work_generation=$6 AND c.agent_revision=$7
      AND c.policy_hash=$8 AND c.status='RECONCILED' AND c.result_at>clock_timestamp()-interval '2 minutes'
    ORDER BY c.created_at DESC,c.id DESC LIMIT 1`,[store.principal.scopeId,store.principal.scopeKind,workId,sessionId,work.version,work.generation,current.binding.agentRevision,digest(config)]);
  if(!call||call.model_id!==`anthropic/${config.model}`||!config.nativeQualification)throw new WorkError("completion_pricing","A current budgeted admission conversation with retained pricing is required.");
  const pricing={...call.pricing,cachedInputTokens:call.pricing.cachedInputTokens??call.pricing.input,cacheCreationInputTokens:call.pricing.cacheCreationInputTokens??call.pricing.input};
  const plan=completionPlan(config.nativeCompletion,pricing,config.profile.maxOutputTokens);
  if(plan.stages.reduce((n,s)=>n+s.calls,0)>config.profile.maxModelRequests)throw new WorkError("completion_calls","The configured workflow exceeds the Work call limit; no productive admission.");
  return {...plan,version:1,state:"ACTIVE",workId,workVersion:work.version,workGeneration:work.generation,
    agentId:current.binding.agentId,agentRevision:current.binding.agentRevision,policyHash:digest(config),policyVersion:config.profile.policyVersion,
    budgetVersion:Number(call.budget_version),sessionId,workflow:"native-engineering-v1",modelId:call.model_id,
    qualification:config.nativeQualification,pricing,createdAt:new Date().toISOString(),
    expiresAt:new Date(Math.min(Date.parse(String(call.deadline)),Date.parse(current.contract.deadline),Date.parse(config.nativeQualification.expiresAt))).toISOString()};
}
export async function nativeCompletionState(store:WorkStore,workId:string) {
  const [row]=await store.database.query(`SELECT d.admission_authority_snapshot->'completion' AS contract,
    w.phase,w.revision,w.plan,w.source_files,w.draft_files,w.candidates,w.evidence
    FROM engineering_routing_decisions d LEFT JOIN engineering_direct_workspaces w
      ON w.scope_id=d.scope_id AND w.scope_kind=d.scope_kind AND w.work_id=d.work_id
    WHERE d.scope_id=$1 AND d.scope_kind=$2 AND d.work_id=$3 AND d.status='ADMITTED'
    ORDER BY d.admitted_at DESC,d.id DESC LIMIT 1`,[store.principal.scopeId,store.principal.scopeKind,workId]);
  if(!row?.contract)throw new WorkError("completion_missing","No bounded completion contract is admitted; historical Runs cannot be resumed.");
  const count=row.candidates?.length??0;
  const stage:CompletionStage=row.phase==="VERIFICATION_PASSED"||(row.phase==="VERIFICATION_FAILED"&&count>1)?"EXPLAIN":count>0?"REPAIR":"IMPLEMENT";
  return {contract:row.contract,stage,workspace:row,waiting:row.phase==="VERIFICATION_REQUESTED"};
}
