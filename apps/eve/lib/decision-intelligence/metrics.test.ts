import { describe, expect, it } from "vitest";
import { calculateMetrics, simulateThreshold } from "./metrics.ts";
import type { Evidence, Outcome } from "./contract.ts";

function row(
  id: string,
  expected: Outcome,
  outcome: Outcome,
  confidence: number,
): Evidence {
  return {
    id,
    expected,
    canonical: expected,
    failure: null,
    result: {
      outcome,
      confidence,
      probabilities: null,
      provider: "fixture",
      model: "fixture-v1",
      latencyMs: 10,
      costUsd: null,
      inputTokens: null,
      evaluatedAt: "2026-09-20T00:00:00.000Z",
    },
  };
}
describe("evaluation arithmetic", () => {
  const rows = [
    row("a", "fact", "fact", 0.99),
    row("b", "fact", "observation", 0.95),
    row("c", "observation", "observation", 0.7),
  ];
  it("uses hand-verifiable classification denominators", () => {
    const m = calculateMetrics(rows);
    expect(m.accuracy).toBe(2 / 3);
    expect(m.agreement).toBe(2 / 3);
    expect(m.matrix.fact).toMatchObject({ fact: 1, observation: 1 });
    expect(m.perClass.find((c) => c.outcome === "fact")).toMatchObject({
      precision: 1,
      recall: 0.5,
      f1: 2 / 3,
    });
    expect(m.perClass.find((c) => c.outcome === "observation")).toMatchObject({
      precision: 0.5,
      recall: 1,
      f1: 2 / 3,
    });
    expect(m.costUsd).toBeNull();
    expect(m.highConfidenceErrors).toEqual(["b"]);
  });
  it("counts each calibration boundary once", () => {
    const m = calculateMetrics(
      [0, 0.69, 0.7, 0.8, 0.9, 0.95, 1].map((c, i) =>
        row(String(i), "fact", "fact", c),
      ),
    );
    expect(m.confidenceBands.map((b) => b.count)).toEqual([2, 1, 1, 1, 2]);
  });
  it("simulates coverage, errors and zero coverage without invented accuracy", () => {
    expect(simulateThreshold(rows, 0.95)).toMatchObject({
      selected: 2,
      errors: 1,
      accuracy: 0.5,
      coverage: 2 / 3,
      fallback: 1 / 3,
    });
    expect(simulateThreshold(rows, 1)).toMatchObject({
      coverage: 0,
      accuracy: null,
      fallback: 1,
    });
    expect(simulateThreshold(rows, 0)).toMatchObject({
      coverage: 1,
      fallback: 0,
    });
  });
  it("does not call agreement accuracy or hide failed attempts", () => {
    const m = calculateMetrics([
      { ...rows[0]!, expected: null },
      {
        id: "failed",
        expected: "fact",
        canonical: null,
        result: null,
        failure: "TIMEOUT",
      },
    ]);
    expect(m.accuracy).toBeNull();
    expect(m.agreement).toBe(1);
    expect(m.completion).toBe(0.5);
    expect(m.failures).toEqual({ TIMEOUT: 1 });
  });
  it("handles empty evidence", () => {
    expect(calculateMetrics([])).toMatchObject({
      attempted: 0,
      accuracy: null,
      agreement: null,
      latencyP50: null,
    });
  });
});
