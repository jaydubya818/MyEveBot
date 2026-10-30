import { assertFactorySpendCanStart } from "./factory-spend.ts";
import { prepareAuthenticatedFactoryInput } from "./factory-authenticated-result.ts";
import { RouteAdmissionService, type RouteAdmissionReceipt } from "./route-admission.ts";
import { requestOwnerFactoryAdmission, type MissionControlAdmissionProof } from "../missioncontrol/admit-execution.ts";
import type { FactoryPrepareRequest, FactoryReadback, LiveFactoryAdapter } from "./factory-live-adapter.ts";
import type { FactoryRouteAuthority, FactoryRuntime } from "./factory-routing.ts";
import type { FactoryReceiptStore } from "./factory-receipt-store.ts";
import type { WorkStore } from "./store.ts";
import type { Work } from "./types.ts";

/**
 * The two ordered steps of the existing FactoryWorkDriver that are not tied to dispatch, extracted so that the driver and the
 * qualification stage admitter run the SAME bodies:
 *  - buildFactoryPrepareRequest: the retained prepare request for a Work revision at an explicit base;
 *  - admitPreparedFactory: owner MissionControl admission -> LiveFactoryAdapter.prepare -> authenticated binding -> receipt
 *    registration -> RouteAdmissionService.admit (which acquires the PREPARED writer). It never dispatches.
 * Behavior is unchanged from the inlined code; `assertActive` and `observe` are the driver's fencing and observation hooks.
 */
export function buildFactoryPrepareRequest(c: {
  work: Work; config: FactoryRuntime; budgetUsd: number; baseRef: string; deadline: string; requestId: string; repairWorkOrderId?: string;
}): FactoryPrepareRequest {
  const { work, config } = c;
  return {
    ...(c.repairWorkOrderId ? { repairWorkOrderId: c.repairWorkOrderId } : {}),
    ...(config.connection.spendPlan ? { spendContract: config.connection.spendPlan } : {}),
    requestId: c.requestId, workId: work.id, workGeneration: work.generation, repository: work.repository, deadline: c.deadline,
    maxSpendUsd: Math.min(c.budgetUsd, (config.engineering.conversationQualification?.factoryCeilingMicrousd ?? Infinity) / 1_000_000),
    input: {
      title: work.title, description: work.objective, kind: "feature",
      ...("source" in config.connection ? {} : { repositoryPath: config.connection.repositoryPath }),
      baseRef: c.baseRef, acceptanceCriteria: work.criteria.map(x => x.statement), reproductionCommand: null, expectedFailureText: null,
      checkCommands: config.commands, allowedPaths: config.engineering.profile.allowedPaths, workerProfile: "source" in config.connection ? "container" : "mac",
    },
  };
}

export type AdmittedPreparation =
  | { kind: "NO_SNAPSHOT"; response: FactoryReadback }
  | { kind: "ADMITTED"; response: FactoryReadback };

export async function admitPreparedFactory(c: {
  store: WorkStore; receipts: FactoryReceiptStore; authority: FactoryRouteAuthority; adapter: LiveFactoryAdapter;
  work: Work; decisionId: string; request: FactoryPrepareRequest; config: FactoryRuntime;
  assertActive?: () => Promise<void>; observe?: (response: FactoryReadback) => Promise<void>;
}): Promise<AdmittedPreparation> {
  const assertActive = c.assertActive ?? (async () => {});
  const { work } = c;
  // Owner approval and current remote policy precede even Factory preparation.
  const missionControl = await requestOwnerFactoryAdmission(c.store, work, c.config);
  await assertActive();
  const response = await c.adapter.prepare(c.request, missionControl); await assertActive(); await c.observe?.(response);
  if (!response.snapshot) return { kind: "NO_SNAPSHOT", response };
  await registerAndAdmitPrepared({ store: c.store, receipts: c.receipts, authority: c.authority, work, decisionId: c.decisionId, request: c.request, response, missionControl, config: c.config, assertActive });
  return { kind: "ADMITTED", response };
}

/** After a PREPARED readback: authenticated binding -> receipt registration -> RouteAdmissionService.admit (acquires the PREPARED writer). Never dispatches. */
export async function registerAndAdmitPrepared(c: {
  store: WorkStore; receipts: FactoryReceiptStore; authority: Pick<FactoryRouteAuthority, "read">; work: Work; decisionId: string; request: FactoryPrepareRequest;
  response: FactoryReadback; missionControl: MissionControlAdmissionProof | null; config: FactoryRuntime; assertActive?: () => Promise<void>;
}): Promise<RouteAdmissionReceipt> {
  const assertActive = c.assertActive ?? (async () => {});
  const { work } = c;
  if (!c.response.snapshot) throw new Error("FACTORY_PREPARATION_SNAPSHOT_MISSING");
  assertFactorySpendCanStart(c.response.spend);
  const s = c.response.snapshot;
  const binding = prepareAuthenticatedFactoryInput({
    workId: work.id, workVersion: work.version, workGeneration: work.generation, criteriaVersion: work.criteriaVersion, agentId: c.config.engineering.agentId,
    factoryId: s.factoryId, factoryVersion: s.factoryVersion, requestId: s.requestId, requestDigest: s.requestDigest, sourceDigest: s.sourceDigest,
    configurationDigest: s.configurationDigest, workOrderId: s.workOrderId, runId: s.runId, attemptNumber: s.attemptNumber, inputCommit: s.inputCommit,
  });
  await assertActive(); const registered = await c.receipts.register(binding);
  const admission = new RouteAdmissionService(c.store, { read: w => c.authority.read(w, registered.id, c.request) }, c.missionControl);
  await assertActive();
  return admission.admit(work.id, { decisionId: c.decisionId, expectedWorkVersion: work.version, expectedWorkGeneration: work.generation,
    request: { route: "MYFACTORY", requiredOperations: ["factory.submit"], resourceRefs: [`repository:${work.repository}`] } });
}
