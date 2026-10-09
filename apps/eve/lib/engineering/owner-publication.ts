import { nodeTestSummary } from './node-test-summary.ts';
import { proofOfWorkSchema } from "../digital-worker/contracts.ts";
import { observeAuthenticatedFactoryResult } from "./factory-authenticated-result.ts";
import { randomUUID } from "node:crypto";
import { digest } from "./contract.ts";
import type { BetaIntegration } from "../beta-integration/runtime.ts";
import type { GoalConnection } from "../goal-work/database.ts";
import { WorkStore } from "./store.ts";
import { engineeringConversationConfig } from "./runtime.ts";
import { readJourneyAccounting } from "./journey-accounting.ts";
import { assertPublicationCustody, bindingHash, decisionInput, deny, publicationReadbackSchema, currentPublicationReadback, type PublicationBinding } from "./publication-contract.ts";
import type { Candidate } from "./execution.ts";
import { sha256 } from "./factory-producer-protocol.ts";

type Query = {query(sql:string,p?:unknown[]):Promise<Record<string,any>[]>};
export class OwnerPublication {
 constructor(readonly db: BetaIntegration, readonly configuration=engineeringConversationConfig) {}
 async current(owner:string,workId:string,db:Query=this.db) {
  const config=await this.configuration();
  if(owner!==config.ownerId)deny("This publication belongs to another owner.");
  const store=new WorkStore({scopeId:owner,actorId:owner,scopeKind:"personal"},db), work=await store.get(workId);
  const [row]=await db.query(`SELECT n.*,r.id AS result_id,r.proof,r.content_hash,r.work_version AS result_version,
   r.work_generation AS result_generation,j.status AS job_status,j.evidence_count,
   q.verified_manifest_digest,q.binding AS factory_binding, f.envelope,f.provenance,rr.fenced_at
   FROM engineering_direct_workspaces n JOIN engineering_native_results r
   ON r.scope_id=n.scope_id AND r.scope_kind=n.scope_kind AND r.work_id=n.work_id AND r.candidate_sha=n.candidates->-1->>'sha'
   JOIN engineering_direct_verification_jobs j ON j.scope_id=n.scope_id AND j.scope_kind=n.scope_kind AND j.work_id=n.work_id AND j.candidate_sha=r.candidate_sha
   JOIN engineering_factory_requests q ON q.scope_id=n.scope_id AND q.scope_kind=n.scope_kind AND q.work_id=n.work_id AND q.binding->>'requestId'=n.candidates->-1->'factoryProvenance'->>'requestId'
   JOIN engineering_factory_receipts f ON f.request_id=q.id AND f.state='ADMITTED'
   JOIN engineering_route_runs rr ON rr.id=n.route_run_id
   WHERE n.scope_id=$1 AND n.scope_kind='personal' AND n.work_id=$2`,[owner,workId]);
  if(!row)deny("Retained verified custody is missing.");
  const candidate=row.candidates.at(-1) as Candidate;
  if(work.lifecycle!=="active" || ["stopping","paused"].includes(work.control) ||
   work.version!==row.work_version || work.generation!==row.work_generation || work.criteriaVersion!==row.criteria_version || row.proof.criteriaVersion!==work.criteriaVersion || row.result_version!==work.version || row.result_generation!==work.generation ||
   row.phase!=="VERIFICATION_PASSED" || row.job_status!=="COMPLETED" || !row.fenced_at ||
   row.producer!=="MYFACTORY" || row.factory_receipt_id!==candidate.id ||
   row.profile_hash!==digest(config.profile) || row.proof.resultRevision!==candidate.sha ||
   row.proof.evidence.some((e:any)=>e.state!=="PASS") || digest(row.proof)!==row.content_hash ||
   !row.verified_manifest_digest || row.verified_manifest_digest!==row.provenance?.manifestDigest ||
   row.evidence_count!==config.profile.checks.length || row.evidence.length!==config.profile.checks.length ||
   row.evidence.some((e:any)=>e.candidate!==candidate.sha || e.result!=="PASS" || e.artifactHash!==digest(e.artifact)))
    deny("Current Work, custody or protected verification is not eligible for publication.");
  const manifest=row.provenance.manifest, envelope=JSON.parse(row.envelope);
  observeAuthenticatedFactoryResult(envelope,row.factory_binding,[row.provenance.key],true);
  if(manifest.candidate?.commit!==candidate.sha || manifest.candidate?.tree!==candidate.tree)deny("Signed candidate differs from custody.");
  let implementationPassed=0,implementationTotal=0;
  for(const check of manifest.evidence){
   const meta=manifest.artifacts.find((a:any)=>a.id===check.logArtifactId);
   const raw=envelope.artifacts.find((a:any)=>a.id===check.logArtifactId);
   if(check.status!=="passed"||check.exitCode!==0||!meta||!raw)deny("Implementation checks unavailable.");
   const bytes=Buffer.from(raw.base64,"base64");if(sha256(bytes)!==meta.sha256)deny("Implementation evidence changed.");
   const counts=nodeTestSummary(bytes.toString("utf8"));
   if(!counts)deny("Implementation test counts unavailable.");
   implementationPassed+=counts.passed;implementationTotal+=counts.total;
  }
  if(!implementationTotal)deny("No implementation evidence.");
  const binding:PublicationBinding={owner,workId,resultId:row.result_id,resultHash:row.content_hash,version:work.version,generation:work.generation,
   candidate:candidate.sha,verifiedTree:candidate.tree,repository:work.repository,baseRef:config.profile.baseBranch,
   expectedBaseSha:config.approvedBase.sha,branch:`codex/factory/wo-${candidate.factoryProvenance!.workOrderId}`,
   receiptId:candidate.id,profileHash:row.profile_hash,allowedPaths:config.profile.allowedPaths,
   title:work.title.slice(0,200),
   body:`Implement ${candidate.changedPaths.join(", ")} under the reviewed public contract.\n\nImplementation checks: ${implementationPassed}/${implementationTotal}. Independent protected checks: ${row.evidence_count}/${row.evidence_count}.\n\nCandidate: ${candidate.sha}\nVerified tree: ${candidate.tree}\nWork: ${workId}\n\nGitHub CI and independent review remain pending. No merge, deployment or owner acceptance is authorized.`,
   publicationReady:true,ownerAcceptance:"NOT_RUN"};
  if(work.repository!==config.profile.repository)deny("Repository differs from qualified custody.");
  assertPublicationCustody(binding,candidate,row.source_files);
  const [decision]=await db.query("SELECT * FROM engineering_owner_decisions WHERE owner_id=$1 AND work_id=$2 AND result_id=$3 ORDER BY created_at DESC,id DESC LIMIT 1",[owner,workId,row.result_id]);
  const [publication]=await db.query("SELECT * FROM engineering_candidate_publications WHERE owner_id=$1 AND result_id=$2",[owner,row.result_id]);
  const accounting=await readJourneyAccounting(store,workId);
  return {binding,bindingHash:bindingHash(binding),candidate,sourceFiles:row.source_files,proof:proofOfWorkSchema.parse(row.proof),accounting,
   implementation:{passed:implementationPassed,total:implementationTotal},verification:{passed:row.evidence_count,total:row.evidence_count},
   decision:decision??null,publication:publication??null,readback:publication?.state==='PR_OPEN'?currentPublicationReadback(publication.remote,binding):null};
 }
 async view(owner:string,workId:string){const {candidate,sourceFiles,...view}=await this.current(owner,workId);return view;}
 /** Local trusted host only; this is not exposed through the owner decision POST. */
 async retainReadback(owner:string,workId:string,value:unknown){
  const readback=publicationReadbackSchema.parse(value),config=await this.configuration();
  if(readback.ci.status==='PASS'&&config.profile.requiredCI.some(name=>!readback.ci.checks.some(check=>check.name===name&&check.result==='PASS')))deny('Required CI checks are missing from readback.');
  return this.db.transaction(async(c:GoalConnection)=>{
   const db:Query={query:async(s,p)=>(await c.query(s,p)).rows};
   await c.query("SELECT id FROM engineering_work WHERE scope_id=$1 AND scope_kind='personal' AND id=$2 FOR UPDATE",[owner,workId]);
   const current=await this.current(owner,workId,db);
   if(bindingHash(readback.binding)!==current.bindingHash||current.publication?.state!=='PR_OPEN'||
      current.publication.remote?.pr?.number!==readback.prNumber||current.decision?.action!=='open_pr')deny('Readback is not bound to this published Result.');
   const [row]=await db.query('SELECT remote FROM engineering_candidate_publications WHERE owner_id=$1 AND result_id=$2 FOR UPDATE',[owner,current.binding.resultId]);
   const history=row.remote.readbacks??[];
   if(history.some((r:unknown)=>digest(r)===digest(readback)))return readback;
   if(history.length>=100)deny('Readback retention limit requires explicit reconciliation.');
   await db.query("UPDATE engineering_candidate_publications SET remote=jsonb_set(remote,'{readbacks}',$3::jsonb),updated_at=now() WHERE owner_id=$1 AND result_id=$2",[owner,current.binding.resultId,JSON.stringify([...history,readback])]);
   return readback;
  });
 }
 async decide(owner:string,value:unknown){
  const input=decisionInput.parse(value);
  return this.db.transaction(async(c:GoalConnection)=>{
   const db:Query={query:async(s,p)=>(await c.query(s,p)).rows};
   await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,979))",[owner+":"+input.workId]);
   await c.query("SELECT id FROM engineering_work WHERE scope_id=$1 AND scope_kind='personal' AND id=$2 FOR UPDATE",[owner,input.workId]);
   const current=await this.current(owner,input.workId,db),prior=current.decision;
   if(input.bindingHash!==current.bindingHash)deny("Stale candidate decision; reload the Result.");
   if(prior?.action===input.action && prior.binding_hash===input.bindingHash && prior.previous_id===input.previousId)return prior;
   if((prior?.id??null)!==input.previousId)deny("Owner decision changed; reload before confirming.");
   if(current.publication)deny("Publication already claimed; only readback is permitted.");
   const id=randomUUID();
   const [decision]=await db.query(`INSERT INTO engineering_owner_decisions(id,owner_id,work_id,result_id,binding,binding_hash,action,previous_id,expires_at)
    VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,now()+interval '1 hour') RETURNING *`,
    [id,owner,input.workId,current.binding.resultId,JSON.stringify(current.binding),input.bindingHash,input.action,input.previousId]);
   if(input.action==='open_pr'||input.action==='push_branch')await db.query(`INSERT INTO engineering_candidate_publications(result_id,owner_id,decision_id,state) VALUES($1,$2,$3,'APPROVED')`,[current.binding.resultId,owner,id]);
   return decision;
  });
 }
}
