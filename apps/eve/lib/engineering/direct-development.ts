import { randomUUID } from "node:crypto";
import { z } from "zod";
import { digitalWorkContractSchema } from "../digital-worker/contracts.ts";
import { routeRequestSchema } from "../digital-worker/routing.ts";
import { preflightApprovedBase, type ApprovedBase } from "./base-preflight.ts";
import { digest, pathSchema, type RepositoryProfile, type WorkContract } from "./contract.ts";
import { nowIso, type Candidate, type EngineeringRun, type Evidence } from "./execution.ts";
import { assertCandidateIdentity, createCandidate, type CandidateContract, type RepositorySnapshot } from "./github.ts";
import { WorkStore } from "./store.ts";
import { WorkError, type Work } from "./types.ts";

// Native exploratory editing requires a separately qualified DEEP_AGENT route.
// A DIRECT route is reserved for known deterministic operations.
// Source snapshots may contain read-only dot paths such as .github/workflows;
// editable targets use the stricter pathSchema and the profile allowlist.
const sourcePathSchema = z.string().min(1).max(240).refine(path =>
  /^[A-Za-z0-9_./-]+$/.test(path) && !path.startsWith("/") &&
  !path.split("/").some(part => !part || part === "." || part === ".." || part === ".git"));
const filesSchema = z.record(sourcePathSchema, z.string().max(100_000));
const planSchema = z.string().trim().min(1).max(8_000);
type DirectPhase = "DRAFT" | "VERIFICATION_REQUESTED" | "VERIFICATION_FAILED" | "VERIFICATION_PASSED";
export interface DirectWorkspace {
  workId: string;
  workVersion: number;
  workGeneration: number;
  criteriaVersion: number;
  decisionId: string;
  routeRunId: string;
  repository: string;
  baseSha: string;
  profileHash: string;
  deadline: string;
  sourceFiles: Record<string,string>;
  draftFiles: Record<string,string>;
  plan: string;
  phase: DirectPhase;
  revision: number;
  candidates: Candidate[];
  evidence: Evidence[];
  updatedAt: string;
}

export type DirectVerificationContract = Pick<WorkContract,
  "workId"|"baseSha"|"criteriaVersion"|"profileHash"|"profile">;
export interface DirectProtectedVerifier {
  verify(contract: DirectVerificationContract, candidate: Candidate): Promise<Evidence[]>;
}

function assertOwner(store: WorkStore) {
  const principal = store.principal;
  if (principal.scopeKind !== "personal" || principal.actorId !== principal.scopeId)
    throw new WorkError("direct_scope", "Only the authenticated personal Work owner can use direct development.", 403);
}

function workspace(row: Record<string, any>): DirectWorkspace {
  return {
    workId: row.work_id, workVersion: Number(row.work_version), workGeneration: Number(row.work_generation),
    criteriaVersion: Number(row.criteria_version), decisionId: row.decision_id,
    routeRunId: row.route_run_id, repository: row.repository, baseSha: row.base_sha,
    profileHash: row.profile_hash, deadline: row.deadline instanceof Date ? row.deadline.toISOString() : String(row.deadline),
    sourceFiles: row.source_files, draftFiles: row.draft_files, plan: row.plan,
    phase: row.phase, revision: Number(row.revision), candidates: row.candidates,
    evidence: row.evidence, updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

function boundFiles(files: Record<string,string>) {
  const parsed = filesSchema.parse(files);
  if (Object.keys(parsed).length > 200 || Buffer.byteLength(JSON.stringify(parsed)) > 500_000 ||
      Object.values(parsed).some(content => content.includes("\0")))
    throw new WorkError("direct_file_bound", "Direct Work exceeds the approved text repository bound.");
  return parsed;
}

function assertConfiguredWork(work: Work, profile: RepositoryProfile, objective: string, criteria: Work["criteria"]) {
  if (work.repository !== profile.repository || work.objective !== objective ||
      digest(work.criteria) !== digest(criteria) ||
      work.criteria.some(criterion => criterion.method !== "test" ||
        !profile.checks.some(check => check.criterionIds.includes(criterion.id))))
    throw new WorkError("direct_contract_changed", "Work does not match the approved objective, criteria and protected checks.");
}

function candidateContract(value: DirectWorkspace, profile: RepositoryProfile): CandidateContract {
  return { workId: value.workId, repository: value.repository, baseSha: value.baseSha,
    profile: { allowedPaths: profile.allowedPaths } };
}

/** A native Agent draft is a DB-owned artifact. Neither tool input nor a model
 * claim can supply route admission, source files, candidate identity or tests. */
export class DirectDevelopmentStore {
  constructor(
    readonly workStore: WorkStore,
    readonly config: { profile: RepositoryProfile; approvedBase: ApprovedBase;
      objective: string; criteria: Work["criteria"]; agentId: string; issueNumber: number },
  ) { assertOwner(workStore); }

  private scope(id: string) {
    return [this.workStore.principal.scopeId, this.workStore.principal.scopeKind, id];
  }

  /** Read-only inspection is available even after a pause, criteria change or
   * process restart; it never presents old evidence as current. */
  async inspect(id: string): Promise<{ work: Work; workspace: DirectWorkspace | null; current: boolean }> {
    const work = await this.workStore.get(id);
    const [row] = await this.workStore.database.query(
      `SELECT * FROM engineering_direct_workspaces WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3`, this.scope(id));
    const value = row ? workspace(row) : null;
    return { work, workspace: value, current: !!value && this.current(work, value) };
  }

  private current(work: Work, value: DirectWorkspace): boolean {
    return work.lifecycle === "active" && work.control === "agent" &&
      work.version === value.workVersion && work.generation === value.workGeneration &&
      work.criteriaVersion === value.criteriaVersion && work.repository === value.repository &&
      value.profileHash === digest(this.config.profile) && Date.now() < Date.parse(value.deadline);
  }

  /** Check the durable route before any repository read in the tool. */
  async requireAdmission(id: string) {
    const [row] = await this.workStore.database.query(
      `SELECT d.id AS decision_id,d.work_version,d.admission_request,d.admission_authority_snapshot,
              r.id AS route_run_id,r.work_generation,r.status AS run_status
       FROM engineering_routing_decisions d
       JOIN engineering_route_runs r ON r.decision_id=d.id AND r.scope_id=d.scope_id
         AND r.scope_kind=d.scope_kind AND r.work_id=d.work_id
       JOIN engineering_work w ON w.scope_id=d.scope_id AND w.scope_kind=d.scope_kind
         AND w.id=d.work_id AND w.version=d.work_version AND w.generation=r.work_generation
       WHERE d.scope_id=$1 AND d.scope_kind=$2 AND d.work_id=$3
         AND d.selected_route='DEEP_AGENT' AND d.status='ADMITTED'
         AND r.route='DEEP_AGENT' AND r.status IN ('QUEUED','RUNNING')
         AND w.lifecycle='active' AND w.control='agent'
       ORDER BY d.admitted_at DESC LIMIT 1`, this.scope(id));
    if (!row) throw new WorkError("direct_not_admitted", "A current admitted DEEP_AGENT route and queued writer are required.", 403);
    const request = routeRequestSchema.parse(row.admission_request);
    const authority = z.object({ contract: digitalWorkContractSchema }).passthrough().parse(row.admission_authority_snapshot);
    const required = ["deep-agent.start", "repository.read", "sandbox.write", "candidate.create", "verification.request"];
    const profileRef = `engineering-profile:sha256:${digest({
      profile:this.config.profile,approvedBase:this.config.approvedBase,
    })}`;
    if (request.route !== "DEEP_AGENT" || required.some(operation =>
      !request.requiredOperations.includes(operation) || !authority.contract.allowedOperations.includes(operation)) ||
      !request.resourceRefs.includes(`repository:${this.config.profile.repository}`) ||
      !request.resourceRefs.includes(profileRef) || !authority.contract.resourceRefs.includes(profileRef) ||
      authority.contract.coordinatingAgentId !== this.config.agentId ||
      authority.contract.scope.kind !== "personal" || authority.contract.scope.id !== this.workStore.principal.scopeId ||
      authority.contract.workId !== id || authority.contract.workVersion !== Number(row.work_version))
      throw new WorkError("direct_admission_scope", "The admitted route does not authorize this Agent, repository and operation set.", 403);
    return row;
  }

  async open(id: string, observed: RepositorySnapshot): Promise<DirectWorkspace> {
    const work = await this.workStore.get(id);
    assertConfiguredWork(work, this.config.profile, this.config.objective, this.config.criteria);
    const admission = await this.requireAdmission(id);
    if (admission.run_status !== "QUEUED")
      throw new WorkError("direct_already_started", "The DEEP_AGENT route already has a writer. Inspect its retained workspace.");
    preflightApprovedBase(this.config.profile, this.config.approvedBase, observed, this.config.issueNumber);
    const files = boundFiles(observed.files);
    const deadline = new Date(Math.min(
      Date.parse(admission.admission_authority_snapshot.contract.deadline),
      Date.now() + work.maxDurationSeconds * 1000,
    )).toISOString();
    if (Date.parse(deadline) <= Date.now()) throw new WorkError("direct_deadline", "The admitted Work deadline has expired.");
    const [row] = await this.workStore.database.query(
      `WITH source AS MATERIALIZED (
         SELECT w.scope_id,w.scope_kind,w.id,w.version,w.generation,w.criteria_version,w.repository
         FROM engineering_work w JOIN engineering_route_runs r ON r.scope_id=w.scope_id
           AND r.scope_kind=w.scope_kind AND r.work_id=w.id
         JOIN engineering_routing_decisions d ON d.id=r.decision_id
         WHERE w.scope_id=$1 AND w.scope_kind=$2 AND w.id=$3 AND w.version=$4
           AND w.generation=$5 AND w.criteria_version=$6 AND w.repository=$7
           AND w.lifecycle='active' AND w.control='agent'
           AND r.id=$8 AND r.status='QUEUED' AND r.route='DEEP_AGENT'
           AND d.id=$9 AND d.status='ADMITTED' AND d.selected_route='DEEP_AGENT'
           AND d.work_version=w.version
         FOR UPDATE OF w,r,d
       ), created AS (
         INSERT INTO engineering_direct_workspaces
           (scope_id,scope_kind,work_id,decision_id,route_run_id,work_version,work_generation,
            criteria_version,repository,base_sha,profile_hash,deadline,source_files,draft_files)
         SELECT scope_id,scope_kind,id,$9,$8,version,generation,criteria_version,repository,
           $10,$11,$12::timestamptz,$13::jsonb,$13::jsonb FROM source
         ON CONFLICT DO NOTHING RETURNING *
       ), running AS (
         UPDATE engineering_route_runs r SET status='RUNNING',updated_at=now()
         FROM created c WHERE r.id=c.route_run_id AND r.status='QUEUED' RETURNING r.id
       ) SELECT c.* FROM created c JOIN running r ON r.id=c.route_run_id`,
      [...this.scope(id), work.version, work.generation, work.criteriaVersion, work.repository,
        admission.route_run_id, admission.decision_id, observed.sha, digest(this.config.profile),
        deadline, JSON.stringify(files)]);
    if (!row) throw new WorkError("direct_changed", "The Work, route or writer changed before the direct workspace opened.");
    return workspace(row);
  }

  async read(id: string, path: string) {
    sourcePathSchema.parse(path);
    const { workspace: value } = await this.inspect(id);
    if (!value) throw new WorkError("direct_missing", "No direct workspace has been opened.");
    const content = value.draftFiles[path];
    if (content === undefined) throw new WorkError("direct_path", "That file is absent from the bounded repository snapshot.", 404);
    return { path, content, revision: value.revision, sourceSha: value.baseSha,
      changed: value.sourceFiles[path] !== content };
  }

  private async editable(id: string, expectedRevision: number) {
    const {work, workspace: value} = await this.inspect(id);
    if (!value || value.revision !== expectedRevision || !this.current(work,value) ||
        !["DRAFT","VERIFICATION_FAILED"].includes(value.phase))
      throw new WorkError("direct_changed", "Direct Work, control, deadline, or draft changed. Reload before editing.");
    return value;
  }

  private async updateDraft(id: string, value: DirectWorkspace, operation: "plan"|"write",
    data: { plan?: string; files?: Record<string,string> }): Promise<DirectWorkspace> {
    const [row] = await this.workStore.database.query(
      `UPDATE engineering_direct_workspaces d SET
         plan=CASE WHEN $7='plan' THEN $8 ELSE d.plan END,
         draft_files=CASE WHEN $7='write' THEN $9::jsonb ELSE d.draft_files END,
         phase='DRAFT',revision=d.revision+1,updated_at=now()
       WHERE d.scope_id=$1 AND d.scope_kind=$2 AND d.work_id=$3 AND d.revision=$4
         AND d.work_version=$5 AND d.work_generation=$6 AND d.profile_hash=$10
         AND d.phase IN ('DRAFT','VERIFICATION_FAILED') AND d.deadline>clock_timestamp()
         AND EXISTS (SELECT 1 FROM engineering_work w WHERE w.scope_id=d.scope_id
           AND w.scope_kind=d.scope_kind AND w.id=d.work_id AND w.version=d.work_version
           AND w.generation=d.work_generation AND w.criteria_version=d.criteria_version
           AND w.lifecycle='active' AND w.control='agent')
         AND EXISTS (SELECT 1 FROM engineering_route_runs r WHERE r.id=d.route_run_id
           AND r.status='RUNNING' AND r.decision_id=d.decision_id)
       RETURNING d.*`,
      [...this.scope(id), value.revision, value.workVersion, value.workGeneration,
        operation, data.plan ?? value.plan, JSON.stringify(data.files ?? value.draftFiles), digest(this.config.profile)]);
    if (!row) throw new WorkError("direct_changed", "The direct writer was fenced or the draft changed. Reload.");
    return workspace(row);
  }

  async plan(id: string, expectedRevision: number, text: string) {
    const value = await this.editable(id, expectedRevision);
    return this.updateDraft(id, value, "plan", {plan:planSchema.parse(text)});
  }

  async write(id: string, expectedRevision: number, path: string, content: string) {
    const value = await this.editable(id, expectedRevision);
    pathSchema.parse(path);
    if (!this.config.profile.allowedPaths.includes(path) || typeof content !== "string" ||
        Buffer.byteLength(content,"utf8") > 100_000)
      throw new WorkError("direct_path", "Only a bounded approved source path may be edited.", 403);
    const files = boundFiles({...value.draftFiles, [path]:content});
    // Reuse candidate checks before custody, including credential and changed-path screening.
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}|sk-[A-Za-z0-9]{24,})/.test(content))
      throw new WorkError("secret_detected", "The source edit appears to contain a credential.");
    return this.updateDraft(id, value, "write", {files});
  }

  async submit(id: string, expectedRevision: number) {
    const value = await this.editable(id, expectedRevision);
    if (!value.plan) throw new WorkError("direct_plan", "Record a bounded plan before submitting a candidate.");
    if (value.candidates.length >= this.config.profile.maxRuns)
      throw new WorkError("direct_run_limit", "The approved candidate attempt limit was reached.");
    const contract = candidateContract(value,this.config.profile);
    const source = {sha:value.baseSha,files:value.sourceFiles};
    const run: EngineeringRun = {id:value.routeRunId,attemptId:randomUUID(),reason:"Sofie native direct development",
      generation:value.workGeneration,parentSha:value.baseSha,publicationParentSha:value.baseSha,
      status:"running",resource:`native-direct-${value.routeRunId}`,startedAt:nowIso()};
    const candidate=createCandidate(contract,run,source,value.draftFiles);
    assertCandidateIdentity(contract,run,source,candidate);
    if (value.candidates.some(existing => existing.artifactHash === candidate.artifactHash))
      throw new WorkError("direct_candidate_unchanged", "The candidate files have not changed since an earlier attempt.");
    const [row] = await this.workStore.database.query(
      `UPDATE engineering_direct_workspaces d SET candidates=d.candidates || $7::jsonb,
         phase='VERIFICATION_REQUESTED',revision=d.revision+1,updated_at=now()
       WHERE d.scope_id=$1 AND d.scope_kind=$2 AND d.work_id=$3 AND d.revision=$4
         AND d.work_version=$5 AND d.work_generation=$6 AND d.profile_hash=$8
         AND d.phase IN ('DRAFT','VERIFICATION_FAILED') AND d.deadline>clock_timestamp()
         AND jsonb_array_length(d.candidates)<$9
         AND EXISTS (SELECT 1 FROM engineering_work w WHERE w.scope_id=d.scope_id
           AND w.scope_kind=d.scope_kind AND w.id=d.work_id AND w.version=d.work_version
           AND w.generation=d.work_generation AND w.criteria_version=d.criteria_version
           AND w.lifecycle='active' AND w.control='agent')
         AND EXISTS (SELECT 1 FROM engineering_route_runs r WHERE r.id=d.route_run_id
           AND r.status='RUNNING' AND r.decision_id=d.decision_id)
       RETURNING d.*`,
      [...this.scope(id), value.revision, value.workVersion, value.workGeneration,
        JSON.stringify([candidate]), digest(this.config.profile), this.config.profile.maxRuns]);
    if (!row) throw new WorkError("direct_changed", "The writer was fenced before candidate custody. Reload.");
    return {candidate, workspace:workspace(row)};
  }

  /** Supervisor-only. The Agent tool does not expose this method or accept
   * evidence as input. A changed Work or candidate cannot receive a PASS. */
  async verifyRequested(id: string, verifier: DirectProtectedVerifier) {
    const {work,workspace:value}=await this.inspect(id);
    if (!value || value.phase!=="VERIFICATION_REQUESTED" || !this.current(work,value))
      throw new WorkError("direct_verification_changed", "No current frozen candidate is awaiting protected verification.");
    const admission=await this.requireAdmission(id);
    if (admission.route_run_id!==value.routeRunId || admission.run_status!=="RUNNING")
      throw new WorkError("direct_verification_changed", "The direct writer was fenced before protected verification.");
    const candidate=value.candidates.at(-1);
    if (!candidate) throw new WorkError("direct_candidate_missing", "The frozen candidate is missing.");
    const contract=candidateContract(value,this.config.profile);
    const run:EngineeringRun={id:value.routeRunId,attemptId:candidate.attemptId,
      reason:"Sofie native direct development",generation:value.workGeneration,parentSha:value.baseSha,
      publicationParentSha:value.baseSha,status:"candidate",resource:`native-direct-${value.routeRunId}`,
      startedAt:candidate.createdAt};
    assertCandidateIdentity(contract,run,{sha:value.baseSha,files:value.sourceFiles},candidate);
    const checks=await verifier.verify({workId:id,baseSha:value.baseSha,
      criteriaVersion:value.criteriaVersion,profileHash:value.profileHash,profile:this.config.profile},candidate);
    const expected=this.config.profile.checks.map(check=>check.id);
    if (checks.length!==expected.length || new Set(checks.map(check=>check.check)).size!==expected.length ||
        checks.some(check=>!expected.includes(check.check) || check.workId!==id ||
          check.candidate!==candidate.sha || check.base!==value.baseSha ||
          check.criteriaVersion!==value.criteriaVersion || check.profileHash!==value.profileHash ||
          check.environment!==this.config.profile.image || check.attemptId!==candidate.attemptId ||
          check.producer!=="protected-supervisor" || check.artifactHash!==digest(check.artifact) ||
          !["PASS","FAIL","UNKNOWN"].includes(check.result)))
      throw new WorkError("direct_evidence_denied", "Protected evidence did not bind to the frozen candidate and profile.");
    const passed=checks.every(check=>check.result==="PASS");
    const [row]=await this.workStore.database.query(
      `UPDATE engineering_direct_workspaces d SET evidence=d.evidence || $7::jsonb,
         phase=$8,revision=d.revision+1,updated_at=now()
       WHERE d.scope_id=$1 AND d.scope_kind=$2 AND d.work_id=$3 AND d.revision=$4
         AND d.work_version=$5 AND d.work_generation=$6 AND d.profile_hash=$9
         AND d.phase='VERIFICATION_REQUESTED' AND d.deadline>clock_timestamp()
         AND d.candidates->-1->>'sha'=$10
         AND EXISTS (SELECT 1 FROM engineering_work w WHERE w.scope_id=d.scope_id
           AND w.scope_kind=d.scope_kind AND w.id=d.work_id AND w.version=d.work_version
           AND w.generation=d.work_generation AND w.criteria_version=d.criteria_version
           AND w.lifecycle='active' AND w.control='agent')
         AND EXISTS (SELECT 1 FROM engineering_route_runs r WHERE r.id=d.route_run_id
           AND r.status='RUNNING' AND r.decision_id=d.decision_id)
       RETURNING d.*`,
      [...this.scope(id),value.revision,value.workVersion,value.workGeneration,
        JSON.stringify(checks),passed?"VERIFICATION_PASSED":"VERIFICATION_FAILED",
        digest(this.config.profile),candidate.sha]);
    if (!row) throw new WorkError("direct_verification_changed", "Work or candidate changed while verification ran; evidence was not attached.");
    return {candidate, evidence:checks,workspace:workspace(row)};
  }
}
