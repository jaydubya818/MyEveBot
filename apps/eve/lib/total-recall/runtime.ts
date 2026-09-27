import { z } from "zod";
import { digest as resultDigest } from "../engineering/contract.ts";
import { proofOfWorkSchema } from "../digital-worker/contracts.ts";
import { feedbackInput, learningCommandSchema, type FeedbackInput, type LearningCommand } from "./learning.ts";
import { LearningStore } from "./store.ts";

export interface RetainedResult { id: string; ownerId: string; workId: string; workVersion: number; contentHash: string; source: "CANONICAL_NATIVE_RESULT" | "QUALIFICATION_FIXTURE" }
export interface ResultReader { get(ownerId: string, workId: string, resultId: string): Promise<RetainedResult | null> }
/** Read-only native/Factory-retained result lookup; verifies immutable Proof of
 * Work without calling verification, execution, publication or result writers. */
export function canonicalResultReader(store: LearningStore): ResultReader {
  return {async get(ownerId,workId,resultId){
    const [row]=await store.work.database.query(`SELECT id,scope_id,work_id,work_version,proof,content_hash FROM engineering_native_results
      WHERE scope_id=$1 AND scope_kind='personal' AND work_id=$2 AND id=$3`,[ownerId,workId,resultId]);
    if(!row)return null;
    const proof=proofOfWorkSchema.parse(row.proof);
    if(resultDigest(proof)!==row.content_hash || proof.workId!==workId || proof.workVersion!==Number(row.work_version)) throw new Error("Retained Result provenance is invalid.");
    return {id:String(row.id),ownerId:String(row.scope_id),workId:String(row.work_id),workVersion:Number(row.work_version),contentHash:String(row.content_hash),source:"CANONICAL_NATIVE_RESULT"};
  }};
}
export const resultFeedbackSchema=z.object({feedback:feedbackInput, resultHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
/** Result → feedback → candidate and decisions use the exact same authenticated
 * Work binding. A client supplies identity/hash, never trusted provenance/PASS. */
export class LearningRuntime {
  constructor(readonly store:LearningStore,readonly results:ResultReader=canonicalResultReader(store)){}
  async feedback(value:unknown){
    const {feedback,resultHash}=resultFeedbackSchema.parse(value);
    if(feedback.target!=="result")throw new Error("Result feedback must identify a retained Result.");
    const owner=this.store.work.principal.scopeId;
    const work=await this.store.work.get(feedback.workId);
    const result=await this.results.get(owner,work.id,feedback.targetRef);
    if(!result || result.ownerId!==owner || result.workId!==work.id || result.workVersion!==feedback.workVersion ||
      work.version!==feedback.workVersion || result.contentHash!==resultHash)throw new Error("Feedback does not match retained Result provenance.");
    // Result hash is retained in the verified reference; never copy proof text,
    // credentials or result-supplied instructions into learned guidance.
    return this.store.feedback({...feedback,targetRef:`result:${result.id}:sha256:${result.contentHash}`});
  }
  async decide(input:{workId:string;workVersion:number;workType:FeedbackInput["workType"];familyId:string;revision:number;command:LearningCommand}){
    const command=learningCommandSchema.parse(input.command);
    const work=await this.store.work.get(z.string().uuid().parse(input.workId));
    const family=await this.store.get(input.familyId);
    if(!family || family.scope.ownerId!==this.store.work.principal.scopeId || family.scope.repository!==work.repository ||
      family.scope.workType!==input.workType || (family.scope.workId && family.scope.workId!==work.id) || work.version!==input.workVersion)
      throw new Error("Learning decision does not match the canonical Work scope.");
    return this.store.command(family.id,input.revision,command,{id:work.id,version:work.version});
  }
}
