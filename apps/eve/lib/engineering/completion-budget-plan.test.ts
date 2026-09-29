import {describe,it,expect} from "vitest";
import {planCompletionBudget,type CompletionStage} from "./completion-budget-plan.ts";
const purposes:CompletionStage["purpose"][]=["IMPLEMENTATION","CHECK_INTERPRETATION","REPAIR","SUBMISSION","FINAL_EXPLANATION"];
const input={ceilingMicroUsd:1_300_000,spentMicroUsd:777654,reservedMicroUsd:0,usageUnknown:false,
 stages:purposes.map(purpose=>({purpose,calls:1,maxInputBytes:1000,maxOutputTokens:100})),
 pricing:{input:0.000003,output:0.000015,cachedInput:0.0000003,cacheCreationInput:0.00000375}};
describe("bounded completion planning",()=>{
 it("prices every required stage using conservative bytes, overhead, worst cache rate and margin",()=>{const p=planCompletionBudget(input);expect(p.completionMicroUsd).toBe(5*Math.ceil(2*(5096*0.00000375+100*0.000015)*1e6));expect(p.fits).toBe(true);expect(p.productiveAdmissionAllowed).toBe(false);});
 it("refuses insufficient remaining budget without expanding ceiling",()=>{const p=planCompletionBudget({...input,spentMicroUsd:1299999});expect(p.fits).toBe(false);expect(p.ceilingMicroUsd).toBe(1300000);});
 it("keeps UNKNOWN exposure reserved even when nominal arithmetic fits",()=>{const p=planCompletionBudget({...input,usageUnknown:true,reservedMicroUsd:100});expect(p.fits).toBe(false);expect(p.requiredMicroUsd).toBe(input.spentMicroUsd+100+p.completionMicroUsd);});
 it("does not hide context growth behind mean observed usage",()=>expect(planCompletionBudget({...input,stages:input.stages.map(s=>({...s,maxInputBytes:50000}))}).fits).toBe(false));
 it("rejects absent repair allowance, zero/unsafe bounds and invalid pricing",()=>{expect(()=>planCompletionBudget({...input,stages:input.stages.slice(1)})).toThrow();expect(()=>planCompletionBudget({...input,stages:input.stages.map(s=>({...s,calls:0}))})).toThrow();expect(()=>planCompletionBudget({...input,pricing:{...input.pricing,input:NaN}})).toThrow();expect(()=>planCompletionBudget({...input,spentMicroUsd:Number.MAX_SAFE_INTEGER})).toThrow();});
 it("is immutable and deterministic across restart; never authorizes concurrent admission",()=>{const before=JSON.stringify(input);expect(planCompletionBudget(input)).toEqual(planCompletionBudget(JSON.parse(before)));expect(JSON.stringify(input)).toBe(before);expect(planCompletionBudget(input).blocker).toContain("Atomic shared commitment");});
});
