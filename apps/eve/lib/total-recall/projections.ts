import { z } from "zod";
import { assertLearningFamily, behaviors, digest, type LearningFamily } from "./learning.ts";
import { recallItemSchema, type RecallBundle, type RecallItem } from "./retrieval-contract.ts";
import { assertEvidenceData } from "./work-retrieval.ts";

/** Stable read-only contract for Beta UX; consumers render escaped text, not HTML. */
export function projectMemory(itemInput: RecallItem, usedIn?: Pick<RecallBundle,"workId"|"contextRef"|"contentHash">) {
  const item=recallItemSchema.parse(itemInput);
  return { contractVersion:1 as const,identity:item.identity,kind:item.kind,statement:item.text,truth:item.truth,
    provenance:item.provenance,scope:item.scope,privacy:item.privacy,confidence:item.confidence,relevance:item.relevance,
    correction:{previous:item.supersedesId,next:item.supersededById},
    usage:usedIn?{...usedIn,reason:item.reasonUsed}:null,
    permissions:{canGrantAuthority:false as const,canShare:false as const} };
}
export function projectLearning(family:LearningFamily, usedIn?: {workId:string;contextRef:string;version:number;hash:string}) {
  assertLearningFamily(family,family.scope.ownerId);
  if(usedIn && !family.versions.some(v=>v.version===usedIn.version&&v.hash===usedIn.hash))throw new Error("Usage does not identify a retained learning version.");
  return {contractVersion:1 as const,identity:family.id,revision:family.revision,scope:family.scope,privacy:"PRIVATE" as const,
    usage:usedIn?{...usedIn,reason:"Matched owner, repository, Work type and optional Work restriction when this version was retrieved; receipt records offered guidance, not successful use"}:null,
    versions:family.versions.map(v=>({version:v.version,hash:v.hash,behavior:v.behavior,guidance:behaviors[v.behavior],status:v.status,reason:v.reason,
      evaluation:v.evaluation?{fixture:v.evaluation.fixture,result:v.evaluation.result,baselineScore:v.evaluation.baselineScore,learnedScore:v.evaluation.learnedScore}:null,
      sourceFeedback:v.evidence.map(e=>({eventId:e.eventId,workId:e.workId,workVersion:e.workVersion,targetRef:e.targetRef,note:e.note,provenance:e.provenance})),
      correctionOf:v.correctionOf,replacesVersion:v.replacesVersion??null,
      actions:{evaluate:v.status==="CANDIDATE"&&!v.evaluation,promote:v.status==="CANDIDATE"&&v.evaluation?.result==="PASS",reject:v.status==="CANDIDATE",rollback:v.status==="PROMOTED",
        restoreVersion:v.status==="PROMOTED"&&v.replacesVersion&&!family.versions.some(p=>p.correctionOf===v.replacesVersion)?v.replacesVersion:null}})),
    authorityGrants:[] as readonly []};
}

/** A data representation for Portable Sofie, not an export/import implementation
 * or portability consent. Work/corporate/private records do not become shareable. */
export function portableMemoryRecord(itemInput:RecallItem, learningVersion:{id:string;version:number;hash:string}|null=null) {
  const item=recallItemSchema.parse(itemInput);assertEvidenceData(JSON.stringify(item));
  learningVersion=z.object({id:z.string().regex(/^[a-f0-9]{64}$/),version:z.number().int().positive(),hash:z.string().regex(/^[a-f0-9]{64}$/)}).strict().nullable().parse(learningVersion);
  return {contractVersion:1 as const,type:"MEMORY_REPRESENTATION" as const,identity:item.identity,kind:item.kind,text:item.text,
    ownerId:item.ownerId,scope:item.scope,privacy:item.privacy,provenance:item.provenance,
    currentTruth:{status:item.truth,supersedesId:item.supersedesId,supersededById:item.supersededById},confidence:item.confidence,
    learningVersion,contentHash:digest(item),portability:{eligible:false as const,reason:"Requires separate owner selection, source policy and Capsule qualification"},authorityGrants:[] as readonly []};
}

export type MemoryProjection = ReturnType<typeof projectMemory>;
export type LearningProjection = ReturnType<typeof projectLearning>;
export type PortableMemoryRepresentation = ReturnType<typeof portableMemoryRecord>;
