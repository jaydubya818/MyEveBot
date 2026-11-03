import type { QualificationAccounting, QualificationProjectInput, QualificationPurpose } from "../external-alpha/qualification-accounting.ts";
import { qualificationBinding } from "../external-alpha/qualification-accounting.ts";
import { digest } from "../engineering/contract.ts";
import type { LocalResultV4Expected, ResultKey } from "../engineering/factory-producer-protocol.ts";
import { QualificationGate, ProviderNotSent, type KnownOutcome, type UnknownOutcome } from "./gate.ts";
import { validateJourneyPlan, type JourneyPlan } from "./plan.ts";
import { consumeStageResult, type AcceptedStageResult } from "./result.ts";
import { verifyVerdict, type SignedVerdict, type VerifierKey, type Verdict } from "./verdict.ts";
import { acceptDelivery } from "./delivery.ts";
import { InMemoryJournal, type JournalEvent, type JourneyJournal } from "./journal.ts";

export type StageExpected = Omit<LocalResultV4Expected, "inputCommit" | "inputTree" | "factoryVersion" | "sourceDigest">;
/** Everything that touches a provider, a Factory, the custodian or MyApps is injected.
 * Tests inject synthetic implementations; the real qualification injects approved ones. */
export interface JourneyEnvironment {
  /** One charged provider call. Must throw ProviderNotSent only with proof nothing was sent. */
  runOperation(op: { stage: number; key: string; purpose: QualificationPurpose; reserveMicrousd: number }): Promise<KnownOutcome<unknown> | UnknownOutcome<unknown>>;
  /** Fetches the signed Factory Result for stage 1-3 (an uncharged read). */
  collectResult(stage: 1 | 2 | 3): Promise<unknown>;
  expectedFor(stage: 1 | 2 | 3): StageExpected;
  resultKeys(): ResultKey[];
  sourceDigest: string;
  /** Fetches the custodian's public signed verdict for the exact candidate (an uncharged read). */
  collectVerdict(candidate: { commit: string; tree: string; buildArtifactSha256: string }): Promise<SignedVerdict>;
  verifierKeys: VerifierKey[]; producerKeyIds: string[]; producerPublicKeysPem: string[];
  /**
   * Resolves the build identity of the accepted stage-3 candidate from the canonical MyApps retained static
   * artifact + verified static build claim (NOT from the Result's git/check metadata digest). The verifier
   * attests this digest and the delivery observer re-derives it from the served files.
   */
  retainBuild(candidate: { commit: string; tree: string }): Promise<{ buildArtifactSha256: string }>;
  observeDelivery(candidate: { commit: string; tree: string }): Promise<unknown>;
  newAllowanceId(stage: number): string;
  /**
   * Optional async preparation proof for a stage that dispatches a Factory run. Called after the preceding stage was
   * accepted and before the stage reserves, claims or sends anything; a failure halts the stage with nothing charged.
   */
  preflightStage?(stage: 1 | 2 | 3): Promise<void>;
  now?: () => number;
  /** Called after a stage Result was accepted (also on resume), so adapters can track the accepted candidate chain. */
  onStageAccepted?(stage: 1 | 2 | 3, candidate: { commit: string; tree: string; buildArtifactSha256: string }): void;
  /** Durable orchestration journal; enables restart recovery without re-sending. */
  journal?: JourneyJournal;
  /** Synthetic tests only; the default is the approved dashboard baseline. */
  baseline?: { commit: string; tree: string };
}

/** The canonical accounting request material of a stage. It carries the FULL approved-plan digest, so the ledger itself (not only the journal key) refuses a Work reserved under another plan. */
export const stageRequestSha256 = (stage: JourneyPlan["stages"][number], plan: JourneyPlan): string => digest({ plan: stage, approvedPlanSha256: digest(plan) });

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
  private readonly journal: JourneyJournal;
  constructor(private readonly accounting: QualificationAccounting, private readonly project: QualificationProjectInput, private readonly env: JourneyEnvironment) {
    this.gate = new QualificationGate(accounting);
    this.journal = env.journal ?? new InMemoryJournal();
  }

  private async freezeExpectation(stage: 1 | 2 | 3): Promise<void> {
    const expected = this.env.expectedFor(stage);
    const current = digest(expected);
    const events = await this.journal.read();
    const prior = events.find(e => e.kind === "STAGE_EXPECTATION" && e.stage === stage) as Extract<JournalEvent, { kind: "STAGE_EXPECTATION" }> | undefined;
    if (prior) {
      if (digest(prior.expected) !== prior.digest) throw new Error("QDEV_EXPECTATION_TAMPERED");
      if (prior.digest !== current) throw new Error("QDEV_EXPECTATION_CHANGED");
      return;
    }
    // A stage that already has effects but no retained expectation cannot be trusted to resume.
    if (events.some(e => e.kind !== "STAGE_EXPECTATION" && e.kind !== "HALTED" && "stage" in e && e.stage === stage)) throw new Error("QDEV_EXPECTATION_MISSING");
    await this.journal.append({ kind: "STAGE_EXPECTATION", stage, digest: current, expected: structuredClone(expected) });
  }

  /**
   * Recovery of a stage that the journal says is already bound (fully settled OR partially settled). The journal alone is NOT proof that the Work, its
   * allowance or its settlements belong to this cohort, so EVERY recovered binding is re-proved against the canonical ledger of the CURRENT cohort/policy
   * before any reservation, binding, dispatch, Result or delivery trusts it, and nothing is ever allocated here:
   *  - the journaled approved-plan digest must be this plan's (a history copied from another plan fails closed);
   *  - the Work must exist with the journaled id and allowance and carry exactly this stage's canonical binding/request (which includes the approved-plan
   *    digest)/ceiling/owner/cohort, as a BOUND Work (`assert`) or as CLOSED history proved through its settled operation;
   *  - every journaled settlement must be the ledger's own SETTLED operation: for a BOUND Work the exact operation, purpose and reservation re-read through the
   *    single-use claim path (an absent operation is tombstoned and refused, a DISPATCHED/RUNNING one is fenced by the ledger and refused); for CLOSED history
   *    the SETTLED operation of that Work (the ledger closes a Work only once every operation is SETTLED or NOT_DISPATCHED).
   * Any mismatch halts at the stage as QDEV_RECOVERY_COHORT_MISMATCH / QDEV_RECOVERY_RECEIPT_MISMATCH / QDEV_JOURNEY_PLAN_MISMATCH, before delivery is observed.
   */
  private async verifyRecoveredWork(stage: JourneyPlan["stages"][number], bindingId: string, bound: Extract<JournalEvent, { kind: "STAGE_BOUND" }>, requestSha256: string,
    approvedPlanSha256: string, settled: JourneyPlan["stages"][number]["operations"]) {
    if (bound.approvedPlanSha256 !== approvedPlanSha256) throw new Error("QDEV_JOURNEY_PLAN_MISMATCH");
    const mismatch = () => new Error("QDEV_RECOVERY_COHORT_MISMATCH");
    const denied = (error: unknown) => error instanceof Error && error.message === "QDEV_DENIED" ? mismatch() : error;
    const reference = { id: bound.workId } as Awaited<ReturnType<QualificationAccounting["bind"]>>;
    let row: Awaited<ReturnType<QualificationAccounting["bind"]>> | undefined;
    try { row = await this.accounting.assertBound(reference, bound.allowanceId); }
    catch (error) { if (!(error instanceof Error) || error.message !== "QDEV_DENIED") throw error; }
    if (!row) {
      if (!settled.length) throw mismatch();
      try { row = await this.accounting.verifyClosedSettlement(reference, bound.allowanceId, settled[0]!.key); } catch (error) { throw denied(error); }
      if (row.state !== "CLOSED") throw mismatch();
    }
    if (row.id !== bound.workId || row.local_allowance_id !== bound.allowanceId || (row.state !== "BOUND" && row.state !== "CLOSED")) throw mismatch();
    this.accounting.expectWork(row, { bindingId, requestSha256, ceilingMicrousd: stage.workCeilingMicrousd });
    for (const [index, op] of settled.entries()) {
      try {
        if (row.state === "BOUND") await this.accounting.verifySettledOperation(row, bound.allowanceId, op.key, op.purpose, op.reserveMicrousd);
        else if (index > 0) await this.accounting.verifyClosedSettlement(row, bound.allowanceId, op.key);
      } catch (error) { throw denied(error); }
    }
    return row;
  }

  async run(rawPlan: unknown): Promise<JourneyEvidence> {
    // Refuse an unfittable plan BEFORE any reservation or dispatch.
    const plan: JourneyPlan = validateJourneyPlan(rawPlan);
    const binding = qualificationBinding(this.project);
    const approvedPlanSha256 = digest(plan);
    const records: StageRecord[] = [];
    let preceding: { commit: string; tree: string } | null = null;
    let last: AcceptedStageResult | undefined;
    let verdict: Verdict | undefined;
    let buildArtifactSha256: string | undefined;
    for (const stage of plan.stages) {
      const bindingId = "qdev-20261029-01:stage:" + stage.stage;
      let work;
      try {
        const events = await this.journal.read();
        if (stage.stage <= 3) {
          // Async preparation (Factory-run stages: CODING and FACTORY) runs after the predecessor was accepted and before this stage's first effect; later
          // stages' run identities are never required up front. Then the stage's full canonical Result expectation
          // is persisted (or, on resume, compared) BEFORE any reservation, claim or send: a changed expectation
          // halts and never replaces the retained one.
          if (this.env.preflightStage) {
            const done = new Set(events.filter(e => e.kind === "OP_SETTLED" && e.stage === stage.stage).map(e => (e as { key: string }).key));
            if (stage.operations.some(op => (op.purpose === "FACTORY" || op.purpose === "CODING") && !done.has(op.key))) await this.env.preflightStage(stage.stage as 1 | 2 | 3);
          }
          await this.freezeExpectation(stage.stage as 1 | 2 | 3);
        }
        const bound = events.find(e => e.kind === "STAGE_BOUND" && e.stage === stage.stage) as Extract<JournalEvent, { kind: "STAGE_BOUND" }> | undefined;
        const settled = new Set(events.filter(e => e.kind === "OP_SETTLED" && e.stage === stage.stage).map(e => (e as { key: string }).key));
        const claimed = new Set(events.filter(e => e.kind === "OP_CLAIMED" && e.stage === stage.stage).map(e => (e as { key: string }).key));
        // Recovery: an operation claimed but never settled is ambiguous exposure. Fence it; never re-send.
        const dangling = stage.operations.find(op => claimed.has(op.key) && !settled.has(op.key));
        const pending = stage.operations.filter(op => !settled.has(op.key));
        const requestSha256 = stageRequestSha256(stage, plan);
        let allowanceId: string;
        if (bound) {
          // Every recovered binding (settled or partially settled) is re-proved BEFORE any reservation, binding or dispatch; a replacement ledger or a
          // history copied from another cohort/plan can never reserve a different Work or bind the journal's old allowance.
          work = await this.verifyRecoveredWork(stage, bindingId, bound, requestSha256, approvedPlanSha256, stage.operations.filter(op => settled.has(op.key)));
          allowanceId = bound.allowanceId;
        } else {
          work = await this.accounting.reserveWork({ bindingId, requestSha256, ceilingMicrousd: stage.workCeilingMicrousd });
          allowanceId = this.env.newAllowanceId(stage.stage);
          work = await this.accounting.bind(work, allowanceId);
          await this.journal.append({ kind: "STAGE_BOUND", stage: stage.stage, workId: work.id, allowanceId, approvedPlanSha256 });
        }
        if (dangling) { await this.gate.recoverInterrupted(work); throw new Error("QDEV_RECOVERY_UNKNOWN"); }
        for (const op of pending) {
          await this.gate.run({ admission: work, allowanceId, operationKey: op.key, purpose: op.purpose, reserveMicrousd: op.reserveMicrousd,
            send: async () => {
              // A journal failure happens before any send, so it is a proven no-send.
              try { await this.journal.append({ kind: "OP_CLAIMED", stage: stage.stage, key: op.key }); } catch { throw new ProviderNotSent(); }
              return this.env.runOperation({ stage: stage.stage, key: op.key, purpose: op.purpose, reserveMicrousd: op.reserveMicrousd });
            } });
          await this.journal.append({ kind: "OP_SETTLED", stage: stage.stage, key: op.key });
        }
      } catch (error) {
        throw new JourneyHalted(stage.stage, error instanceof Error ? error.message : "QDEV_UNKNOWN", records);
      }
      const record: StageRecord = { stage: stage.stage, workId: work.id };
      let priorAccepted: Extract<JournalEvent, { kind: "STAGE_ACCEPTED" }> | undefined;
      try {
        priorAccepted = (await this.journal.read()).find(e => e.kind === "STAGE_ACCEPTED" && e.stage === stage.stage) as typeof priorAccepted;
        if (stage.stage <= 3) {
          const s = stage.stage as 1 | 2 | 3;
          last = consumeStageResult({ signed: await this.env.collectResult(s), keys: this.env.resultKeys(), project: this.project, stage: s,
            precedingCandidate: preceding, expected: this.env.expectedFor(s), sourceDigest: this.env.sourceDigest, now: this.env.now?.(), baseline: this.env.baseline });
          preceding = { commit: last.candidateCommit, tree: last.candidateTree };
          if (s === 3) {
            const build = await this.env.retainBuild(preceding);
            if (!/^[a-f0-9]{64}$/.test(build?.buildArtifactSha256 ?? "")) throw new Error("QDEV_BUILD_IDENTITY_INVALID");
            buildArtifactSha256 = build.buildArtifactSha256;
          }
          // An already accepted stage keeps its exact authenticated manifest/candidate/build identity.
          if (priorAccepted && (priorAccepted.digest !== last.manifestDigest
            || (priorAccepted.candidate && (priorAccepted.candidate.commit !== preceding.commit || priorAccepted.candidate.tree !== preceding.tree))
            || (s === 3 && priorAccepted.buildArtifactSha256 !== undefined && priorAccepted.buildArtifactSha256 !== buildArtifactSha256)))
            throw new Error("QDEV_ACCEPTED_IDENTITY_CHANGED");
          this.env.onStageAccepted?.(s, { ...preceding, buildArtifactSha256: s === 3 ? buildArtifactSha256! : last.manifest.artifactDigest });
          record.resultManifestDigest = last.manifestDigest; record.candidate = preceding;
        } else {
          if (!last || !buildArtifactSha256) throw new Error("QDEV_VERDICT_WITHOUT_CANDIDATE");
          const candidate = { commit: last.candidateCommit, tree: last.candidateTree, buildArtifactSha256 };
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
      if (!priorAccepted) {
        try {
          await this.journal.append({ kind: "STAGE_ACCEPTED", stage: stage.stage, digest: record.resultManifestDigest ?? digest({ verdict }),
            ...(record.candidate ? { candidate: record.candidate } : {}), ...(stage.stage === 3 ? { buildArtifactSha256 } : {}) });
        } catch { throw new JourneyHalted(stage.stage, "QDEV_JOURNAL_ACCEPT", records); } // fail closed: an unrecorded acceptance cannot be enforced on resume
      }
    }
    if (!verdict || !last) throw new JourneyHalted(4, "QDEV_JOURNEY_INCOMPLETE", records);
    let delivery;
    try {
      delivery = acceptDelivery({ observation: await this.env.observeDelivery({ commit: last.candidateCommit, tree: last.candidateTree }),
        verdict, projectSha256: binding.projectSha256, sourceSha256: binding.sourceSha256 });
    } catch (error) {
      throw new JourneyHalted(4, error instanceof Error ? error.message : "QDEV_DELIVERY", records);
    }
    // The delivery fact is durable so a restart, a later session or a read-only progress view can tell "verified" from "delivered".
    try {
      if (!(await this.journal.read()).some(e => e.kind === "DELIVERY_ACCEPTED"))
        await this.journal.append({ kind: "DELIVERY_ACCEPTED", stage: 4, digest: delivery.acceptedDeliverySha256, verdictSha256: digest(verdict) });
    } catch { throw new JourneyHalted(4, "QDEV_JOURNAL_DELIVERY", records); }
    return { proposalId: "qdev-20261029-01", projectSha256: binding.projectSha256, sourceSha256: binding.sourceSha256, stages: records,
      verdictSha256: digest(verdict), deliverySha256: delivery.acceptedDeliverySha256, readiness: "NOT_CLAIMED", authority: "NONE" };
  }
}
