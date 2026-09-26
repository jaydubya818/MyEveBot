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
  return "Review the Work contract and admit execution through its authorized workflow.";
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
    const [execution, route, eventRows, historyRows] = await Promise.all([
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
      routing.transitions[0] && { kind: `route:${routing.transitions[0].trigger}`, at: routing.transitions[0].createdAt,
        actorId: null, version: null },
    ].filter((change): change is NonNullable<typeof change> => !!change);
    const lastChange = changes.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] ?? null;
    const lastMeaningfulActivity = latestTime(latestTime(work.updatedAt, execution?.lastActivity), lastChange?.at);
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
        admitted: !!execution,
        generationCurrent: !!execution && execution.generation === work.generation,
        deadlineCurrent: !!execution && Date.now() < Date.parse(execution.contract.deadline),
        boundaryRecheckRequired: true,
      },
      qualificationMode: execution?.qualificationMode ?? null,
      status: truth?.status ?? noExecutionStatus(work),
      activity: truth?.activity ?? "Work intent is saved; no execution has been admitted.",
      nextStep: truth?.nextStep ?? noExecutionNextStep(work),
      readiness: truth?.readiness ?? { ready: false, reasons: ["No admitted execution or verified current evidence exists."] },
      currentRun: truth?.currentRun
        ? { id: truth.currentRun.id, status: truth.currentRun.status, startedAt: truth.currentRun.startedAt,
          generationCurrent: truth.currentRun.generation === work.generation }
        : null,
      attention: truth?.attention ?? null,
      pendingDecisions: truth?.pendingDecisions ?? [],
      latestResult: result
        ? { id: result.id, version: result.version, summary: result.summary, candidate: result.candidate, createdAt: result.createdAt }
        : null,
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
        resultRef: result ? `engineering-result:${work.id}:v${result.version}` : null,
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
