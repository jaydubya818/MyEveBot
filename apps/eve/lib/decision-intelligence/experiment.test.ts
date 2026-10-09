import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createGateway } from "ai";
import { describe, expect, it, vi } from "vitest";
import {
  knowledgeContract,
  DecisionFailure,
  type DecisionProvider,
} from "./contract.ts";
import { evaluateDataset, evaluationArtifactSchema } from "./evaluation.ts";
import { ChallengeFixtureProvider, FakeDecisionProvider } from "./fixtures.ts";
import {
  EXPERIMENTS,
  CHALLENGE_OUTCOMES,
  challengeContract,
  challengeQuality,
  experimentDefinition,
  experimentRequest,
  experimentRunSchema,
  frozenChallengeRows,
} from "./experiment.ts";
import { calculateMetrics, simulateThreshold } from "./metrics.ts";
import {
  calculateStressMetrics,
  experimentAnalysis,
  matchedSixSeven,
} from "./experiment-metrics.ts";
import { JevDecisionProvider, jevMetadata } from "./jev-provider.ts";
import { leakageIssues, providerState } from "./challenge-cohorts.ts";
const fixture = new ChallengeFixtureProvider();
describe("frozen V0.5 cohorts and contracts", () => {
  it("binds all construction evidence and the runtime corpus to the freeze manifest", () => {
    const dir = new URL(
      "../../../../docs/experiments/jev-v05/revision-02/",
      import.meta.url,
    );
    const manifest = JSON.parse(
      readFileSync(new URL("freeze-manifest.json", dir), "utf8"),
    );
    for (const [file, hash] of Object.entries(manifest.fileSha256))
      expect(
        createHash("sha256")
          .update(readFileSync(new URL(file, dir)))
          .digest("hex"),
      ).toBe(hash);
    expect(
      createHash("sha256")
        .update(readFileSync(new URL("./challenge-data.json", import.meta.url)))
        .digest("hex"),
    ).toBe(manifest.runtimeSha256);
  });
  it("has complete accounting, a surviving adversarial cohort and viable Insight coverage", () => {
    expect(challengeQuality.allAuthored.accounted).toBe(true);
    expect(
      challengeQuality.revision.adversarialChallenge,
    ).toBeGreaterThanOrEqual(60);
    expect(
      experimentDefinition("CHALLENGE_SEVEN").rows.filter(
        (r) => r.expected === "insight",
      ).length,
    ).toBeGreaterThanOrEqual(40);
    expect(challengeQuality.allAuthored.counts.UNREVIEWED).toBe(0);
  });
  it("keeps six definitions byte equivalent and rejects unsupported cohorts or Insight IDs", () => {
    const def = experimentDefinition("CHALLENGE_SIX");
    expect(
      experimentRequest("CHALLENGE_SIX", def.rows[0]!.id).definitions,
    ).toEqual(knowledgeContract.definitions);
    const insight = experimentDefinition("CHALLENGE_SEVEN").rows.find(
      (r) => r.expected === "insight",
    )!;
    expect(() => experimentRequest("CHALLENGE_SIX", insight.id)).toThrow();
    expect(() => experimentDefinition("UNKNOWN" as never)).toThrow();
    expect(challengeContract.outcomes).toEqual([
      ...knowledgeContract.outcomes,
      "insight",
    ]);
  });
  it("serializes every provider-visible frozen row without private dataset fields", () => {
    for (const row of frozenChallengeRows) {
      expect(leakageIssues(row)).toEqual([]);
      expect(Object.keys(JSON.parse(providerState(row)))).toEqual([
        "context",
        "candidate",
      ]);
      expect(providerState(row)).not.toContain(row.id);
      expect(providerState(row)).not.toMatch(
        /family_\d|groundTruth|difficultyRationale|surfaceLure/,
      );
    }
  });
  it("never exposes contrastive family siblings in the same blind review context", () => {
    const dir = new URL(
      "../../../../docs/experiments/jev-v05/revision-02/",
      import.meta.url,
    );
    const authored = JSON.parse(
      readFileSync(new URL("authored.json", dir), "utf8"),
    ) as { id: string; familyId: string }[];
    for (const batch of [1, 2, 3]) {
      const blind = JSON.parse(
        readFileSync(new URL(`review/blind-${batch}.json`, dir), "utf8"),
      ) as { id: string }[];
      expect(
        new Set(blind.map((r) => authored.find((a) => a.id === r.id)!.familyId))
          .size,
      ).toBe(blind.length);
      expect(
        blind.every(
          (r) => Object.keys(r).sort().join(",") === "candidate,context,id",
        ),
      ).toBe(true);
    }
  });
  it.each(EXPERIMENTS)(
    "runs %s through the shared harness with normalized immutable evidence",
    async (experiment) => {
      const run = await evaluateDataset(fixture, {
        environment: "local-fixture",
        experiment,
        stopFailureRate: 1,
      });
      expect(run.rows).toHaveLength(
        experimentDefinition(experiment).rows.length,
      );
      expect(evaluationArtifactSchema.parse(run)).toEqual(run);
      expect(() =>
        experimentRunSchema.parse({ ...run, ownerId: "forbidden" }),
      ).toThrow();
      expect(() =>
        experimentRunSchema.parse({ ...run, datasetHash: "changed" }),
      ).toThrow();
      expect(() =>
        experimentRunSchema.parse({ ...run, rows: [run.rows[0], run.rows[0]] }),
      ).toThrow();
      if (experiment === "TAXONOMY_STRESS") {
        expect(run.rows.every((r) => r.expected === null)).toBe(true);
        expect(() => calculateMetrics(run.rows)).toThrow();
        expect(() => simulateThreshold(run.rows, 0.95)).toThrow();
        const m = calculateStressMetrics(run.rows);
        expect(m).not.toHaveProperty("accuracy");
        expect(
          m.highConfidenceRates.find((r) => r.threshold === 0.99)!.count,
        ).toBeGreaterThan(0);
      } else expect(experimentAnalysis(run).kind).toBe("primary");
    },
  );
  it("exercises correct, incorrect, high-confidence wrong, low-confidence, Insight and failed fixtures", async () => {
    const run = await evaluateDataset(fixture, {
      environment: "local-fixture",
      experiment: "CHALLENGE_SEVEN",
      stopFailureRate: 1,
    });
    const m = calculateMetrics(run.rows, CHALLENGE_OUTCOMES);
    expect(m.correct).toBeGreaterThan(0);
    expect(m.highConfidenceErrors.length).toBeGreaterThan(0);
    expect(m.failed).toBeGreaterThan(0);
    expect(run.rows.some((r) => r.result?.outcome === "insight")).toBe(true);
    expect(run.rows.some((r) => (r.result?.confidence ?? 1) < 0.7)).toBe(true);
    expect(experimentAnalysis(run)).toMatchObject({ kind: "primary" });
  });
  it("counts bounded failures, times out and stops on malformed responses", async () => {
    const unavailable: DecisionProvider = {
      evaluate: async () => {
        throw new DecisionFailure("RATE_LIMITED");
      },
    };
    const run = await evaluateDataset(unavailable, {
      environment: "local-fixture",
      experiment: "CHALLENGE_SEVEN",
    });
    expect(run.rows).toHaveLength(12);
    const never: DecisionProvider = {
      evaluate: async () => new Promise(() => {}),
    };
    const timeout = await evaluateDataset(never, {
      environment: "local-fixture",
      experiment: "CHALLENGE_SEVEN",
      maxExamples: 1,
      timeoutMs: 5,
    });
    expect(timeout.rows[0]!.failure).toBe("TIMEOUT");
    const invalid: DecisionProvider = {
      evaluate: async () => ({ outcome: "other" }) as never,
    };
    expect(
      (
        await evaluateDataset(invalid, {
          environment: "local-fixture",
          experiment: "CHALLENGE_SEVEN",
        })
      ).rows,
    ).toHaveLength(1);
  });
  it("stops on unexpected Jev models and malformed probability semantics", async () => {
    for (const mutation of ["model", "probabilities", "confidence"] as const) {
      const provider: DecisionProvider = {
        evaluate: async (request, signal) => {
          const result = await new FakeDecisionProvider().evaluate(
            request,
            signal,
          );
          if (mutation === "model")
            return { ...result, provider: "Jev", model: "unexpected/model" };
          if (mutation === "confidence") return { ...result, confidence: 0.01 };
          return {
            ...result,
            probabilities: { [result.outcome]: 0.4 },
          } as typeof result;
        },
      };
      const run = await evaluateDataset(provider, {
        environment: "local-fixture",
        experiment: "CHALLENGE_SEVEN",
      });
      expect(run.rows).toHaveLength(1);
      expect(run.rows[0]!.failure).toBe("INVALID_RESPONSE");
    }
  });
  it("uses independently invoked six/seven predictions on matched non-Insight cases", async () => {
    const six = await evaluateDataset(new FakeDecisionProvider(), {
      environment: "local-fixture",
      experiment: "CHALLENGE_SIX",
    });
    const seven = await evaluateDataset(new FakeDecisionProvider(), {
      environment: "local-fixture",
      experiment: "CHALLENGE_SEVEN",
    });
    expect(six.id).not.toBe(seven.id);
    expect(matchedSixSeven(six, seven).count).toBe(206);
  });
  it("supports the seven-choice SDK path with an actual mocked Gateway transport", async () => {
    const probabilities = Object.fromEntries(
      CHALLENGE_OUTCOMES.map((label) => [label, label === "insight" ? 1 : 0]),
    );
    const fetch = vi.fn(async () =>
      Response.json({
        answers: {
          classification: { type: "choice", choice: "insight", probabilities },
        },
        usage: { inputTokens: 33 },
      }),
    );
    const gateway = createGateway({ apiKey: "synthetic-fixture", fetch });
    const provider = new JevDecisionProvider({
      configured: () => true,
      model: () => gateway.evaluationModel(jevMetadata.model),
    });
    const id = experimentDefinition("CHALLENGE_SEVEN").rows[0]!.id;
    const result = await provider.evaluate(
      experimentRequest("CHALLENGE_SEVEN", id),
      new AbortController().signal,
    );
    expect(result).toMatchObject({
      outcome: "insight",
      confidence: 1,
      probabilities,
      inputTokens: 33,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
