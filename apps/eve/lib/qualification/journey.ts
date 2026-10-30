import type { QualificationAccounting, QualificationProjectInput, QualificationPurpose } from "../external-alpha/qualification-accounting.ts";
import { qualificationBinding } from "../external-alpha/qualification-accounting.ts";
import { digest } from "../engineering/contract.ts";
import type { LocalResultV4Expected, ResultKey } from "../engineering/factory-producer-protocol.ts";
import { QualificationGate, type KnownOutcome, type UnknownOutcome } from "./gate.ts";
import { validateJourneyPlan, type JourneyPlan } from "./plan.ts";
import { consumeStageResult, type AcceptedStageResult } from "./result.ts";
import { verifyVerdict, type SignedVerdict, type VerifierKey, type Verdict } from "./verdict.ts";
import { acceptDelivery } from "./delivery.ts";

export type StageExpected = Omit<LocalResultV4Expected, "inputCommit" | "inputTree" | "factoryVersion" | "sourceDigest">;
/** Everything that touches a provider, a Factory, the custodian or MyApps is injected.
 * Tests inject synthetic implementations; the real qualification injects approved ones. */
export interface JourneyEnvironment {
  /** One charged provider call. Must throw ProviderNotSent only with proof nothing was sent. */
  runOperation(op: { stage: number; key: string; purpose: QualificationPurpose }): Promise<KnownOutcome<unknown> | UnknownOutcome<unknown>>;
  /** Fetches the signed Factory Result for stage 1-3 (an uncharged read). */
  collectResult(stage: 1 | 2 | 3): Promise<unknown>;
  expectedFor(stage: 1 | 2 | 3): StageExpected;
  resultKeys(): ResultKey[];
  sourceDigest: string;
  /** Fetches the custodian's public signed verdict for the exact candidate (an uncharged read). */
  collectVerdict(candidate: { commit: string; tree: string; buildArtifactSha256: string }): Promise<SignedVerdict>;
  verifierKeys: VerifierKey[]; producerKeyIds: string[]; producerPublicKeysPem: string[];
  observeDelivery(candidate: { commit: string; tree: string }): Promise<unknown>;
  newAllowanceId(stage: number): string;
  now?: () => number;
  /** Synthetic tests only; the default is the approved dashboard baseline. */
  baseline?: { commit: string; tree: string };
}

export class JourneyHalted extends Error {
  constructor(readonly stage: number, readonly code: string, readonly completed: StageRecord[]) { super(code); }
}
export type StageRecord = { stage: number; workId: string; resultManifestDigest?: string; candidate?: { commit: string; tree: string } };
export type JourneyEvidence = {
  proposalId: "qdev-20261029-01"; projectSha256: string; sourceSha256: string;
  stages: StageRecord[]; verdictSha256: string; deliverySha256: string;
  /** This record never asserts readiness; only an authorized real run can. */
  readiness: "NOT_CLAIMED"; authority: "NONE";
};

/**
 * Sequences the approved journey: Sofie intent/plan -> coding (twice) -> Factory
 * build -> independent verification -> delivery. Stops at the first refusal;
 * nothing is retried, replaced or topped up. Every charged call goes through
 * QualificationGate, and every effect carries the exact project/source binding.
 */
export class QualificationJourney {
  private readonly gate: QualificationGate;
  constructor(private readonly accounting: QualificationAccounting, private readonly project: QualificationProjectInput, private readonly env: JourneyEnvironment) {
    this.gate = new QualificationGate(accounting);
  }

  async run(rawPlan: unknown): Promise<JourneyEvidence> {
    // Refuse an unfittable plan BEFORE any reservation or dispatch.
    const plan: JourneyPlan = validateJourneyPlan(rawPlan);
    const binding = qualificationBinding(this.project);
    const records: StageRecord[] = [];
    let preceding: { commit: string; tree: string } | null = null;
    let last: AcceptedStageResult | undefined;
    let verdict: Verdict | undefined;
    for (const stage of plan.stages) {
      const bindingId = "qdev-20261029-01:stage:" + stage.stage;
      let work;
      try {
        work = await this.accounting.reserveWork({ bindingId, requestSha256: digest({ plan: stage }), ceilingMicrousd: stage.workCeilingMicrousd });
        const allowanceId = this.env.newAllowanceId(stage.stage);
        work = await this.accounting.bind(work, allowanceId);
        for (const op of stage.operations)
          await this.gate.run({ admission: work, allowanceId: work.local_allowance_id as string, operationKey: op.key, purpose: op.purpose,
            reserveMicrousd: op.reserveMicrousd, send: () => this.env.runOperation({ stage: stage.stage, key: op.key, purpose: op.purpose }) });
      } catch (error) {
        throw new JourneyHalted(stage.stage, error instanceof Error ? error.message : "QDEV_UNKNOWN", records);
      }
      const record: StageRecord = { stage: stage.stage, workId: work.id };
      try {
        if (stage.stage <= 3) {
          const s = stage.stage as 1 | 2 | 3;
          last = consumeStageResult({ signed: await this.env.collectResult(s), keys: this.env.resultKeys(), project: this.project, stage: s,
            precedingCandidate: preceding, expected: this.env.expectedFor(s), sourceDigest: this.env.sourceDigest, now: this.env.now?.(), baseline: this.env.baseline });
          preceding = { commit: last.candidateCommit, tree: last.candidateTree };
          record.resultManifestDigest = last.manifestDigest; record.candidate = preceding;
        } else {
          if (!last) throw new Error("QDEV_VERDICT_WITHOUT_CANDIDATE");
          const candidate = { commit: last.candidateCommit, tree: last.candidateTree, buildArtifactSha256: last.manifest.artifactDigest };
          verdict = verifyVerdict({ signed: await this.env.collectVerdict(candidate), verifierKeys: this.env.verifierKeys,
            producerKeyIds: this.env.producerKeyIds, producerPublicKeysPem: this.env.producerPublicKeysPem, now: this.env.now?.(),
            expected: { projectSha256: binding.projectSha256, sourceSha256: binding.sourceSha256,
              protectedSpecificationSha256: this.project.protectedSpecificationSha256, candidateCommit: candidate.commit,
              candidateTree: candidate.tree, buildArtifactSha256: candidate.buildArtifactSha256 } });
        }
      } catch (error) {
        records.push(record);
        throw new JourneyHalted(stage.stage, error instanceof Error ? error.message : "QDEV_UNKNOWN", records);
      }
      records.push(record);
    }
    if (!verdict || !last) throw new JourneyHalted(4, "QDEV_JOURNEY_INCOMPLETE", records);
    let delivery;
    try {
      delivery = acceptDelivery({ observation: await this.env.observeDelivery({ commit: last.candidateCommit, tree: last.candidateTree }),
        verdict, projectSha256: binding.projectSha256, sourceSha256: binding.sourceSha256 });
    } catch (error) {
      throw new JourneyHalted(4, error instanceof Error ? error.message : "QDEV_DELIVERY", records);
    }
    return { proposalId: "qdev-20261029-01", projectSha256: binding.projectSha256, sourceSha256: binding.sourceSha256, stages: records,
      verdictSha256: digest(verdict), deliverySha256: delivery.acceptedDeliverySha256, readiness: "NOT_CLAIMED", authority: "NONE" };
  }
}
