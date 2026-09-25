import { describe, expect, it, vi } from "vitest";
import {
  DecisionFailure,
  OUTCOMES,
  type DecisionProvider,
} from "./contract.ts";
import { FakeDecisionProvider } from "./fixtures.ts";
import { ShadowEvaluator, type ShadowPolicy } from "./shadow.ts";

const policy: ShadowPolicy = {
  enabled: true,
  samplePercent: 100,
  timeoutMs: 20,
  maxDecisions: 20,
  concurrency: 2,
};
const candidate = {
  id: "example",
  kind: "hypothesis" as const,
  statement: "A shorter form might improve completion.",
  source: "synthetic" as const,
};

describe("isolated shadow evaluation", () => {
  it.each(OUTCOMES)(
    "accepts the canonical %s outcome without changing its input",
    async (outcome) => {
      const provider: DecisionProvider = {
        evaluate: async (request, signal) => ({
          ...(await new FakeDecisionProvider().evaluate(request, signal)),
          outcome: outcome as (typeof request.outcomes)[number],
        }),
      };
      const snapshot = JSON.stringify(candidate);
      const result = await new ShadowEvaluator(provider, policy).evaluate(
        candidate,
        "hypothesis",
        "hypothesis",
      );
      expect(result.result?.outcome).toBe(outcome);
      expect(result.canonical).toBe("hypothesis");
      expect(JSON.stringify(candidate)).toBe(snapshot);
    },
  );
  it.each([
    "TIMEOUT",
    "RATE_LIMITED",
    "GATEWAY_FAILURE",
    "PROVIDER_UNAVAILABLE",
  ] as const)("normalizes %s without provider diagnostics", async (code) => {
    const result = await new ShadowEvaluator(
      {
        evaluate: async () => {
          throw new DecisionFailure(code);
        },
      },
      policy,
    ).evaluate(candidate);
    expect(result.failure).toBe(code);
    expect(result.result).toBeNull();
  });
  it("does not leak arbitrary error messages", async () => {
    const result = await new ShadowEvaluator(
      {
        evaluate: async () => {
          throw new Error("SYNTHETIC_SECRET_MARKER");
        },
      },
      policy,
    ).evaluate(candidate);
    expect(JSON.stringify(result)).not.toContain("SYNTHETIC_SECRET");
  });
  it("times out uncooperative providers and retains concurrency backpressure", async () => {
    const provider = { evaluate: vi.fn(() => new Promise<never>(() => {})) };
    const evaluator = new ShadowEvaluator(provider, {
      ...policy,
      concurrency: 1,
    });
    expect((await evaluator.evaluate(candidate)).failure).toBe("TIMEOUT");
    expect(
      (await evaluator.evaluate({ ...candidate, id: "second" })).failure,
    ).toBe("BUSY");
    expect(provider.evaluate).toHaveBeenCalledTimes(1);
  });
  it.each([false, true])(
    "excludes Insight before enablement, sampling or provider checks (%s)",
    async (enabled) => {
      for (const samplePercent of [0, 100]) {
        for (const available of [false, true]) {
          const provider = { evaluate: vi.fn() };
          const result = await new ShadowEvaluator(
            available ? provider : null,
            { ...policy, enabled, samplePercent },
          ).evaluate({ ...candidate, kind: "insight" });
          expect(result.failure).toBe("SKIPPED_OUT_OF_SCOPE");
          expect(provider.evaluate).not.toHaveBeenCalled();
        }
      }
    },
  );
  it.each([
    [{ ...policy, enabled: false }, candidate, "DISABLED"],
    [{ ...policy, samplePercent: 0 }, candidate, "SAMPLED_OUT"],
    [{ ...policy, maxDecisions: 0 }, candidate, "BUDGET_EXHAUSTED"],
    [policy, { ...candidate, source: "owner" }, "PRIVACY_EXCLUDED"],
    [
      policy,
      { ...candidate, statement: "secret=SYNTHETIC_SECRET_MARKER" },
      "PRIVACY_EXCLUDED",
    ],
  ] as const)(
    "skips ineligible work without calls",
    async (config, input, failure) => {
      const provider = { evaluate: vi.fn() };
      expect(
        (await new ShadowEvaluator(provider, config).evaluate(input)).failure,
      ).toBe(failure);
      expect(provider.evaluate).not.toHaveBeenCalled();
    },
  );
  it("rejects unknown labels and out-of-range probabilities", async () => {
    for (const overrides of [
      { outcome: "approve" },
      { confidence: 2 },
      { probabilities: { fact: -1 } },
    ]) {
      const provider = {
        evaluate: async () => overrides,
      } as unknown as DecisionProvider;
      expect(
        (await new ShadowEvaluator(provider, policy).evaluate(candidate))
          .failure,
      ).toBe("INVALID_RESPONSE");
    }
  });
  it("deduplicates a bounded run and stops at its budget", async () => {
    const provider = new FakeDecisionProvider();
    vi.spyOn(provider, "evaluate");
    const evaluator = new ShadowEvaluator(provider, {
      ...policy,
      maxDecisions: 2,
    });
    await evaluator.evaluate(candidate);
    expect((await evaluator.evaluate(candidate)).failure).toBe("BUSY");
    await evaluator.evaluate({ ...candidate, id: "second" });
    expect(
      (await evaluator.evaluate({ ...candidate, id: "third" })).failure,
    ).toBe("BUDGET_EXHAUSTED");
    expect(provider.evaluate).toHaveBeenCalledTimes(2);
  });
});
