import { z } from "zod";
import { behaviorSchema, digest } from "./learning.ts";
import { recallItemSchema } from "./retrieval-contract.ts";
import type { SofieRecallContext } from "./sofie-adapter.ts";

/** Deterministic comparable-Work consumer, not Sofie or a model simulator.
 * It exercises the supplied-context contract and a real acceptance check:
 * decisions in a reviewable plan must cite current, non-conflicting evidence. */
export function consumeRecallFixture(context:SofieRecallContext, expectedCurrentStatements:readonly string[]) {
  if(digest(context.content)!==context.attribution.contentHash)throw new Error("Supplied context changed.");
  // Consume the actual serialized message, not the adapter's side-channel DTO.
  const supplied=z.object({items:z.array(recallItemSchema),learning:z.array(z.object({behavior:behaviorSchema}))}).parse(JSON.parse(context.content.slice(context.content.indexOf("\n")+1)));
  const cites=supplied.learning.some(l=>l.behavior==="cite_sources");
  const facts=supplied.items.filter(i=>i.truth==="CURRENT");
  const unresolved=supplied.items.filter(i=>["CONFLICTING","UNCERTAIN"].includes(i.truth));
  const plan=facts.map(item=>({statement:item.text,memoryId:item.identity,sources:cites?item.provenance.map(p=>p.reference):[]}));
  const actual=new Set(plan.map(p=>p.statement)),expected=new Set(expectedCurrentStatements);
  const correctness=expected.size ? [...actual].filter(s=>expected.has(s)).length / Math.max(actual.size,expected.size) : 0;
  const missing=plan.filter(step=>!step.sources.length);
  const steps=[...plan.map(p=>`Use current evidence: ${p.statement}${p.sources.length?` [${p.sources.join(", ")}]`:""}`),
    ...missing.flatMap(p=>[`Find source for ${p.memoryId}`,`Ask owner to confirm ${p.memoryId}`]),
    ...unresolved.map(i=>`Resolve ${i.truth.toLowerCase()} evidence ${i.identity} before treating it as current`)];
  return {qualification:"DETERMINISTIC_CONSUMER" as const,plan,steps,contextHash:context.attribution.contentHash,
    usedMemoryIds:plan.map(p=>p.memoryId),usedLearningVersions:context.attribution.learningVersions,
    metrics:{correctness,acceptance:correctness===1&&!missing.length?1:0,unnecessarySteps:missing.length*2,
      retrievalRelevance:supplied.items.length?supplied.items.reduce((n,i)=>n+i.relevance,0)/supplied.items.length:0,
      failureCount:missing.length,clarificationCount:missing.length+unresolved.length},authorityGrants:[] as readonly []};
}
