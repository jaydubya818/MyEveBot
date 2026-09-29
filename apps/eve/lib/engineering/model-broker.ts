import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { ExecutionStore } from "./execution-store.ts";
import { WorkError } from "./types.ts";

export function attemptToken(secret: string, workId: string, attempt: string) {
  if (secret.length<32) throw new Error("A dedicated broker signing secret is required.");
  return createHmac("sha256",secret).update(`${workId}:${attempt}`).digest("hex");
}
/** A candidate can spend only the finite admitted allowance of its current attempt. */
export async function brokerMessage(input: {
  store: ExecutionStore; workId: string; attemptId: string; token: string; secret: string;
  body: string; model: string; maxInputRate: number; outputRate: number;
  upstream: (body: string) => Promise<Response>;
}): Promise<Response> {
  const expected=attemptToken(input.secret,input.workId,input.attemptId);
  if (input.token.length!==expected.length || !timingSafeEqual(Buffer.from(input.token),Buffer.from(expected)))
    throw new WorkError("broker_denied","Attempt authorization is invalid.",403);
  const work=await input.store.workStore.get(input.workId), state=await input.store.get(input.workId);
  const run=state?.runs.at(-1);
  if (!state || !run || run.attemptId!==input.attemptId || run.status!=="running" || work.control!=="agent" || work.lifecycle!=="active" ||
    work.generation!==run.generation || Date.now()>=Date.parse(state.contract.deadline)) throw new WorkError("broker_fenced","Attempt authority is no longer current.",403);
  if (Buffer.byteLength(input.body)>180000) throw new WorkError("broker_bound","Model input exceeds the admitted bound.",413);
  const body=JSON.parse(input.body);
  const allowedKeys=new Set(["model","messages","max_tokens","system","tools","tool_choice","stream","temperature","top_p","top_k","stop_sequences","thinking","output_config","metadata","context_management","service_tier"]);
  if(Object.keys(body).some(key=>!allowedKeys.has(key)) || (body.service_tier && !["auto","standard"].includes(body.service_tier)))
    throw new WorkError("broker_scope","Unqualified provider features or premium service tiers are denied.",403);
  if (body.model!==input.model || !Array.isArray(body.messages) || !Number.isInteger(body.max_tokens) || body.max_tokens<1 || body.max_tokens>state.contract.profile.maxOutputTokens ||
    body.tools?.some((t:any)=>t.type && t.type!=="custom") || body.thinking?.type==="adaptive") throw new WorkError("broker_scope","Unsupported model request; no provider tools, model changes or unbounded thinking.",403);
  if (![input.maxInputRate,input.outputRate].every(n=>Number.isFinite(n)&&n>0)) throw new Error("Current pricing is required.");
  // Byte count bounds ordinary token input; 2x pricing margin also covers protocol overhead.
  const reserved=Math.ceil(2*((Buffer.byteLength(input.body)+4096)*input.maxInputRate+body.max_tokens*input.outputRate)*1e6)/1e6;
  const id=randomUUID(), p=input.store.workStore.principal;
  const rows=await input.store.workStore.database.query(`WITH debit AS (
    UPDATE engineering_execution e SET reserved_usd=reserved_usd+$4,model_requests=model_requests+1
    WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 AND reserved_usd+$4<=$5 AND model_requests<$6
    AND state->>'phase'='executing' AND (state->>'generation')::bigint=$7
    AND state->'runs'->-1->>'attemptId'=$9::text AND state->'runs'->-1->>'status'='running'
    AND (state->'contract'->>'deadline')::timestamptz>now()
    AND EXISTS(SELECT 1 FROM engineering_work w WHERE w.scope_id=$1 AND w.scope_kind=$2 AND w.id=$3 AND w.generation=$7 AND w.control='agent' AND w.lifecycle='active')
    RETURNING scope_id,scope_kind,work_id
  ) INSERT INTO engineering_model_calls(id,scope_id,scope_kind,work_id,attempt_id,reserved_usd,state)
    SELECT $8,scope_id,scope_kind,work_id,$9::uuid,$4,'RESERVED' FROM debit RETURNING id`,
    [p.scopeId,p.scopeKind,work.id,reserved,state.contract.budgetUsd,state.contract.limits.maxModelRequests,work.generation,id,run.attemptId]);
  if (!rows.length) throw new WorkError("model_budget_exhausted","Attempt budget or authority no longer permits a model call.",403);
  try {
    // No retries or automatic provider fallback. Reservation survives ambiguous responses.
    const response=await input.upstream(input.body);
    const payload=await response.arrayBuffer();
    if (payload.byteLength>2000000) throw new Error("Model response exceeded bound.");
    await input.store.workStore.database.query(`UPDATE engineering_model_calls SET state='RETURNED' WHERE id=$1`,[id]);
    return new Response(payload,{status:response.status,headers:{"content-type":response.headers.get("content-type")??"application/json"}});
  } catch(error) {
    await input.store.workStore.database.query(`UPDATE engineering_model_calls SET state='UNKNOWN' WHERE id=$1`,[id]);
    throw error;
  }
}
