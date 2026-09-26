import { proofOfWorkSchema, type ProofOfWork } from "../digital-worker/contracts.ts";
import { digest } from "./contract.ts";
import { ExecutionStore } from "./execution-store.ts";
import { manifest, type Execution } from "./execution.ts";
import { RoutingStore, routingForWorkVersion, type RoutingSnapshot } from "./routing-store.ts";
import { WorkStore } from "./store.ts";
import { WorkError, type Work } from "./types.ts";

type CurrentManifest = ReturnType<typeof manifest>;

export interface EngineeringWorkerProjection {
  workId: string;
  title: string;
  objective: string;
  workVersion: number;
  criteriaVersion: number;
  lifecycle: Work["lifecycle"];
  control: Work["control"];
  workContract: {
    coordinatingAgentId: string;
    baseSha: string;
    deadline: string;
    profileId: string;
    profileVersion: number;
    policyVersion: number;
    budgetUsd: number;
  } | null;
  authoritySummary: {
    admitted: boolean;
    generationCurrent: boolean;
    deadlineCurrent: boolean;
    boundaryRecheckRequired: true;
  };
  qualificationMode: Execution["qualificationMode"] | null;
  status: string;
  activity: string;
  nextStep: string;
  readiness: { ready: boolean; reasons: string[] };
  currentRun: { id: string; status: string; startedAt: string; generationCurrent: boolean } | null;
  attention: CurrentManifest["attention"];
  pendingDecisions: string[];
  latestResult: { id: string; version: number; summary: string; candidate: string; createdAt: string } | null;
  nativeRuntime?: {spentUsd:number;reservedUsd:number;usageUnknown:boolean;inflight:boolean}|null;
  nativeResult?: {id:string;proof:ProofOfWork;contentHash:string;current:boolean}|null;
  nativeDevelopment: {
    phase: "DRAFT" | "VERIFICATION_REQUESTED" | "VERIFICATION_FAILED" | "VERIFICATION_PASSED";
    label: string;
    revision: number;
    candidateSha: string | null;
    evidenceCount: number;
    current: boolean;
    updatedAt: string;
  } | null;
  routing: {
    decisionId: string; status: "PROPOSED" | "ADMITTED" | "STALE";
    selectedRoute: string; reason: string; providerId: string | null;
  } | null;
  repositoryObservation: CurrentManifest["repositoryObservation"] | null;
  lastMeaningfulActivity: string;
  lastChange: { kind: string; at: string; actorId: string | null; version: number | null } | null;
  source: {
    kind: "durable-engineering-work";
    readAt: string;
    workRef: string;
    executionRef: string | null;
    resultRef: string | null;
    routingRef: string | null;
  };
}

export interface EngineeringProjectionSnapshot {
  work: Work;
  execution: Execution | null;
  manifest: CurrentManifest | null;
  routing: RoutingSnapshot;
  projection: EngineeringWorkerProjection;
}

function noExecutionStatus(work: Work) {
  if (work.lifecycle !== "active") return `${work.lifecycle[0].toUpperCase()}${work.lifecycle.slice(1)}`;
  if (work.control === "human") return "In your hands";
  if (work.control === "paused") return "Paused";
  if (work.control === "stopping") return "Stopping";
  return "Waiting for admission";
}

function noExecutionNextStep(work: Work) {
  if (work.lifecycle !== "active") return "Review the retained Work history.";
  if (work.control === "human") return "Finish your changes, then hand Work back for a fresh admission decision.";
  if (work.control === "stopping") return "Wait for control to stop before changing Work.";
  if (work.control === "paused") return "Review the Work contract, then resume when ready. No execution has started.";
  return "Execution cannot start until a qualified route and current authority are available.";
}

function latestTime(a: string, b: string | undefined) {
  return b && Date.parse(b) > Date.parse(a) ? b : a;
}

/** One owner-scoped read model for Work, Chat and the engineering_work tool.
 * It derives readiness from the existing manifest and never grants execution authority. */
export class EngineeringWorkerProjectionStore {
  constructor(readonly workStore: WorkStore, readonly coordinatingAgentId?: string) {}

  async get(id: string): Promise<EngineeringProjectionSnapshot> {
    const work = await this.workStore.get(id);
    return this.snapshot(work);
  }

  private async snapshot(work: Work): Promise<EngineeringProjectionSnapshot> {
    const id = work.id;
    const executionStore = new ExecutionStore(this.workStore);
    const scope = [this.workStore.principal.scopeId, this.workStore.principal.scopeKind, id];
    const [execution, route, eventRows, historyRows, nativeRows, nativeRuntimeRows] = await Promise.all([
      executionStore.get(id),
      new RoutingStore(this.workStore).snapshot(id),
      this.workStore.database.query(
        `SELECT kind,actor_id,version,created_at FROM engineering_work_events
         WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3
         ORDER BY version DESC LIMIT 1`, scope,
      ),
      this.workStore.database.query(
        `SELECT revision,kind,actor_id,created_at FROM engineering_execution_history
         WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3
         ORDER BY revision DESC LIMIT 1`,
        scope,
      ),
      this.workStore.database.query(
        `SELECT n.decision_id,n.route_run_id,n.work_version,n.work_generation,n.criteria_version,
                n.phase,n.revision,n.deadline,n.candidates,n.evidence,n.updated_at,
                d.admission_authority_snapshot->'contract'->>'coordinatingAgentId' AS agent_id,
                result.id AS native_result_id,result.proof AS native_proof,result.content_hash AS native_proof_hash,
                result.work_generation AS native_result_generation
         FROM engineering_direct_workspaces n
         JOIN engineering_routing_decisions d ON d.id=n.decision_id AND d.scope_id=n.scope_id
           AND d.scope_kind=n.scope_kind AND d.work_id=n.work_id
         LEFT JOIN LATERAL (SELECT * FROM engineering_native_results p
           WHERE p.scope_id=n.scope_id AND p.scope_kind=n.scope_kind AND p.work_id=n.work_id
           ORDER BY p.created_at DESC,p.id DESC LIMIT 1) result ON true
         WHERE n.scope_id=$1 AND n.scope_kind=$2 AND n.work_id=$3`, scope,
      ),
      this.workStore.database.query(
        `SELECT spent_microusd,reserved_microusd,usage_unknown,inflight FROM engineering_native_runtime
         WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3`,scope),
    ]);
    const current = await this.workStore.get(id);
    if (current.version !== work.version || current.generation !== work.generation ||
        current.criteriaVersion !== work.criteriaVersion) {
      throw new WorkError("projection_changed", "Work changed while its status was read. Reload before relying on this snapshot.");
    }
    if (execution && (execution.contract.workId !== work.id ||
        execution.contract.scope.scopeId !== this.workStore.principal.scopeId ||
        execution.contract.scope.scopeKind !== this.workStore.principal.scopeKind ||
        (this.coordinatingAgentId && execution.contract.coordinatingAgent !== this.coordinatingAgentId))) {
      throw new WorkError("projection_binding", "Execution is bound to a different owner or Agent.", 403);
    }

    const routing = routingForWorkVersion(route, work.version);
    const admittedRoute = routing.decision?.status === "ADMITTED" ? routing.decision : null;
    const currentRouteRun = admittedRoute ? routing.runs.find(run =>
      run.decisionId === admittedRoute.id && run.workVersion === work.version &&
      run.workGeneration === work.generation) ?? null : null;
    const nativeRow = nativeRows[0] ?? null;
    if (nativeRow && this.coordinatingAgentId && nativeRow.agent_id !== this.coordinatingAgentId)
      throw new WorkError("projection_binding", "Native development is bound to a different Agent.", 403);
    const nativeProof=nativeRow?.native_proof ? proofOfWorkSchema.parse(nativeRow.native_proof) : null;
    if (nativeProof && digest(nativeProof)!==nativeRow.native_proof_hash)
      throw new WorkError("native_result_integrity","The retained native result failed its integrity check.",503);
    const nativeResult=nativeProof ? {id:String(nativeRow.native_result_id),proof:nativeProof,
      contentHash:String(nativeRow.native_proof_hash),current:nativeProof.workVersion===work.version &&
        nativeProof.criteriaVersion===work.criteriaVersion && Number(nativeRow.native_result_generation)===work.generation} : null;
    const nativePhase = nativeRow?.phase as NonNullable<EngineeringWorkerProjection["nativeDevelopment"]>["phase"];
    const nativeCurrent = !!nativeRow && !!admittedRoute && !!currentRouteRun &&
      !execution && currentRouteRun.route === "DEEP_AGENT" && currentRouteRun.status === "RUNNING" &&
      nativeRow.decision_id === admittedRoute.id && nativeRow.route_run_id === currentRouteRun.id &&
      Number(nativeRow.work_version) === work.version &&
      Number(nativeRow.work_generation) === work.generation &&
      Number(nativeRow.criteria_version) === work.criteriaVersion &&
      Date.now() < Date.parse(String(nativeRow.deadline)) &&
      work.lifecycle === "active" && work.control === "agent";
    const nativeCandidate = Array.isArray(nativeRow?.candidates) ? nativeRow.candidates.at(-1) : null;
    const nativeCheckUnknown = nativePhase === "VERIFICATION_FAILED" &&
      Array.isArray(nativeRow?.evidence) && nativeRow.evidence.some((item: Record<string, unknown>) =>
        item.candidate === nativeCandidate?.sha &&
        !["PASS", "FAIL"].includes(String(item.result)));
    const nativeDevelopment: EngineeringWorkerProjection["nativeDevelopment"] = nativeRow ? {
      phase: nativePhase,
      label: nativePhase === "VERIFICATION_REQUESTED" ? "Candidate awaiting protected checks"
        : nativePhase === "VERIFICATION_FAILED" ? nativeCheckUnknown
          ? "Checks inconclusive; reconcile the outcome" : "Checks failed; revision needed"
        : nativePhase === "VERIFICATION_PASSED" ? "Candidate checks passed; Work not Ready"
        : "Draft in progress",
      revision: Number(nativeRow.revision),
      candidateSha: typeof nativeCandidate?.sha === "string" ? nativeCandidate.sha : null,
      evidenceCount: Array.isArray(nativeRow.evidence) ? nativeRow.evidence.length : 0,
      current: nativeCurrent,
      updatedAt: nativeRow.updated_at instanceof Date
        ? nativeRow.updated_at.toISOString() : String(nativeRow.updated_at),
    } : null;
    const nativeActivity = nativeCurrent ? nativePhase === "VERIFICATION_REQUESTED"
      ? { status: "Needs verification", activity: "Sofie retained a frozen candidate awaiting independent checks.",
          nextStep: "Run protected checks on the exact candidate. Work is not ready." }
      : nativePhase === "VERIFICATION_FAILED"
        ? nativeCheckUnknown
          ? { status: "Needs reconciliation", activity: "A protected check had no confirmed candidate outcome.",
              nextStep: "Inspect the check evidence and reconcile verifier resources before another attempt." }
          : { status: "Needs revision", activity: "Protected checks failed for the retained candidate.",
              nextStep: "Sofie can inspect the check evidence, revise the draft, and submit a new candidate." }
        : nativePhase === "VERIFICATION_PASSED"
          ? { status: "Verified candidate", activity: "Protected checks passed for the retained candidate.",
              nextStep: "Review publication and current evidence before any Ready decision." }
          : { status: "Working", activity: "Sofie has an owner-scoped native draft for this Work.",
              nextStep: "Sofie can inspect approved files, edit the draft, and submit a frozen candidate." }
      : null;
    const staleNativeActivity = nativeRow && currentRouteRun?.id === nativeRow.route_run_id && !nativeCurrent
      ? { status: "Needs reconciliation", activity: "The retained native draft is no longer current for this Work or deadline.",
          nextStep: "Recheck Work, route and deadline before another candidate or verification attempt." }
      : null;
    const runtimeRow=nativeRuntimeRows[0];
    const nativeRuntime=runtimeRow ? {spentUsd:Number(runtimeRow.spent_microusd)/1_000_000,
      reservedUsd:Number(runtimeRow.reserved_microusd)/1_000_000,usageUnknown:!!runtimeRow.usage_unknown,inflight:!!runtimeRow.inflight} : null;
    const modelActivity=nativeRuntime?.usageUnknown
      ? {status:"Needs reconciliation",activity:"A native model call has an uncertain outcome or usage.",nextStep:"Reconcile the charged model call before another model call or source edit. Retained reservations are not refunded."}
      : nativeRuntime?.inflight
        ? {status:"Working",activity:"A native model call holds a durable budget reservation.",nextStep:"Wait for the model outcome. An interrupted call must be reconciled before retry."} : null;
    const routeActivity = !execution && work.lifecycle === "active" && work.control === "agent"
      ? admittedRoute
        ? currentRouteRun
          ? modelActivity ?? nativeActivity ?? staleNativeActivity ?? {
              status: currentRouteRun.status === "QUEUED" ? "Queued"
                : currentRouteRun.status === "RUNNING" ? "Working"
                : currentRouteRun.status === "COMPLETED" ? "Needs verification"
                : "Needs reconciliation",
              activity: `Admitted ${currentRouteRun.route} route · ${currentRouteRun.status}.`,
              nextStep: currentRouteRun.status === "QUEUED"
                ? "A qualified provider must start this queued route; no execution result exists yet."
                : currentRouteRun.status === "RUNNING"
                  ? "Inspect the current provider run and retain a candidate before independent verification."
                  : currentRouteRun.status === "COMPLETED"
                    ? "Review the candidate and independent evidence before claiming readiness."
                    : "Reconcile the provider outcome before retrying or handing Work to another route.",
            }
          : { status: "Needs reconciliation", activity: "The admitted route has no current Run.",
              nextStep: "Reconcile the route Run before any new execution." }
        : routing.decision?.status === "STALE"
          ? { status: "Needs rerouting", activity: "The previous route is stale for this Work revision.",
              nextStep: "Reconcile any old writer, then assess the current Work again." }
          : routing.decision?.status === "PROPOSED"
            ? { status: "Waiting for admission", activity: "A route has been recommended; no execution is admitted.",
                nextStep: "Review the route recommendation in Work. A current authority check is required before execution." }
          : null
      : null;
    const truth = execution ? manifest(work, execution) : null;
    const result = execution?.results.at(-1) ?? null;
    const lastEvent = eventRows[0] ?? null;
    const lastExecutionEvent = historyRows[0] ?? null;
    const changes = [
      lastEvent && { kind: String(lastEvent.kind),
        at: lastEvent.created_at instanceof Date ? lastEvent.created_at.toISOString() : String(lastEvent.created_at),
        actorId: lastEvent.actor_id === null ? null : String(lastEvent.actor_id),
        version: Number(lastEvent.version) },
      lastExecutionEvent && { kind: String(lastExecutionEvent.kind),
        at: lastExecutionEvent.created_at instanceof Date ? lastExecutionEvent.created_at.toISOString() : String(lastExecutionEvent.created_at),
        actorId: lastExecutionEvent.actor_id === null ? null : String(lastExecutionEvent.actor_id),
        version: Number(lastExecutionEvent.revision) },
      result && { kind: "result", at: result.createdAt, actorId: null, version: result.version },
      nativeDevelopment && { kind: `native:${nativeDevelopment.phase.toLowerCase()}`,
        at: nativeDevelopment.updatedAt, actorId: null, version: nativeDevelopment.revision },
      routing.transitions[0] && { kind: `route:${routing.transitions[0].trigger}`, at: routing.transitions[0].createdAt,
        actorId: null, version: null },
    ].filter((change): change is NonNullable<typeof change> => !!change);
    const lastChange = changes.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] ?? null;
    const lastMeaningfulActivity = latestTime(
      latestTime(latestTime(work.updatedAt, execution?.lastActivity), nativeDevelopment?.updatedAt), lastChange?.at);
    const projection: EngineeringWorkerProjection = {
      workId: work.id,
      title: work.title,
      objective: work.objective,
      workVersion: work.version,
      criteriaVersion: work.criteriaVersion,
      lifecycle: work.lifecycle,
      control: work.control,
      workContract: execution ? {
        coordinatingAgentId: execution.contract.coordinatingAgent,
        baseSha: execution.contract.baseSha,
        deadline: execution.contract.deadline,
        profileId: execution.contract.profile.id,
        profileVersion: execution.contract.profile.version,
        policyVersion: execution.contract.policyVersion,
        budgetUsd: execution.contract.budgetUsd,
      } : null,
      authoritySummary: {
        admitted: !!execution || !!admittedRoute,
        generationCurrent: execution ? execution.generation === work.generation
          : !!currentRouteRun && work.control === "agent",
        deadlineCurrent: execution
          ? Date.now() < Date.parse(execution.contract.deadline)
          : !!nativeRow && !!admittedRoute && Date.now() < Date.parse(String(nativeRow.deadline)),
        boundaryRecheckRequired: true,
      },
      qualificationMode: execution?.qualificationMode ?? null,
      status: truth?.status ?? routeActivity?.status ?? noExecutionStatus(work),
      activity: truth?.activity ?? routeActivity?.activity ?? "Work intent is saved; no execution has been admitted.",
      nextStep: truth?.nextStep ?? routeActivity?.nextStep ?? noExecutionNextStep(work),
      readiness: truth?.readiness ?? { ready: false, reasons: nativeResult
        ? ["Native local verification is PARTIAL. Publication, CI, independent review and owner acceptance remain unverified."]
        : ["No independently verified, current Result exists."] },
      currentRun: truth?.currentRun
        ? { id: truth.currentRun.id, status: truth.currentRun.status, startedAt: truth.currentRun.startedAt,
          generationCurrent: truth.currentRun.generation === work.generation }
        : null,
      attention: truth?.attention ?? null,
      pendingDecisions: truth?.pendingDecisions ?? [],
      latestResult: result
        ? { id: result.id, version: result.version, summary: result.summary, candidate: result.candidate, createdAt: result.createdAt }
        : nativeResult ? {id:nativeResult.id,version:nativeResult.proof.workVersion,
          summary:`Native development: ${nativeResult.proof.outcome}. Publication and acceptance are not established.`,
          candidate:nativeResult.proof.resultRevision??"",createdAt:nativeResult.proof.createdAt} : null,
      nativeDevelopment,
      nativeResult,
      nativeRuntime,
      routing: routing.decision
        ? { decisionId: routing.decision.id, status: routing.decision.status, selectedRoute: routing.decision.selectedRoute,
          reason: routing.decision.reason, providerId: routing.decision.providerId }
        : null,
      repositoryObservation: truth?.repositoryObservation ?? null,
      lastMeaningfulActivity,
      lastChange,
      source: {
        kind: "durable-engineering-work",
        readAt: new Date().toISOString(),
        workRef: `engineering-work:${work.id}:v${work.version}`,
        executionRef: execution ? `engineering-execution:${work.id}:r${execution.revision}` : null,
        resultRef: result ? `engineering-result:${work.id}:v${result.version}` : nativeResult ? `native-result:${nativeResult.id}` : null,
        routingRef: routing.decision ? `engineering-route-decision:${routing.decision.id}` : null,
      },
    };
    return { work, execution, manifest: truth, routing, projection };
  }

  async list(): Promise<EngineeringProjectionSnapshot[]> {
    const items = await this.workStore.list();
    const snapshots: EngineeringProjectionSnapshot[] = [];
    for (let offset = 0; offset < items.length; offset += 8) {
      snapshots.push(...await Promise.all(items.slice(offset, offset + 8).map(item => this.snapshot(item))));
    }
    return snapshots;
  }
}
