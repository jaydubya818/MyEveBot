import { qualificationBinding, QDEV_BASELINE, type QualificationProjectInput, type QualificationPurpose } from "../external-alpha/qualification-accounting.ts";
import type { LocalFactoryBindingV4 } from "../engineering/factory-receipt-store.ts";
import type { ResultKey } from "../engineering/factory-producer-protocol.ts";
import { ProviderNotSent, type KnownOutcome, type UnknownOutcome } from "./gate.ts";
import type { JourneyEnvironment, StageExpected } from "./journey.ts";
import type { JourneyJournal } from "./journal.ts";
import type { RelayDeveloperTools } from "./relay-tools.ts";
import { bindFactoryDispatch, type StageStart } from "./factory-dispatch.ts";
import { buildVerifierHandoff, type VerifierHandoff } from "./verifier-handoff.ts";
import type { SignedVerdict, VerifierKey } from "./verdict.ts";
import { digest } from "../engineering/contract.ts";

type Outcome = KnownOutcome<unknown> | UnknownOutcome<unknown>;
type Op = { stage: number; key: string; purpose: QualificationPurpose };
/** Sofie planning and Deep Agent execution. The agent only reaches Relay through the discovered, grant-checked tools. */
export interface AgentPort { run(op: Op, relay: RelayDeveloperTools): Promise<Outcome>; }
export interface FactoryPort {
  /** Trusted request admission for the stage (from the existing Work admission path). */
  admit(stage: 1 | 2 | 3, start: StageStart): unknown;
  dispatch(binding: LocalFactoryBindingV4): Promise<Outcome>;
  fetchResult(stage: 1 | 2 | 3): Promise<unknown>;
}
export interface VerifierPort { submit(handoff: VerifierHandoff): Promise<Outcome>; fetchVerdict(candidate: { commit: string; tree: string; buildArtifactSha256: string }): Promise<SignedVerdict>; }
export interface MyAppsPort {
  /** Canonical retained static build + verified build claim for the accepted stage-3 candidate; returns its artifact digest. */
  retainBuild(candidate: { commit: string; tree: string }): Promise<{ buildArtifactSha256: string }>;
  observe(candidate: { commit: string; tree: string }): Promise<unknown>;
}

export type WiringConfig = {
  project: QualificationProjectInput; agent: AgentPort; relay: RelayDeveloperTools; factory: FactoryPort; verifier: VerifierPort; myapps: MyAppsPort;
  expectedFor(stage: 1 | 2 | 3): StageExpected; resultKeys: ResultKey[]; sourceDigest: string;
  verifierKeys: VerifierKey[]; producerKeyIds: string[]; producerPublicKeysPem: string[];
  newAllowanceId(stage: number): string; journal?: JourneyJournal; now?: () => number; baseline?: StageStart;
};

/**
 * Composes the approved ports into the journey environment. All pre-send validation
 * (binding, start commit/tree, FactoryVersion, handoff) happens BEFORE the port is
 * called and fails as ProviderNotSent, so a refusal tombstones the claim without
 * any provider contact. Port failures after that are the gate's ambiguous exposure.
 */
export function wireJourneyEnvironment(c: WiringConfig): JourneyEnvironment {
  const binding = qualificationBinding(c.project);
  const accepted = new Map<number, { commit: string; tree: string; buildArtifactSha256: string }>();
  const expectations = new Map<1 | 2 | 3, StageExpected>();
  // Snapshot canonical admission expectations before dispatch. Result validation
  // must consume the same request/run tuple, even if a caller later changes it.
  const expectedFor = (stage: 1 | 2 | 3): StageExpected => {
    if (!expectations.has(stage)) expectations.set(stage, structuredClone(c.expectedFor(stage)));
    return structuredClone(expectations.get(stage)!);
  };
  const baseline = c.baseline ?? { commit: QDEV_BASELINE.inputCommit as string, tree: QDEV_BASELINE.inputTree as string };
  const startOf = (stage: number): StageStart | null => stage === 1 ? baseline : accepted.get(stage - 1) ?? null;
  return {
    async runOperation(op) {
      if (op.purpose === "SOFIE" || op.purpose === "CODING") return c.agent.run(op, c.relay);
      if (op.purpose === "FACTORY") {
        let bound: LocalFactoryBindingV4;
        try {
          const stage = op.stage as 1 | 2 | 3, start = startOf(stage);
          if (stage > 3 || !start) throw new Error("QDEV_DISPATCH_START_REQUIRED");
          bound = bindFactoryDispatch({ admitted: c.factory.admit(stage, start), project: c.project, stage, start, baseline });
          const expected = expectedFor(stage);
          const fields = ["factoryId", "configurationDigest", "requestId", "requestDigest", "workOrderId", "runId", "attemptNumber"] as const;
          if (bound.sourceDigest !== c.sourceDigest || fields.some(field => bound[field] !== expected[field])
            || digest(bound.configuration) !== digest(expected.configuration))
            throw new Error("QDEV_DISPATCH_RESULT_BINDING");
        } catch { throw new ProviderNotSent("pre-send validation"); }
        return c.factory.dispatch(bound);
      }
      let handoff: VerifierHandoff;
      try {
        const candidate = accepted.get(3);
        if (!candidate) throw new Error("QDEV_VERIFIER_CANDIDATE_REQUIRED");
        handoff = buildVerifierHandoff({ project: c.project, binding, candidate });
      } catch { throw new ProviderNotSent("pre-send validation"); }
      return c.verifier.submit(handoff);
    },
    collectResult: stage => c.factory.fetchResult(stage),
    expectedFor, resultKeys: () => c.resultKeys, sourceDigest: c.sourceDigest,
    collectVerdict: candidate => c.verifier.fetchVerdict(candidate),
    verifierKeys: c.verifierKeys, producerKeyIds: c.producerKeyIds, producerPublicKeysPem: c.producerPublicKeysPem,
    retainBuild: candidate => c.myapps.retainBuild(candidate),
    observeDelivery: candidate => c.myapps.observe(candidate),
    newAllowanceId: stage => c.newAllowanceId(stage), now: c.now, journal: c.journal, baseline: c.baseline,
    onStageAccepted: (stage, candidate) => { accepted.set(stage, candidate); },
  };
}
