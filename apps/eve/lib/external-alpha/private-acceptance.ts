import { digest } from "../engineering/contract.ts";
import { WorkStore } from "../engineering/store.ts";
import { WorkError } from "../engineering/types.ts";
import type { BetaIntegration } from "../beta-integration/runtime.ts";
import { continuationInput } from "../universal-inbox/continuation.ts";
import { eventSchema, type OwnerResponse } from "../universal-inbox/contracts.ts";
import { externalAlphaPolicy, type ExternalAlphaPolicy } from "./policy.ts";
import { externalAlphaWorkConfig, type ExternalAlphaWorkConfig } from "./work-config.ts";
import { readWorkAuthorityRecord } from "./work-authority.ts";
import { verifyExternalAlphaResult } from "./result-ingestion.ts";
import { deterministicUuid } from "./work-tuple.ts";

type Query = { query(sql: string, params?: unknown[]): Promise<Record<string, any>[]> };
const denied = () => new WorkError("private_acceptance_changed", "This private Result is not eligible for acceptance. Refresh its current Proof.", 409);
export const PRIVATE_ACCEPT = "Accept verified private Result";

/** A decision over existing canonical evidence, with no producer, model or
 * publication capability. Verification and Work completion stay separate facts. */
export class PrivateResultAcceptance {
  constructor(readonly beta: BetaIntegration,
    readonly policy: ExternalAlphaPolicy | null = externalAlphaPolicy(),
    readonly config: ExternalAlphaWorkConfig | null = externalAlphaWorkConfig()) {}

  async current(owner: string, workId: string, db: Query = this.beta) {
    if (!this.policy || !this.config || this.policy.ownerId !== owner) throw denied();
    const [policy] = await db.query("SELECT * FROM external_alpha_policy WHERE owner_id=$1 AND policy_sha256=$2 AND activated_at IS NOT NULL AND revoked_at IS NULL AND clock_timestamp()<activated_at+interval '120 hours'", [owner,digest(this.policy)]);
    if (!policy) throw denied();
    const work = await new WorkStore({scopeId:owner,scopeKind:"personal",actorId:owner},db).get(workId);
    const [row] = await db.query(`SELECT a.*,r.result_id,r.candidate_sha,r.verdict,r.envelope,r.manifest_digest,r.ingest_sha256,
      r.cleanup_confirmed,r.settlement_state,r.exposure_unknown,n.proof,n.content_hash,d.request_digest
      FROM external_alpha_work_authority a JOIN external_alpha_work_result r ON r.authority_id=a.id AND r.owner_id=a.owner_id AND r.work_id=a.work_id
      JOIN engineering_native_results n ON n.id=r.result_id AND n.scope_id=r.owner_id AND n.scope_kind='personal'
        AND n.work_id=r.work_id AND n.work_version=r.work_version AND n.work_generation=r.work_generation AND n.candidate_sha=r.candidate_sha
      JOIN external_alpha_work_dispatch d ON d.authority_id=a.id AND d.owner_id=a.owner_id AND d.policy_sha256=a.policy_sha256
      WHERE a.owner_id=$1 AND a.work_id=$2 AND a.policy_sha256=$3`,[owner,workId,digest(this.policy)]);
    if (!row || work.lifecycle!=="active" || work.control!=="agent" || work.version!==row.work_version || work.generation!==row.work_generation
      || row.state!=="COMPLETED" || row.verdict!=="PASS" || !row.cleanup_confirmed || row.settlement_state!=="SETTLED" || row.exposure_unknown!==false) throw denied();
    const unresolved = await db.query(`SELECT 1 FROM external_alpha_operation o JOIN external_alpha_allowance a ON a.id=o.allowance_id
      WHERE a.owner_id=$1 AND o.state IN('PREPARED','DISPATCHED','UNKNOWN')
      UNION ALL SELECT 1 FROM external_alpha_allowance WHERE owner_id=$1 AND state='UNKNOWN'
      UNION ALL SELECT 1 FROM external_alpha_tool_effect WHERE owner_id=$1 AND state IN('ACCEPTED','UNKNOWN') LIMIT 1`,[owner]);
    if (unresolved.length) throw denied();
    const envelope = JSON.parse(row.envelope);
    const manifest = JSON.parse(Buffer.from(envelope.encoded,"base64url").toString("utf8"));
    const verified = verifyExternalAlphaResult({database:db,policy:this.policy,config:this.config,
      authority:readWorkAuthorityRecord(row),work,envelope,verdictHint:row.verdict,
      expectedRequestDigest:row.request_digest,expectedRunId:manifest.execution.runId});
    if (verified.verdict!=="PASS" || verified.manifest.status!=="COMPLETED" || verified.proofHash!==row.content_hash
      || digest(row.proof)!==row.content_hash || verified.ingestSha256!==row.ingest_sha256 || digest(verified.manifest)!==row.manifest_digest
      || verified.candidate.commit!==row.candidate_sha || verified.proof.criteriaVersion!==work.criteriaVersion
      || work.criteria.some(c=>!verified.proof.evidence.some(e=>e.criterionId===c.id&&e.state==='PASS'&&e.resultRevision===row.candidate_sha))) throw denied();
    const binding = {version:1,ownerId:owner,workId,workVersion:work.version,workGeneration:work.generation,criteriaVersion:work.criteriaVersion,
      resultId:row.result_id as string,candidateSha:row.candidate_sha as string,candidateTree:verified.candidate.tree,
      proofHash:row.content_hash as string,manifestDigest:row.manifest_digest as string,verificationDigest:digest(verified.manifest.verification),
      factoryVersion:this.policy.factoryVersion,authorityId:row.id as string,authoritySha256:row.document_sha256 as string,
      policySha256:digest(this.policy),publication:false,completedVersion:work.version+1,completedGeneration:work.generation+1};
    return {work,binding,bindingHash:digest(binding)};
  }

  async request(owner: string, workId: string) {
    const {work,binding,bindingHash} = await this.current(owner,workId);
    const actionId=`private-result:${binding.resultId}:${bindingHash}`;
    const event=eventSchema.parse({kind:"DECISION",title:work.title,
      summary:"Independent verification passed. Accept this private Result to complete this Work. Nothing will be published.",
      source:{system:"work",accountId:owner,eventId:actionId,sender:"Sofie",occurredAt:work.updatedAt,reference:workId},
      correlationId:actionId,episode:1,sequence:1,workId,workVersion:work.version,workGeneration:work.generation,
      action:{id:actionId,kind:"decision",reason:"choice",involvement:"NECESSARY_JUDGMENT",
        prompt:"Accept the verified private Result?",options:[PRIVATE_ACCEPT]},priority:{blockingActiveWork:true}});
    const [saved]=await this.beta.query(`INSERT INTO beta_work_decisions(owner_id,work_id,action_id,work_version,work_generation,event,result_acceptance_binding)
      VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) ON CONFLICT(owner_id,action_id) DO UPDATE SET action_id=excluded.action_id RETURNING *`,
      [owner,workId,actionId,work.version,work.generation,JSON.stringify(event),JSON.stringify(binding)]);
    if(digest(saved.event)!==digest(event)||digest(saved.result_acceptance_binding)!==bindingHash)throw denied();
    return this.beta.inbox(owner).ingest(event);
  }
  async refresh(owner: string) {
    if (!this.policy || !this.config || owner!==this.policy.ownerId) return;
    const works=await this.beta.query(`SELECT w.id FROM engineering_work w JOIN external_alpha_work_result r ON r.work_id=w.id AND r.owner_id=w.scope_id
      WHERE w.scope_id=$1 AND w.scope_kind='personal' AND w.lifecycle='active' AND r.verdict='PASS' AND r.settlement_state='SETTLED' ORDER BY w.updated_at DESC LIMIT 100`,[owner]);
    for(const work of works) { try {await this.request(owner,work.id);} catch(error) {if(!(error instanceof WorkError)&&!(error instanceof Error && error.message.startsWith("EXTERNAL_ALPHA_RESULT_")))throw error;} }
  }
  async accept(response: OwnerResponse) {
    const input=continuationInput(response), owner=input.ownerId;
    if(!this.policy || owner!==this.policy.ownerId || !input.workId || !input.actionId.startsWith("private-result:") || input.answer!==PRIVATE_ACCEPT)throw denied();
    return this.beta.transaction(async c=>{
      const db:Query={query:async(sql,params)=>(await c.query(sql,params)).rows};
      // Match accounting/controller lock order. Completion and cancellation
      // serialize on the same canonical Work; no detached acceptance ledger.
      await db.query("SELECT owner_id FROM external_alpha_policy WHERE owner_id=$1 FOR UPDATE",[owner]);
      await db.query("SELECT id FROM external_alpha_work_authority WHERE owner_id=$1 AND work_id=$2 FOR UPDATE",[owner,input.workId]);
      await db.query("SELECT id FROM engineering_work WHERE scope_id=$1 AND scope_kind='personal' AND id=$2 FOR UPDATE",[owner,input.workId]);
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,719))",[owner]);
      const [stored]=await db.query("SELECT data FROM inbox_attention_responses WHERE owner_id=$1 AND id=$2 FOR UPDATE",[owner,input.responseId]);
      const [item]=await db.query("SELECT data FROM inbox_attention_items WHERE owner_id=$1 AND id=$2 FOR UPDATE",[owner,input.attentionId]);
      const [decision]=await db.query("SELECT * FROM beta_work_decisions WHERE owner_id=$1 AND work_id=$2 AND action_id=$3",[owner,input.workId,input.actionId]);
      if(!stored || digest(continuationInput(stored.data))!==digest(input) || !['PENDING','DELIVERED'].includes(stored.data.status)
        || !item || item.data.responseId!==input.responseId || !['WAITING','RESOLVED'].includes(item.data.status)
        || !decision?.result_acceptance_binding || digest(decision.event.action)!==input.actionBinding
        || decision.event.correlationId!==input.correlationId || item.data.sourceSequence!==decision.event.sequence
        || decision.work_version!==input.workVersion || decision.work_generation!==input.workGeneration)throw denied();
      const binding=decision.result_acceptance_binding, hash=digest(binding);
      if(input.actionId!==`private-result:${binding.resultId}:${hash}`)throw denied();
      const [prior]=await db.query("SELECT * FROM engineering_owner_decisions WHERE owner_id=$1 AND response_id=$2 AND action='accept_private'",[owner,input.responseId]);
      if(prior) {
        if(prior.work_id!==input.workId || prior.binding_hash!==hash || prior.result_id!==binding.resultId)throw denied();
        return {status:"accepted" as const,receipt:`private-result-accepted:${prior.id}`};
      }
      // An authenticated saved answer can become obsolete before delivery.
      // Resolve that answer without completing Work or obstructing later answers.
      const [eligible]=await db.query(`SELECT 1 FROM engineering_work w JOIN external_alpha_policy p ON p.owner_id=w.scope_id
        WHERE w.scope_id=$1 AND w.scope_kind='personal' AND w.id=$2 AND w.lifecycle='active' AND w.control='agent'
          AND w.version=$3 AND w.generation=$4 AND p.policy_sha256=$5 AND p.activated_at IS NOT NULL
          AND p.revoked_at IS NULL AND clock_timestamp()<p.activated_at+interval '120 hours'`,
        [owner,input.workId,input.workVersion,input.workGeneration,binding.policySha256]);
      if(!eligible)return {status:"stale" as const,receipt:`private-result-stale:${input.responseId}`};
      const current=await this.current(owner,input.workId!,db);
      if(current.bindingHash!==hash || input.actionId!==`private-result:${binding.resultId}:${hash}`)throw denied();
      const id=deterministicUuid(`PRIVATE_RESULT_ACCEPTANCE_V1:${owner}:${input.responseId}`);
      await db.query(`INSERT INTO engineering_owner_decisions(id,owner_id,work_id,result_id,binding,binding_hash,action,created_at,expires_at,response_id)
        VALUES($1,$2,$3,$4,$5::jsonb,$6,'accept_private',$7::timestamptz,$7::timestamptz,$8)`,
        [id,owner,input.workId,binding.resultId,JSON.stringify(binding),hash,input.answeredAt,input.responseId]);
      await db.query(`UPDATE engineering_work SET lifecycle='accepted',control='paused',version=version+1,generation=generation+1,updated_at=clock_timestamp()
        WHERE scope_id=$1 AND scope_kind='personal' AND id=$2`,[owner,input.workId]);
      await db.query(`INSERT INTO engineering_work_events(id,scope_id,scope_kind,work_id,version,actor_id,kind)
        VALUES($1,$2,'personal',$3,$4,$2,'private_result_accepted')`,[id,owner,input.workId,binding.completedVersion]);
      return {status:"accepted" as const,receipt:`private-result-accepted:${id}`};
    });
  }
}
