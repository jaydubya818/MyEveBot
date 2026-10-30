import { randomUUID } from "node:crypto";
import { decideExecutionRoute } from "../digital-worker/routing.ts";
import { requestOwnerFactoryAdmission, type MissionControlAdmissionProof } from "../missioncontrol/admit-execution.ts";
import { buildFactoryPrepareRequest, registerAndAdmitPrepared as productionRegisterAndAdmit } from "../engineering/factory-admission-step.ts";
import { factoryExecutionConfigurationHash } from "../engineering/factory-configuration-hash.ts";
import type { FactoryPrepareRequest, FactoryReadback, LiveFactoryAdapter, FactoryConnection } from "../engineering/factory-live-adapter.ts";
import type { FactoryExecutionIdentity, FactoryWriterStore } from "../engineering/factory-writer.ts";
import type { FactoryReceiptStore } from "../engineering/factory-receipt-store.ts";
import type { FactoryRouteAuthority, FactoryRuntime } from "../engineering/factory-routing.ts";
import { RoutingStore } from "../engineering/routing-store.ts";
import type { WorkStore } from "../engineering/store.ts";
import type { Work } from "../engineering/types.ts";
import type { StageStart } from "./factory-dispatch.ts";
import type { FactoryStageAdmissionSources, StageWork } from "./factory-stage-admission.ts";

/**
 * Store-backed sources for FactoryStageAdmitter, over the EXISTING engineering stores and the shared admission bodies:
 *  - Work snapshot: WorkStore.get for the host-pinned engineering Work of the stage (a stage -> Work id map from the host bundle,
 *    never a model value). The accounting ledger Work is a different record and is not used here.
 *  - Start: stage 1 is the pinned baseline; stages 2 and 3 start at the predecessor's ADMITTED signed Result candidate, supplied by
 *    the journey's own consumeStageResult acceptance. This is the qdev trust root for a non-baseline base; the production
 *    preflightApprovedBase (a single pinned manifest, used only by FactoryWorkDriver.start) is neither called nor relaxed.
 *  - Request: the same route authority, eligibility decision, RoutingStore proposal and buildFactoryPrepareRequest the driver uses,
 *    persisted into engineering_routing_decisions.factory_preparation exactly once per Work revision. An existing persisted
 *    preparation is reused only when its base equals the required start; a different one refuses (no silent rebase).
 *  - MissionControl: requestOwnerFactoryAdmission (null refused by the admitter: ordered admission is required).
 *  - Identity: registerAndAdmitPrepared (authenticated binding, receipt registration, RouteAdmissionService.admit) then the
 *    FactoryWriterStore identity of the PREPARED writer. Nothing here dispatches, stops or takes custody.
 * It adds no authority: every transport is the injected adapter, and the writer remains PREPARED until the existing dispatch path.
 */
export class StageSourcesRefused extends Error { constructor(readonly code: string) { super(code); } }
const refuse = (code: string): never => { throw new StageSourcesRefused(code); };

export type StageStoreSourcesConfig = {
  enabled: boolean;
  store: WorkStore; authority: FactoryRouteAuthority; receipts: FactoryReceiptStore; writers: FactoryWriterStore;
  adapterFor(connection: FactoryConnection): LiveFactoryAdapter;
  /** Host-pinned engineering Work id for each stage. */
  workIds: Record<1 | 2 | 3, string>;
  baseline: StageStart;
  /** The accepted predecessor candidate (from the journey's authenticated stage acceptance); null until accepted. */
  predecessor(stage: 2 | 3): Promise<StageStart | null> | StageStart | null;
  /** Defaults to the production owner admission. Tests may inject; production composition must not. */
  admission?: (store: WorkStore, work: Work, config: FactoryRuntime) => Promise<MissionControlAdmissionProof | null>;
  /** Defaults to the production route eligibility decision. Tests may inject; production composition must not. */
  eligibility?: typeof decideExecutionRoute;
  /** Defaults to the shared register + RouteAdmissionService.admit body. Tests may inject; production composition must not. */
  admitPrepared?: typeof productionRegisterAndAdmit;
  newRequestId?: () => string;
};

type StageState = { work: Work; decisionId: string; config: FactoryRuntime; proof: MissionControlAdmissionProof | null; start?: StageStart };

export class StoreBackedStageSources implements FactoryStageAdmissionSources {
  readonly enabled: boolean;
  private readonly state = new Map<1 | 2 | 3, StageState>();
  constructor(private readonly c: StageStoreSourcesConfig) { this.enabled = c.enabled === true; }

  private scope(id: string) { return [this.c.store.principal.scopeId, this.c.store.principal.scopeKind, id]; }
  private async latestDecision(id: string) {
    const [row] = await this.c.store.database.query("SELECT * FROM engineering_routing_decisions WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 ORDER BY work_version DESC LIMIT 1", this.scope(id));
    return row ?? null;
  }

  async work(stage: 1 | 2 | 3): Promise<StageWork> {
    const id = this.c.workIds[stage];
    if (typeof id !== "string" || !id) return refuse("QDEV_STAGE_WORK_UNPINNED");
    const work = await this.c.store.get(id), config = await this.c.authority.readConfig();
    if (work.lifecycle !== "active" || work.control === "stopping") return refuse("QDEV_STAGE_WORK_NOT_ACTIVE");
    this.state.set(stage, { ...(this.state.get(stage) ?? { decisionId: "", proof: null }), work, config } as StageState);
    return { id: work.id, version: work.version, generation: work.generation, criteriaVersion: work.criteriaVersion, agentId: config.engineering.agentId };
  }

  async start(stage: 1 | 2 | 3): Promise<StageStart> {
    if (stage === 1) return this.c.baseline;
    const start = await this.c.predecessor(stage);
    return start ?? refuse("QDEV_STAGE_START_UNAVAILABLE");
  }

  async request(stage: 1 | 2 | 3, start: StageStart): Promise<FactoryPrepareRequest> {
    const st = this.state.get(stage);
    if (!st) return refuse("QDEV_STAGE_WORK_UNPINNED");
    const { work, config } = st, id = work.id;
    let decision = await this.latestDecision(id);
    if (decision?.work_version === work.version && decision.factory_preparation) {
      const kept = decision.factory_preparation as { request: FactoryPrepareRequest; configurationHash: string; terminal?: unknown };
      if (kept.terminal) return refuse("QDEV_STAGE_PREPARATION_TERMINAL");
      if (kept.request.workGeneration !== work.generation || kept.request.input.baseRef !== start.commit) return refuse("QDEV_STAGE_PREPARATION_BASE");
      if (kept.configurationHash !== factoryExecutionConfigurationHash(config)) return refuse("QDEV_STAGE_CONFIGURATION_CHANGED");
      st.decisionId = decision.id; st.start = start;
      return kept.request;
    }
    const snapshot = await this.c.authority.assess(work);
    if (snapshot.selection.route !== "MYFACTORY") return refuse("QDEV_STAGE_ROUTE_NOT_FACTORY");
    const routeRequest = { route: "MYFACTORY", requiredOperations: ["factory.submit"], resourceRefs: [`repository:${work.repository}`] };
    const eligibility = (this.c.eligibility ?? decideExecutionRoute)(snapshot.contract, snapshot.context, routeRequest, snapshot.facts);
    if (!eligibility.admitted) return refuse("QDEV_STAGE_ROUTE_DENIED");
    if (!decision || decision.work_version !== work.version)
      decision = await new RoutingStore(this.c.store).recordProposal(id, { expectedWorkVersion: work.version, selectedRoute: "MYFACTORY",
        reason: "Qualification stage: bounded software production uses the qualified Factory", source: "POLICY", profile: snapshot.contract.routingProfile,
        eligibleRoutes: ["MYFACTORY", "HUMAN"], rejectedRoutes: [], constraints: ["One productive writer", "PARTIAL until separate release gates"],
        providerId: config.connection.factoryId, providerVersion: config.connection.factoryVersion });
    if ((decision.selected_route ?? decision.selectedRoute) !== "MYFACTORY") return refuse("QDEV_STAGE_ROUTE_CONFLICT");
    const [budget] = await this.c.store.database.query("SELECT deadline FROM engineering_work_model_budget WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3", this.scope(id));
    if (!budget || Date.parse(String(budget.deadline)) <= Date.now()) return refuse("QDEV_STAGE_BUDGET_DEADLINE");
    const request = buildFactoryPrepareRequest({ work, config, budgetUsd: snapshot.contract.budgetUsd, baseRef: start.commit,
      deadline: new Date(budget.deadline as string).toISOString(), requestId: (this.c.newRequestId ?? randomUUID)() });
    const preparation = JSON.stringify({ request, configurationHash: factoryExecutionConfigurationHash(config), ...(snapshot.environment ? { environment: snapshot.environment } : {}) });
    const saved = await this.c.store.database.query(`UPDATE engineering_routing_decisions SET factory_preparation=$5::jsonb
      WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 AND id=$4 AND status='PROPOSED' AND factory_preparation IS NULL RETURNING *`, [...this.scope(id), decision.id, preparation]);
    if (!saved[0]) return refuse("QDEV_STAGE_PREPARATION_CHANGED");
    st.decisionId = decision.id; st.start = start;
    return request;
  }

  async missionControl(stage: 1 | 2 | 3, work: StageWork): Promise<MissionControlAdmissionProof | null> {
    const st = this.state.get(stage);
    if (!st || st.work.id !== work.id || st.work.version !== work.version || st.work.generation !== work.generation) return refuse("QDEV_STAGE_WORK_CHANGED");
    st.proof = await (this.c.admission ?? requestOwnerFactoryAdmission)(this.c.store, st.work, st.config);
    return st.proof;
  }

  prepare(request: FactoryPrepareRequest, proof: MissionControlAdmissionProof): Promise<FactoryReadback> {
    const config = [...this.state.values()].find(s => s.work.id === request.workId)?.config;
    if (!config) return refuse("QDEV_STAGE_WORK_UNPINNED");
    return this.c.adapterFor(config.connection).prepare(request, proof);
  }

  private authorityAtPredecessor(st: StageState): Pick<FactoryRouteAuthority, "read"> {
    const start = st.start;
    if (!start) return refuse("QDEV_STAGE_AUTHORITY_BASE");
    return {
      read: async (work, requestId, prepared) => {
        if (!prepared || prepared.input.baseRef !== start.commit) return refuse("QDEV_STAGE_AUTHORITY_BASE");
        const snapshot = await this.c.authority.read(work, requestId, prepared);
        if (!snapshot.factory) return refuse("QDEV_STAGE_AUTHORITY_BASE");
        return { ...snapshot, factory: { ...snapshot.factory, baseSha: start.commit } };
      },
    };
  }

  async identity(stage: 1 | 2 | 3, work: StageWork, readback: FactoryReadback, request: FactoryPrepareRequest): Promise<FactoryExecutionIdentity> {
    const st = this.state.get(stage);
    if (!st?.decisionId || st.work.id !== work.id) return refuse("QDEV_STAGE_WORK_CHANGED");
    // Stages 2/3 start at the accepted predecessor candidate, which the production route authority cannot know: it pins the writer base to the single
    // approved manifest. The writer SQL guard compares that base with the Factory-reported inputCommit, so for these stages the authority's base is bound to
    // the authenticated predecessor start the admitter already verified (never a model- or Factory-supplied value). Stage 1 keeps the unmodified production
    // authority, so its approved-base cross-check is untouched, and the production approved-base preflight is neither called nor relaxed here.
    const authority = stage === 1 ? this.c.authority : this.authorityAtPredecessor(st);
    const receipt = await (this.c.admitPrepared ?? productionRegisterAndAdmit)({ store: this.c.store, receipts: this.c.receipts, authority, work: st.work, decisionId: st.decisionId,
      request, response: readback, missionControl: st.proof, config: st.config });
    if (receipt?.decisionId !== st.decisionId || typeof receipt.runId !== "string" || !receipt.runId) return refuse("QDEV_STAGE_RUN_MISSING");
    const run = await this.c.writers.inspect(work.id, receipt.runId);
    if (run.dispatch_state !== "PREPARED") return refuse("QDEV_STAGE_WRITER_STATE");
    return this.c.writers.identity(run);
  }
}
