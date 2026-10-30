import type { MissionControlAdmissionProof } from "../missioncontrol/admit-execution.ts";
import type { FactoryPrepareRequest, FactoryReadback } from "../engineering/factory-live-adapter.ts";
import type { FactoryExecutionIdentity } from "../engineering/factory-writer.ts";
import { assertFactorySpendCanStart } from "../engineering/factory-spend.ts";
import { FactoryPreparationTerminalReceived } from "../engineering/factory-preparation-terminal.ts";
import { canonical } from "../engineering/factory-producer-protocol.ts";
import type { RetainedFactoryAdmission } from "./factory-live-port.ts";
import type { StageStart } from "./factory-dispatch.ts";

/**
 * Frontdoor composition for one Factory stage, using the SAME ordered-admission steps as the existing
 * FactoryWorkDriver: a fresh MissionControl admission proof is obtained first (network, before any
 * database lock), then `LiveFactoryAdapter.prepare(request, proof)` (which in turn requires the
 * FactoryCapabilityClient challenge/permit exchange), then the prepared snapshot is turned into the
 * trusted retained admission that LiveFactoryPort re-verifies before any gate claim.
 *
 * Nothing here is authority: the Work snapshot, prepare request and identity come from host-owned
 * sources, the proof is whatever the existing admission path returns, and every transport is injected
 * (disabled/fake in tests). There is no fallback when admission is absent.
 */
export class FactoryStageAdmissionRefused extends Error {
  constructor(readonly code: string) { super(code); }
}
const refuse = (code: string): never => { throw new FactoryStageAdmissionRefused(code); };

export type StageWork = { id: string; version: number; generation: number; criteriaVersion: number; agentId: string };
export type FactoryStageAdmissionSources = {
  enabled?: boolean;
  /** Trusted Work snapshot for the stage (from the Work store). */
  work(stage: 1 | 2 | 3): StageWork | Promise<StageWork>;
  /** Trusted retained prepare request for the stage starting from `start`. */
  request(stage: 1 | 2 | 3, start: StageStart): FactoryPrepareRequest | Promise<FactoryPrepareRequest>;
  start(stage: 1 | 2 | 3): StageStart | Promise<StageStart>;
  /** Fresh MissionControl admission (production: requestOwnerFactoryAdmission). null is refused: qdev requires ordered admission. */
  missionControl(stage: 1 | 2 | 3, work: StageWork): Promise<MissionControlAdmissionProof | null>;
  /** Production: LiveFactoryAdapter.prepare bound to its FactoryCapabilityClient. */
  prepare(request: FactoryPrepareRequest, proof: MissionControlAdmissionProof): Promise<FactoryReadback>;
  /** Writer identity (dispatchIdentity/writerGeneration/run) for the prepared attempt, from the writer store. */
  identity(stage: 1 | 2 | 3, work: StageWork, readback: FactoryReadback, request: FactoryPrepareRequest): FactoryExecutionIdentity | Promise<FactoryExecutionIdentity>;
};

export class FactoryStageAdmitter {
  private readonly done = new Map<1 | 2 | 3, Promise<RetainedFactoryAdmission>>();
  constructor(private readonly s: FactoryStageAdmissionSources) {}

  /** Admits the stage exactly once; a second call returns the same retained admission and never re-prepares. */
  retained(stage: 1 | 2 | 3): Promise<RetainedFactoryAdmission> {
    if (!this.done.has(stage)) this.done.set(stage, this.admit(stage));
    return this.done.get(stage)!;
  }

  private async admit(stage: 1 | 2 | 3): Promise<RetainedFactoryAdmission> {
    if (this.s.enabled !== true) return refuse("QDEV_STAGE_ADMISSION_DISABLED");
    const work = await this.s.work(stage), start = await this.s.start(stage), request = await this.s.request(stage, start);
    if (request.workId !== work.id || request.workGeneration !== work.generation || request.input.baseRef !== start.commit)
      return refuse("QDEV_STAGE_ADMISSION_REQUEST");
    const proof = await this.s.missionControl(stage, work);
    if (!proof) return refuse("QDEV_STAGE_ADMISSION_REQUIRED");
    let response: FactoryReadback;
    try { response = await this.s.prepare(request, proof); }
    catch (error) {
      // The ordered client reports a signed preparation terminal (declined/held) by throwing it: that is a refusal, never a retry.
      if (error instanceof FactoryPreparationTerminalReceived) return refuse("QDEV_STAGE_ADMISSION_TERMINAL");
      throw error;
    }
    const snap = response.snapshot as Record<string, any> | null;
    if (!snap) return refuse("QDEV_STAGE_ADMISSION_SNAPSHOT");
    if (response.state !== "PREPARED" || response.requestId !== request.requestId) return refuse("QDEV_STAGE_ADMISSION_STATE");
    try { assertFactorySpendCanStart(response.spend); } catch { return refuse("QDEV_STAGE_ADMISSION_SPEND"); }
    if (snap.version !== 4 || snap.inputCommit !== start.commit || snap.inputTree !== start.tree
      || snap.workOrderId !== response.workOrderId || snap.runId !== response.runId || snap.requestId !== request.requestId)
      return refuse("QDEV_STAGE_ADMISSION_SNAPSHOT");
    // Same field mapping as FactoryWorkDriver (prepareAuthenticatedFactoryInput), extended with the local V4 pins.
    const binding = {
      workId: work.id, workVersion: work.version, workGeneration: work.generation, criteriaVersion: work.criteriaVersion, agentId: work.agentId,
      factoryId: snap.factoryId, factoryVersion: snap.factoryVersion, requestId: snap.requestId, requestDigest: snap.requestDigest,
      sourceDigest: snap.sourceDigest, configurationDigest: snap.configurationDigest, workOrderId: snap.workOrderId, runId: snap.runId,
      attemptNumber: snap.attemptNumber, inputCommit: snap.inputCommit, localSnapshotVersion: 4 as const, inputTree: snap.inputTree, configuration: snap.configuration,
    };
    const identity = await this.s.identity(stage, work, response, request);
    if (canonical(identity.allowedPaths) !== canonical(request.input.allowedPaths)) return refuse("QDEV_STAGE_ADMISSION_IDENTITY");
    return { binding, identity, request };
  }
}
