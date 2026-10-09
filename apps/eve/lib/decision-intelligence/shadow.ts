import { createHash } from "node:crypto";
import type { KnowledgeKind } from "../knowledge-types.ts";
import {
  DecisionFailure,
  knowledgeRequest,
  resultSchema,
  safeFailure,
  type DecisionProvider,
  type Evidence,
  type Failure,
  type Outcome,
} from "./contract.ts";

export interface ShadowCandidate {
  id: string;
  kind: KnowledgeKind;
  statement: string;
  // V0 never sends real owner data. Synthetic qualification is an explicit caller boundary.
  source: "synthetic" | "owner";
}
export interface ShadowPolicy {
  enabled: boolean;
  samplePercent: number;
  maxDecisions: number;
  timeoutMs: number;
  concurrency: number;
}
export const disabledPolicy: ShadowPolicy = {
  enabled: false,
  samplePercent: 0,
  maxDecisions: 0,
  timeoutMs: 3000,
  concurrency: 1,
};

export function privacyEligible(candidate: ShadowCandidate): boolean {
  return (
    candidate.source === "synthetic" &&
    candidate.statement.length > 0 &&
    candidate.statement.length <= 4000 &&
    !/(?:-----BEGIN|\bBearer\s|\b(?:sk|ghp|ghs)[-_][a-zA-Z0-9]{8,}|(?:password|api[_ -]?key|secret|token)\s*[:=]\s*\S+|SYNTHETIC_SECRET_)/i.test(
      candidate.statement,
    )
  );
}

/** Bounded, non-authoritative observer. No retries, backlog, or Knowledge writes. */
export class ShadowEvaluator {
  private inFlight = 0;
  private attempts = 0;
  private readonly seen = new Set<string>();
  private readonly provider: DecisionProvider | null;
  private readonly policy: ShadowPolicy;
  constructor(
    provider: DecisionProvider | null,
    policy: ShadowPolicy = disabledPolicy,
  ) {
    this.provider = provider;
    this.policy = policy;
  }

  async evaluate(
    candidate: ShadowCandidate,
    expected: Outcome | null = null,
    canonical: Outcome | null = null,
  ): Promise<Evidence> {
    const skipped = (failure: Failure): Evidence => ({
      id: candidate.id,
      expected,
      canonical,
      result: null,
      failure,
    });
    if (candidate.kind === "insight") return skipped("SKIPPED_OUT_OF_SCOPE");
    const p = this.policy;
    if (
      !p.enabled ||
      ![p.samplePercent, p.maxDecisions, p.timeoutMs, p.concurrency].every(
        Number.isFinite,
      ) ||
      p.samplePercent < 0 ||
      p.samplePercent > 100 ||
      p.timeoutMs <= 0 ||
      p.timeoutMs > 30000 ||
      p.concurrency < 1 ||
      p.concurrency > 4 ||
      p.maxDecisions < 0 ||
      p.maxDecisions > 1000
    )
      return skipped("DISABLED");
    const sample =
      (createHash("sha256").update(candidate.id).digest().readUInt32BE(0) /
        0x100000000) *
      100;
    if (sample >= p.samplePercent) return skipped("SAMPLED_OUT");
    if (!privacyEligible(candidate)) return skipped("PRIVACY_EXCLUDED");
    if (!this.provider) return skipped("PROVIDER_UNAVAILABLE");
    if (this.attempts >= p.maxDecisions) return skipped("BUDGET_EXHAUSTED");
    if (this.inFlight >= p.concurrency || this.seen.has(candidate.id))
      return skipped("BUSY");
    this.attempts++;
    this.inFlight++;
    this.seen.add(candidate.id);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new DecisionFailure("TIMEOUT"));
        }, p.timeoutMs);
      });
      const pending = Promise.resolve().then(() =>
        this.provider!.evaluate(
          knowledgeRequest(candidate.statement),
          controller.signal,
        ),
      );
      // Keep the slot occupied until an uncooperative provider settles, even after timeout.
      void pending
        .finally(() => {
          this.inFlight--;
        })
        .catch(() => {});
      const parsed = resultSchema.safeParse(
        await Promise.race([pending, timeout]),
      );
      if (!parsed.success) return skipped("INVALID_RESPONSE");
      return {
        id: candidate.id,
        expected,
        canonical,
        result: parsed.data,
        failure: null,
      };
    } catch (error) {
      return skipped(safeFailure(error));
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
