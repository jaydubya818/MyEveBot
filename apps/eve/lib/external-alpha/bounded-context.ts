import type { gateway } from "ai";
import { digest } from "../engineering/contract.ts";
import { EXTERNAL_ALPHA_CONTEXT_BYTES } from "./context.ts";
type Options=Parameters<ReturnType<typeof gateway>["doGenerate"]>[0];
type Prompt=Options["prompt"];

const pick=(value: unknown, keys: string[]): Record<string,unknown> => {
 if(!value || typeof value!=="object" || Array.isArray(value))return {};
 const source=value as Record<string,unknown>;
 return Object.fromEntries(keys.filter(key=>source[key]!==undefined).map(key=>[key,source[key]]));
};
/** A data projection, never a permission token. Keep current identities,
 * versions, criterion outcomes and Proof references; omit duplicated event logs. */
export function compactWorkData(value: unknown): Record<string,unknown> {
 const source=value as Record<string,unknown>|null;
 if(!source || typeof source!=="object" || Array.isArray(source))return {dataOnly:true,sourceSha256:digest(value)};
 const work=pick(source.work??source,["id","scopeId","scopeKind","title","objective","version","generation","criteriaVersion","criteria","lifecycle","control"]);
 const projection=pick(source.projection,["status","currentTruth","lastChange","nextStep","readiness","needsYou","lifecycle","currentCandidate","currentAuthority"]);
 const native=pick((source.projection as any)?.nativeResult,["id","resultId","authorityId","candidateSha","contentHash","workVersion","workGeneration","verdict","cleanupConfirmed","settlementState","current"]);
 const proof=pick((source.projection as any)?.nativeResult?.proof,["workId","workVersion","criteriaVersion","outcome","resultRevision","createdAt"]);
 const original=(source.projection as any)?.nativeResult?.proof;
 if(original){
  proof.contentHash=digest(original);
  proof.evidence=Array.isArray(original.evidence)?original.evidence.map((e:unknown)=>pick(e,["criterionId","resultRevision","state","producer","contentHash","observedAt"])):[];
  proof.artifactRefs=Array.isArray(original.artifactRefs)?original.artifactRefs.filter((ref:unknown)=>typeof ref==="string" && /^(factory-evidence:|factory-manifest:|factory-version:|external-alpha-authority:|changed-source:)/.test(ref)):[];
  proof.details="Open this Work's retained Result and Proof for full historical references and limitations; this projection grants no authority.";
 }
 if(Object.keys(proof).length)native.proof=proof;
 if(Object.keys(native).length)projection.nativeResult=native;
 return {dataOnly:true,sourceSha256:digest(value),work,projection,
  receipt:pick(source.receipt,["state","requestId","workOrderId","authorityId","authoritySha256"])};
}

/** Preserve every system message, exact latest owner request and the complete
 * current tool exchange. Window older whole turns, never orphan tool results.
 * An oversized mandatory/current payload still fails closed at 32,000 bytes. */
export function boundedAlphaHistory(prompt:Prompt,tools:Options["tools"]):Prompt {
 const bytes=(p:Prompt)=>Buffer.byteLength(JSON.stringify({prompt:p,tools}));
 if(bytes(prompt)<=EXTERNAL_ALPHA_CONTEXT_BYTES)return prompt;
 let bounded:Prompt=prompt.map(message=>message.role!=="tool"?message:{...message,content:message.content.map(part=>{
  if(part.type!=="tool-result" || !["engineering_work","engineering_factory"].includes(part.toolName) || part.output.type!=="json")return part;
  return {...part,output:{...part.output,value:compactWorkData(part.output.value) as any}};
 })});
 while(bytes(bounded)>EXTERNAL_ALPHA_CONTEXT_BYTES){
  const users=bounded.flatMap((m,i)=>m.role==="user"?[i]:[]);
  if(users.length<2)break;
  const next=users[1];
  bounded=bounded.filter((m,i)=>m.role==="system"||i>=next);
 }
 if(bytes(bounded)>EXTERNAL_ALPHA_CONTEXT_BYTES)throw Error(`EXTERNAL_ALPHA_CONTEXT_BOUND: ${bytes(bounded)}/${EXTERNAL_ALPHA_CONTEXT_BYTES} bytes`);
 return bounded;
}
