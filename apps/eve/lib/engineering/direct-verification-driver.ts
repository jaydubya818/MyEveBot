import { randomUUID } from "node:crypto";
import { digest, type RepositoryProfile } from "./contract.ts";
import { DirectDevelopmentStore, type DirectProtectedVerifier,
  type DirectVerificationClaim, type DirectWorkspace } from "./direct-development.ts";
import { docker } from "./docker-executor.ts";
import type { Candidate, Evidence } from "./execution.ts";
import { WorkError } from "./types.ts";

type JobStatus = "QUEUED"|"RUNNING"|"RECOVERY_REQUIRED"|"COMPLETED"|"STALE";
export interface DirectVerificationJob {
  workId: string;
  candidateId: string;
  candidateSha: string;
  workspaceRevision: number;
  status: JobStatus;
  attempt: number;
  leaseUntil: string|null;
  lastError: string|null;
  evidenceCount: number;
}

export interface VerificationResourceInspector {
  /** True only when every candidate-specific verifier container and volume is absent. */
  resourcesAbsent(candidate: Candidate, profile: RepositoryProfile): Promise<boolean>;
}

function job(row:Record<string,any>):DirectVerificationJob {
  return {workId:row.work_id,candidateId:row.candidate_id,candidateSha:row.candidate_sha,
    workspaceRevision:Number(row.workspace_revision),status:row.status,
    attempt:Number(row.attempt),leaseUntil:row.lease_until
      ? row.lease_until instanceof Date ? row.lease_until.toISOString() : String(row.lease_until) : null,
    lastError:row.last_error,evidenceCount:Number(row.evidence_count)};
}

function boundedError(error:unknown) {
  return (error instanceof Error ? error.message : "Protected verification failed without a confirmed outcome.").slice(0,1000);
}

function verifiedEvidence(value:DirectWorkspace,profile:RepositoryProfile):Evidence[]|null {
  const candidate=value.candidates.at(-1);
  if (!candidate || !["VERIFICATION_PASSED","VERIFICATION_FAILED"].includes(value.phase)) return null;
  const evidence=value.evidence.filter(item=>item.candidate===candidate.sha &&
    item.attemptId===candidate.attemptId && item.workId===value.workId &&
    item.base===value.baseSha && item.criteriaVersion===value.criteriaVersion &&
    item.profileHash===value.profileHash && item.environment===profile.image &&
    item.producer==="protected-supervisor" && item.artifactHash===digest(item.artifact));
  const expected=profile.checks.map(check=>check.id);
  if (evidence.length!==expected.length || new Set(evidence.map(item=>item.check)).size!==expected.length ||
      evidence.some(item=>!expected.includes(item.check))) return null;
  if ((value.phase==="VERIFICATION_PASSED")!==evidence.every(item=>item.result==="PASS")) return null;
  return evidence;
}

/** Strictly read-only resource check. An outage or unexpected object is not
 * absence; the operator must reconcile it before another verifier attempt. */
export class DockerVerificationResourceInspector implements VerificationResourceInspector {
  async resourcesAbsent(candidate:Candidate,profile:RepositoryProfile):Promise<boolean> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate.id))
      throw new Error("Invalid candidate resource identity.");
    const base=`myeve-golden-verify-${candidate.id}`;
    const resources=[...profile.checks.map(check=>({kind:"container",name:`${base}-${check.id}`})),
      {kind:"volume",name:base}];
    for (const resource of resources) {
      const result=await docker([resource.kind,"inspect","--format","{{json .}}",resource.name]);
      if (result.code!==0) {
        const escaped=resource.name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
        const absent=resource.kind==="container"
          ? new RegExp(`No such (?:object|container):\\s*${escaped}(?:\\s|$)`,"i")
          : new RegExp(`No such volume:\\s*${escaped}(?:\\s|$)`,"i");
        if (!absent.test(result.err)) throw new Error("Verifier resource state is unavailable; retry remains fenced.");
        continue;
      }
      let object:Record<string,any>;
      try { object=JSON.parse(result.out); }
      catch { throw new Error("Verifier resource inspection is invalid; retry remains fenced."); }
      const owned=resource.kind==="container"
        ? object.Name===`/${resource.name}` && object.Config?.Labels?.["myeve.golden"]==="true"
        : object.Name===resource.name && object.Labels?.["myeve.golden"]==="true";
      if (!owned) throw new Error("Verifier resource ownership is unknown; retry remains fenced.");
      return false;
    }
    return true;
  }
}

/** One server worker claims the frozen candidate. No model-facing tool accepts
 * evidence. An ambiguous interrupted attempt is never automatically rerun. */
export class DirectVerificationDriver {
  constructor(readonly direct:DirectDevelopmentStore,readonly verifier:DirectProtectedVerifier,
    readonly leaseSeconds=90) {
    if (!Number.isInteger(leaseSeconds) || leaseSeconds<2 || leaseSeconds>600)
      throw new Error("Verification lease must be between 2 and 600 seconds.");
  }
  private scope(id:string) {
    const {scopeId,scopeKind}=this.direct.workStore.principal;
    return [scopeId,scopeKind,id];
  }
  private database() { return this.direct.workStore.database; }

  async inspectJob(id:string,candidateSha:string):Promise<DirectVerificationJob|null> {
    await this.direct.workStore.get(id);
    const [row]=await this.database().query(
      `SELECT * FROM engineering_direct_verification_jobs
       WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 AND candidate_sha=$4`,
      [...this.scope(id),candidateSha]);
    return row?job(row):null;
  }

  private async seed(id:string,value:DirectWorkspace):Promise<void> {
    const candidate=value.candidates.at(-1);
    if (!candidate) throw new WorkError("direct_candidate_missing","The frozen candidate is missing.");
    await this.database().query(
      `INSERT INTO engineering_direct_verification_jobs
         (scope_id,scope_kind,work_id,candidate_id,candidate_sha,workspace_revision)
       SELECT d.scope_id,d.scope_kind,d.work_id,$4::uuid,$5,$6
       FROM engineering_direct_workspaces d
       JOIN engineering_work w ON w.scope_id=d.scope_id AND w.scope_kind=d.scope_kind AND w.id=d.work_id
       JOIN engineering_route_runs r ON r.id=d.route_run_id AND r.decision_id=d.decision_id
       JOIN engineering_routing_decisions route ON route.id=d.decision_id
       WHERE d.scope_id=$1 AND d.scope_kind=$2 AND d.work_id=$3
         AND d.revision=$6 AND d.phase='VERIFICATION_REQUESTED'
         AND d.candidates->-1->>'id'=$4::text AND d.candidates->-1->>'sha'=$5
         AND d.profile_hash=$7 AND d.deadline>clock_timestamp()
         AND w.version=d.work_version AND w.generation=d.work_generation
         AND w.criteria_version=d.criteria_version AND w.lifecycle='active' AND w.control='agent'
         AND r.status='RUNNING' AND r.route='DEEP_AGENT'
         AND route.status='ADMITTED' AND route.selected_route='DEEP_AGENT'
       ON CONFLICT DO NOTHING`,
      [...this.scope(id),candidate.id,candidate.sha,value.revision,digest(this.direct.config.profile)]);
  }

  private async reapExpired(id:string,candidateSha:string) {
    await this.database().query(
      `UPDATE engineering_direct_verification_jobs SET status='RECOVERY_REQUIRED',
         lease_token=NULL,lease_until=NULL,updated_at=now(),
         last_error='Verification lease expired; inspect candidate-specific Docker resources before retry.'
       WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 AND candidate_sha=$4
         AND status='RUNNING' AND lease_until<=clock_timestamp()`,
      [...this.scope(id),candidateSha]);
  }

  private async claim(id:string,value:DirectWorkspace):Promise<DirectVerificationClaim|null> {
    const candidate=value.candidates.at(-1)!;
    const token=randomUUID();
    const [row]=await this.database().query(
      `UPDATE engineering_direct_verification_jobs j
       SET status='RUNNING',lease_token=$7::uuid,
         lease_until=clock_timestamp()+($8::int * interval '1 second'),
         attempt=j.attempt+1,updated_at=now(),last_error=NULL
       WHERE j.scope_id=$1 AND j.scope_kind=$2 AND j.work_id=$3
         AND j.candidate_sha=$4 AND j.workspace_revision=$5
         AND j.status='QUEUED' AND j.attempt<8
         AND EXISTS (SELECT 1 FROM engineering_direct_workspaces d
           JOIN engineering_work w ON w.scope_id=d.scope_id AND w.scope_kind=d.scope_kind AND w.id=d.work_id
           JOIN engineering_route_runs r ON r.id=d.route_run_id AND r.decision_id=d.decision_id
           JOIN engineering_routing_decisions route ON route.id=d.decision_id
           WHERE d.scope_id=j.scope_id AND d.scope_kind=j.scope_kind AND d.work_id=j.work_id
             AND d.revision=j.workspace_revision AND d.phase='VERIFICATION_REQUESTED'
             AND d.candidates->-1->>'sha'=j.candidate_sha AND d.profile_hash=$6
             AND d.deadline>clock_timestamp()
             AND w.version=d.work_version AND w.generation=d.work_generation
             AND w.criteria_version=d.criteria_version AND w.lifecycle='active' AND w.control='agent'
             AND r.status='RUNNING' AND r.route='DEEP_AGENT'
             AND route.status='ADMITTED' AND route.selected_route='DEEP_AGENT')
       RETURNING j.*`,
      [...this.scope(id),candidate.sha,value.revision,digest(this.direct.config.profile),token,this.leaseSeconds]);
    return row?{token,candidateSha:candidate.sha,workspaceRevision:value.revision}:null;
  }

  private async assertLease(id:string,claim:DirectVerificationClaim):Promise<void> {
    const [row]=await this.database().query(
      `SELECT 1 FROM engineering_direct_verification_jobs j
       JOIN engineering_direct_workspaces d ON d.scope_id=j.scope_id
         AND d.scope_kind=j.scope_kind AND d.work_id=j.work_id
       JOIN engineering_work w ON w.scope_id=d.scope_id AND w.scope_kind=d.scope_kind AND w.id=d.work_id
       JOIN engineering_route_runs r ON r.id=d.route_run_id AND r.decision_id=d.decision_id
       JOIN engineering_routing_decisions route ON route.id=d.decision_id
       WHERE j.scope_id=$1 AND j.scope_kind=$2 AND j.work_id=$3
         AND j.candidate_sha=$4 AND j.workspace_revision=$5 AND j.lease_token=$6::uuid
         AND j.status='RUNNING' AND j.lease_until>clock_timestamp()
         AND d.revision=j.workspace_revision AND d.phase='VERIFICATION_REQUESTED'
         AND d.candidates->-1->>'sha'=j.candidate_sha AND d.deadline>clock_timestamp()
         AND w.version=d.work_version AND w.generation=d.work_generation
         AND w.criteria_version=d.criteria_version AND w.lifecycle='active' AND w.control='agent'
         AND r.status='RUNNING' AND r.route='DEEP_AGENT'
         AND route.status='ADMITTED' AND route.selected_route='DEEP_AGENT'`,
      [...this.scope(id),claim.candidateSha,claim.workspaceRevision,claim.token]);
    if (!row) throw new WorkError("direct_verification_lease","The verifier lease or Work writer was fenced.");
  }

  private async renew(id:string,claim:DirectVerificationClaim) {
    const [row]=await this.database().query(
      `UPDATE engineering_direct_verification_jobs SET
         lease_until=clock_timestamp()+($7::int * interval '1 second'),updated_at=now()
       WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 AND candidate_sha=$4
         AND workspace_revision=$5 AND lease_token=$6::uuid
         AND status='RUNNING' AND lease_until>clock_timestamp()
       RETURNING candidate_sha`,
      [...this.scope(id),claim.candidateSha,claim.workspaceRevision,claim.token,this.leaseSeconds]);
    if (!row) throw new WorkError("direct_verification_lease","The verifier lease expired.");
  }

  private async markRecovery(id:string,claim:DirectVerificationClaim,error:unknown) {
    await this.database().query(
      `UPDATE engineering_direct_verification_jobs SET
         status='RECOVERY_REQUIRED',lease_token=NULL,lease_until=NULL,
         last_error=$7,updated_at=now()
       WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 AND candidate_sha=$4
         AND workspace_revision=$5 AND lease_token=$6::uuid AND status='RUNNING'`,
      [...this.scope(id),claim.candidateSha,claim.workspaceRevision,claim.token,boundedError(error)]);
  }

  private async complete(id:string,claim:DirectVerificationClaim,evidenceCount:number) {
    const [row]=await this.database().query(
      `UPDATE engineering_direct_verification_jobs j SET status='COMPLETED',
         lease_token=NULL,lease_until=NULL,evidence_count=$7,updated_at=now()
       WHERE j.scope_id=$1 AND j.scope_kind=$2 AND j.work_id=$3 AND j.candidate_sha=$4
         AND j.workspace_revision=$5 AND j.lease_token=$6::uuid AND j.status='RUNNING'
         AND EXISTS (SELECT 1 FROM engineering_direct_workspaces d
           WHERE d.scope_id=j.scope_id AND d.scope_kind=j.scope_kind AND d.work_id=j.work_id
             AND d.revision=j.workspace_revision+1
             AND d.candidates->-1->>'sha'=j.candidate_sha
             AND d.phase IN ('VERIFICATION_PASSED','VERIFICATION_FAILED')
             AND jsonb_array_length(d.evidence)>=$7)
       RETURNING j.*`,
      [...this.scope(id),claim.candidateSha,claim.workspaceRevision,claim.token,evidenceCount]);
    if (!row) throw new WorkError("direct_verification_record","Evidence was retained, but job completion needs reconciliation.");
    return job(row);
  }

  private async reconcileCompleted(id:string,value:DirectWorkspace):Promise<DirectVerificationJob|null> {
    const candidate=value.candidates.at(-1),evidence=verifiedEvidence(value,this.direct.config.profile);
    if (!candidate || !evidence) return null;
    const [row]=await this.database().query(
      `UPDATE engineering_direct_verification_jobs j SET status='COMPLETED',
         lease_token=NULL,lease_until=NULL,evidence_count=$5,updated_at=now()
       WHERE j.scope_id=$1 AND j.scope_kind=$2 AND j.work_id=$3 AND j.candidate_sha=$4
         AND j.status IN ('RUNNING','RECOVERY_REQUIRED')
         AND EXISTS (SELECT 1 FROM engineering_direct_workspaces d
           WHERE d.scope_id=j.scope_id AND d.scope_kind=j.scope_kind AND d.work_id=j.work_id
             AND d.revision=j.workspace_revision+1
             AND d.candidates->-1->>'sha'=j.candidate_sha
             AND d.phase IN ('VERIFICATION_PASSED','VERIFICATION_FAILED'))
       RETURNING j.*`,
      [...this.scope(id),candidate.sha,evidence.length]);
    return row?job(row):this.inspectJob(id,candidate.sha);
  }

  async run(id:string):Promise<DirectVerificationJob> {
    const inspected=await this.direct.inspect(id);
    const value=inspected.workspace,candidate=value?.candidates.at(-1);
    if (!value || !candidate) throw new WorkError("direct_candidate_missing","No retained native candidate exists.");
    if (value.phase!=="VERIFICATION_REQUESTED") {
      const completed=await this.reconcileCompleted(id,value);
      if (completed) return completed;
      throw new WorkError("direct_verification_changed","No current frozen candidate is awaiting verification.");
    }
    if (!inspected.current) throw new WorkError("direct_verification_changed","Work changed before verification.");
    await this.direct.requireAdmission(id);
    await this.seed(id,value);
    await this.reapExpired(id,candidate.sha);
    const claim=await this.claim(id,value);
    if (!claim) {
      const existing=await this.inspectJob(id,candidate.sha);
      if (existing) return existing;
      throw new WorkError("direct_verification_changed","The candidate, route, or Work changed before claim.");
    }
    let leaseError:unknown;
    const heartbeat=setInterval(()=>{void this.renew(id,claim).catch(error=>{leaseError=error;});},
      Math.max(1000,Math.floor(this.leaseSeconds*1000/3)));
    try {
      await this.assertLease(id,claim);
      const result=await this.direct.verifyRequested(id,{verify:async(contract,frozen)=>{
        await this.assertLease(id,claim);
        if (leaseError) throw leaseError;
        const evidence=await this.verifier.verify(contract,frozen);
        if (leaseError) throw leaseError;
        await this.assertLease(id,claim);
        return evidence;
      }},claim);
      return this.complete(id,claim,result.evidence.length);
    } catch(error) {
      await this.markRecovery(id,claim,error);
      throw error;
    } finally {clearInterval(heartbeat);}
  }

  /** Explicit retry after an interrupted/unknown attempt. No resource is
   * deleted here: an operator must first reconcile exact Docker identities. */
  async retryAfterResourceCheck(id:string,candidateSha:string,inspector:VerificationResourceInspector):Promise<DirectVerificationJob> {
    const {workspace:value,current}=await this.direct.inspect(id);
    const candidate=value?.candidates.at(-1);
    if (!current || value?.phase!=="VERIFICATION_REQUESTED" || candidate?.sha!==candidateSha)
      throw new WorkError("direct_verification_changed","The candidate or Work is no longer current.");
    await this.direct.requireAdmission(id);
    const existing=await this.inspectJob(id,candidateSha);
    if (existing?.status!=="RECOVERY_REQUIRED" || existing.attempt>=8)
      throw new WorkError("direct_verification_recovery","Only an interrupted attempt below the retry limit can be reconciled.");
    if (!await inspector.resourcesAbsent(candidate,this.direct.config.profile))
      throw new WorkError("direct_verification_resources","Verifier resources remain present; reconcile them before retry.");
    const [row]=await this.database().query(
      `UPDATE engineering_direct_verification_jobs j SET status='QUEUED',
         last_error=NULL,updated_at=now()
       WHERE j.scope_id=$1 AND j.scope_kind=$2 AND j.work_id=$3 AND j.candidate_sha=$4
         AND j.status='RECOVERY_REQUIRED' AND j.attempt<8
         AND EXISTS (SELECT 1 FROM engineering_direct_workspaces d
           JOIN engineering_work w ON w.scope_id=d.scope_id AND w.scope_kind=d.scope_kind AND w.id=d.work_id
           JOIN engineering_route_runs r ON r.id=d.route_run_id AND r.decision_id=d.decision_id
           JOIN engineering_routing_decisions route ON route.id=d.decision_id
           WHERE d.scope_id=j.scope_id AND d.scope_kind=j.scope_kind AND d.work_id=j.work_id
             AND d.revision=j.workspace_revision AND d.phase='VERIFICATION_REQUESTED'
             AND d.candidates->-1->>'sha'=j.candidate_sha AND d.profile_hash=$5
             AND d.deadline>clock_timestamp()
             AND w.version=d.work_version AND w.generation=d.work_generation
             AND w.criteria_version=d.criteria_version AND w.lifecycle='active' AND w.control='agent'
             AND r.status='RUNNING' AND r.route='DEEP_AGENT'
             AND route.status='ADMITTED' AND route.selected_route='DEEP_AGENT')
       RETURNING j.*`,
      [...this.scope(id),candidateSha,digest(this.direct.config.profile)]);
    if (!row) throw new WorkError("direct_verification_changed","The retry was fenced by changed Work or writer state.");
    return job(row);
  }
}
