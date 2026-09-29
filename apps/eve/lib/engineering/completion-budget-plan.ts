/** Pure planning only: no reservation, grant, provider call or independent balance. */
export interface CompletionStage {
  purpose: "IMPLEMENTATION" | "CHECK_INTERPRETATION" | "REPAIR" | "SUBMISSION" | "FINAL_EXPLANATION";
  calls: number;
  maxInputBytes: number;
  maxOutputTokens: number;
}
export interface CompletionPricing {
  input: number; output: number; cachedInput: number; cacheCreationInput: number;
}
export function planCompletionBudget(input: {
  ceilingMicroUsd: number; spentMicroUsd: number; reservedMicroUsd: number;
  usageUnknown: boolean; stages: CompletionStage[]; pricing: CompletionPricing;
}) {
  const integer = (n: number) => Number.isSafeInteger(n) && n >= 0;
  if (![input.ceilingMicroUsd,input.spentMicroUsd,input.reservedMicroUsd].every(integer) ||
      Object.values(input.pricing).some(n => !Number.isFinite(n) || n <= 0) || !input.stages.length)
    throw new Error("Exact nonnegative accounting and positive provider pricing are required.");
  const required = ["IMPLEMENTATION","CHECK_INTERPRETATION","REPAIR","SUBMISSION","FINAL_EXPLANATION"];
  if (required.some(purpose => !input.stages.some(stage => stage.purpose === purpose)) ||
      new Set(input.stages.map(stage=>stage.purpose)).size !== input.stages.length)
    throw new Error("Every completion stage must have one explicit bound.");
  const stages = input.stages.map(stage => {
    if (![stage.calls,stage.maxInputBytes,stage.maxOutputTokens].every(n=>integer(n)&&n>0))
      throw new Error("Completion slots need positive call, request-byte and output-token bounds.");
    // Match the existing conservative provider wrapper: bytes bound input tokens,
    // add envelope allowance, use highest input/cache rate and 2x pricing margin.
    const perCallMicroUsd = Math.ceil(2*((stage.maxInputBytes+4096)*Math.max(input.pricing.input,
      input.pricing.cachedInput,input.pricing.cacheCreationInput)+stage.maxOutputTokens*input.pricing.output)*1_000_000);
    return {...stage,perCallMicroUsd,commitmentMicroUsd:stage.calls*perCallMicroUsd};
  });
  const completionMicroUsd=stages.reduce((sum,stage)=>sum+stage.commitmentMicroUsd,0);
  const requiredMicroUsd=input.spentMicroUsd+input.reservedMicroUsd+completionMicroUsd;
  if (![completionMicroUsd,requiredMicroUsd,...stages.map(s=>s.commitmentMicroUsd)].every(integer))
    throw new Error("Completion accounting exceeds safe integer precision.");
  const fits=!input.usageUnknown && requiredMicroUsd<=input.ceilingMicroUsd;
  return {kind:"PLANNING_ONLY" as const,stages,completionMicroUsd,requiredMicroUsd,
    ceilingMicroUsd:input.ceilingMicroUsd,unallocatedMicroUsd:Math.max(0,input.ceilingMicroUsd-requiredMicroUsd),fits,
    blocker:input.usageUnknown?"UNKNOWN exposure remains reserved; reconcile before admission."
      :!fits?"Minimum bounded completion path exceeds the unchanged Work ceiling."
      :"Atomic shared commitment enforcement is required before productive admission.",
    productiveAdmissionAllowed:false as const};
}
