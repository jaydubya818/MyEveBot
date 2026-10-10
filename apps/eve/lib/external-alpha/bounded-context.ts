import type { gateway } from "ai";
import { digest } from "../engineering/contract.ts";
import { EXTERNAL_ALPHA_CONTEXT_BYTES } from "./context.ts";
type Options=Parameters<ReturnType<typeof gateway>["doGenerate"]>[0];
type Prompt=Options["prompt"];
export const EXTERNAL_ALPHA_CONTEXT_TARGET_BYTES = 28_000;
/** Hard cap (Decision B, 2026-10-10): the serialized UTF-8 bytes of
 * {"limitations":[...],"limitationsReadback":{...}} — statements AND the
 * omission/truncation disclosure together — never exceed 2,000 bytes. */
export const LIMITATIONS_ALLOCATION_BYTES = 2_000;
const LIMITATIONS_COUNT = 32;
const EXCERPT_SUFFIX = "… [truncated excerpt]";
const LIMITATIONS_NOTE = "Truncated excerpts may omit qualifications or negation. Omitted or unavailable Proof is not verification; read canonical Proof before drawing conclusions.";
const jsonBytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));

/** Longest code-point prefix (preferring a word boundary) whose JSON string,
 * suffix included, fits `budget` bytes. Never splits a surrogate pair or an
 * escape; returns null when not even a minimal excerpt fits. */
function limitationExcerpt(value: string, budget: number): string | null {
 if (jsonBytes(value) <= budget) return value;
 const characters = Array.from(value);
 let low = 0, high = characters.length;
 while (low < high) {
  const middle = Math.ceil((low + high) / 2);
  if (jsonBytes(characters.slice(0, middle).join("") + EXCERPT_SUFFIX) <= budget) low = middle;
  else high = middle - 1;
 }
 if (low < 8) return null;
 const prefix = characters.slice(0, low).join("");
 const space = prefix.search(/\s\S*$/);
 const cut = space >= Math.floor(prefix.length * 0.6) ? prefix.slice(0, space) : prefix;
 return cut + EXCERPT_SUFFIX;
}

/** Retain canonical statements in their original order inside one hard byte
 * budget. Exact duplicates are removed first (redundancy before information);
 * leading canonical statements (verifier verdict, scope restriction) stay whole
 * while they fit; later statements share the remaining space, short ones whole
 * first (water-filling). Anything that cannot be represented is counted and
 * disclosed, never silently dropped. */
function boundedLimitations(value: unknown) {
 const available = Array.isArray(value) && value.every(item => typeof item === "string");
 if (!available) {
  return {limitations: [] as string[], limitationsReadback: {status: "UNAVAILABLE", omittedCount: null, truncatedCount: 0, duplicateCount: 0, note: LIMITATIONS_NOTE}};
 }
 const unique = [...new Set(value as string[])];
 const duplicateCount = (value as string[]).length - unique.length;
 const selected = unique.slice(0, LIMITATIONS_COUNT);
 let omittedCount = unique.length - selected.length;
 // Budget the array against the largest possible disclosure for this input.
 const worstReadback = {status: "INCOMPLETE", omittedCount: unique.length, truncatedCount: selected.length, duplicateCount, note: LIMITATIONS_NOTE};
 const overhead = jsonBytes({limitations: [], limitationsReadback: worstReadback}) - 2;
 const arrayBudget = LIMITATIONS_ALLOCATION_BYTES - overhead;
 let kept: (string | null)[] = [...selected];
 if (jsonBytes(selected) > arrayBudget) {
  // Priority is canonical order: ingestion records the verifier verdict and the
  // scope restriction first. Leading statements stay whole while they fit; the
  // rest share the remaining space (water-filling) or are omitted and counted.
  kept = new Array(selected.length).fill(null);
  let remaining = arrayBudget - 2;
  let lead = 0;
  for (; lead < selected.length; lead++) {
   const cost = jsonBytes(selected[lead]) + (lead ? 1 : 0);
   if (cost > remaining) break;
   kept[lead] = selected[lead]; remaining -= cost;
  }
  const rest = selected.slice(lead).map((item, offset) => ({index: lead + offset, size: jsonBytes(item)})).sort((a, b) => a.size - b.size || a.index - b.index);
  remaining -= rest.length && lead ? rest.length : Math.max(0, rest.length - 1); // separators
  for (let position = 0; position < rest.length; position++) {
   const {index, size} = rest[position];
   const share = Math.floor(Math.max(0, remaining) / (rest.length - position));
   const excerpt = size <= share ? selected[index] : limitationExcerpt(selected[index], share);
   kept[index] = excerpt;
   if (excerpt !== null) remaining -= jsonBytes(excerpt);
  }
 }
 const limitations: string[] = [];
 let truncatedCount = 0;
 kept.forEach((item, index) => {
  if (item === null) { omittedCount++; return; }
  if (item !== selected[index]) truncatedCount++;
  limitations.push(item);
 });
 const incomplete = omittedCount > 0 || truncatedCount > 0;
 const result = {limitations, limitationsReadback: {
  status: incomplete ? "INCOMPLETE" : "COMPLETE", omittedCount, truncatedCount, duplicateCount,
  ...(incomplete ? {note: LIMITATIONS_NOTE} : {}),
 }};
 // Fail closed rather than exceed the hard cap (unreachable by construction).
 while (jsonBytes(result) > LIMITATIONS_ALLOCATION_BYTES && result.limitations.length) {
  result.limitations.pop(); result.limitationsReadback.omittedCount++;
  result.limitationsReadback.status = "INCOMPLETE"; (result.limitationsReadback as Record<string, unknown>).note = LIMITATIONS_NOTE;
 }
 return result;
}

const pick=(value: unknown, keys: string[]): Record<string,unknown> => {
 if(!value || typeof value!=="object" || Array.isArray(value))return {};
 const source=value as Record<string,unknown>;
 return Object.fromEntries(keys.filter(key=>source[key]!==undefined).map(key=>[key,source[key]]));
};
/** Bounded read-only Proof projection shared by mandatory context and tool
 * results. Canonical Proof bytes remain retained; hashes identify that original. */
export function compactProofData(original: unknown): Record<string, unknown> {
 const source=original as Record<string, unknown>|null;
 if(!source || typeof source!=="object" || Array.isArray(source))return {};
 const evidence=Array.isArray(source.evidence)?source.evidence.map((e:unknown)=>pick(e,["criterionId","resultRevision","state","producer","contentHash","observedAt"])):[];
 const commonEvidenceBinding: Record<string, unknown> = {};
 // Factor only identical, present binding fields. Criterion identity, outcome
 // and distinct content hashes remain explicit for every criterion.
 for(const key of ["resultRevision","producer","observedAt"]) {
  const first=evidence[0]?.[key];
  if(typeof first!=="string" || !evidence.every(item=>item[key]===first))continue;
  commonEvidenceBinding[key]=first;
  for(const item of evidence)delete item[key];
 }
 return {...pick(source,["workId","workVersion","criteriaVersion","outcome","resultRevision","createdAt"]),
  ...boundedLimitations(source.limitations), contentHash:digest(original),
  evidence, ...(Object.keys(commonEvidenceBinding).length?{commonEvidenceBinding}:{}),
  artifactRefs:Array.isArray(source.artifactRefs)?source.artifactRefs.filter((ref:unknown)=>typeof ref==="string" && /^(factory-evidence:|factory-manifest:|factory-version:|external-alpha-authority:|changed-source:)/.test(ref)):[],
  details:"Common evidence bindings apply to every criterion. Read canonical Proof for full references; this projection grants no authority.",
 };
}

/** A data projection, never a permission token. Keep current identities,
 * versions, criterion outcomes and Proof references; omit duplicated event logs. */
export function compactWorkData(value: unknown): Record<string,unknown> {
 const source=value as Record<string,unknown>|null;
 if(!source || typeof source!=="object" || Array.isArray(source))return {dataOnly:true,sourceSha256:digest(value)};
 const work=pick(source.work??source,["id","scopeId","scopeKind","title","objective","version","generation","criteriaVersion","criteria","lifecycle","control"]);
 const projection=pick(source.projection,["status","currentTruth","lastChange","nextStep","readiness","needsYou","lifecycle","currentCandidate","currentAuthority"]);
 const native=pick((source.projection as any)?.nativeResult,["id","resultId","authorityId","candidateSha","contentHash","workVersion","workGeneration","verdict","cleanupConfirmed","settlementState","current"]);
 const original=(source.projection as any)?.nativeResult?.proof;
 const proof=original ? compactProofData(original) : {};
 if(Object.keys(proof).length)native.proof=proof;
 if(Object.keys(native).length)projection.nativeResult=native;
 return {dataOnly:true,sourceSha256:digest(value),work,projection,
  receipt:pick(source.receipt,["state","requestId","workOrderId","authorityId","authoritySha256"])};
}

/** Remove from a compacted Work tool result only what the mandatory
 * selected-Work context provably already carries for the SAME Work: identical
 * criterion statements and the same canonical Proof (equal content hash of the
 * original, rendered by the same compactProofData projection). Identity,
 * versions, state, outcomes and references stay; a marker records each removal
 * so the model knows where the authoritative copy is. Nothing is removed when
 * equivalence cannot be shown. */
export function withoutMandatoryDuplicates(value: Record<string, unknown>, mandatory: string): Record<string, unknown> {
 const work = value.work as Record<string, unknown> | undefined;
 const id = typeof work?.id === "string" ? work.id : null;
 if (!id || !mandatory.includes(`Work ${id} · `)) return value;
 const out: Record<string, any> = structuredClone(value);
 const removed: string[] = [];
 const criteria = out.work?.criteria;
 if (Array.isArray(criteria) && criteria.length && criteria.every((c: any) => typeof c?.id === "string" && typeof c?.statement === "string"
   && mandatory.includes(`Criterion ${c.id}: ${c.statement.slice(0, 300)} [`) && c.statement.length <= 300)) {
  delete out.work.criteria; removed.push("work.criteria");
 }
 if (typeof out.work?.objective === "string" && out.work.objective.length <= 1600 && mandatory.includes(`Objective: ${out.work.objective}\n`)) {
  delete out.work.objective; removed.push("work.objective");
 }
 const native = out.projection?.nativeResult;
 const hash = native?.proof?.contentHash;
 if (typeof native?.id === "string" && typeof hash === "string" && mandatory.includes(`Native immutable Proof of Work ${native.id}: `)
   && mandatory.includes(`"contentHash":${JSON.stringify(hash)}`)) {
  native.proof = {sameAsMandatoryContext: true, contentHash: hash, outcome: native.proof.outcome};
  removed.push("projection.nativeResult.proof");
 }
 if (removed.length) out.mandatoryContextDuplicates = {removed, note: "Identical to the selected Work in the mandatory context above; read it there."};
 return out;
}

/** Preserve every system message, exact latest owner request and the complete
 * current tool exchange. Window older whole turns, never orphan tool results.
 * An oversized mandatory/current payload still fails closed at 32,000 bytes. */
export function boundedAlphaHistory(prompt:Prompt,tools:Options["tools"]):Prompt {
 const bytes=(p:Prompt)=>Buffer.byteLength(JSON.stringify({prompt:p,tools}));
 if(bytes(prompt)<EXTERNAL_ALPHA_CONTEXT_TARGET_BYTES)return prompt;
 let bounded:Prompt=prompt.map(message=>message.role!=="tool"?message:{...message,content:message.content.map(part=>{
  if(part.type!=="tool-result" || !["engineering_work","engineering_factory"].includes(part.toolName) || part.output.type!=="json")return part;
  return {...part,output:{...part.output,value:compactWorkData(part.output.value) as any}};
 })});
 if(bytes(bounded)>=EXTERNAL_ALPHA_CONTEXT_TARGET_BYTES){
  const mandatory=bounded.filter(m=>m.role==="system").map(m=>typeof m.content==="string"?m.content:JSON.stringify(m.content)).join("\n");
  bounded=bounded.map(message=>message.role!=="tool"?message:{...message,content:message.content.map(part=>{
   if(part.type!=="tool-result" || !["engineering_work","engineering_factory"].includes(part.toolName) || part.output.type!=="json")return part;
   return {...part,output:{...part.output,value:withoutMandatoryDuplicates(part.output.value as Record<string,unknown>,mandatory) as any}};
  })});
 }
 while(bytes(bounded)>=EXTERNAL_ALPHA_CONTEXT_TARGET_BYTES){
  const users=bounded.flatMap((m,i)=>m.role==="user"?[i]:[]);
  if(users.length<2)break;
  const next=users[1];
  bounded=bounded.filter((m,i)=>m.role==="system"||i>=next);
 }
 if(bytes(bounded)>EXTERNAL_ALPHA_CONTEXT_BYTES)throw Error(`EXTERNAL_ALPHA_CONTEXT_BOUND: ${bytes(bounded)}/${EXTERNAL_ALPHA_CONTEXT_BYTES} bytes`);
 return bounded;
}
