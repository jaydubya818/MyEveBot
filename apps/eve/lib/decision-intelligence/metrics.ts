import { OUTCOMES, type DecisionResult, type Failure } from "./contract.ts";
import type { KnowledgeKind } from "../knowledge-types.ts";
export interface MetricEvidence {
  id: string;
  expected: KnowledgeKind | null;
  canonical: KnowledgeKind | null;
  result: DecisionResult<KnowledgeKind> | null;
  failure: Failure | null;
  cohort?: string;
}
function primaryOnly(rows: readonly MetricEvidence[]) {
  if (rows.some((r) => r.cohort === "TAXONOMY_STRESS"))
    throw new Error(
      "Taxonomy Stress has no primary accuracy or threshold simulation",
    );
}

const ratio = (numerator: number, denominator: number) =>
  denominator ? numerator / denominator : null;
const percentile = (values: number[], fraction: number) =>
  values.length
    ? [...values].sort((a, b) => a - b)[
        Math.max(0, Math.ceil(values.length * fraction) - 1)
      ]!
    : null;
const bands = [
  [0, 0.7],
  [0.7, 0.8],
  [0.8, 0.9],
  [0.9, 0.95],
  [0.95, 1.01],
] as const;

export function simulateThreshold(
  rows: readonly MetricEvidence[],
  threshold: number,
) {
  primaryOnly(rows);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)
    throw new Error("Invalid simulation threshold");
  const labeled = rows.filter((row) => row.expected !== null);
  const selected = labeled.filter(
    (row) =>
      row.result?.confidence != null && row.result.confidence >= threshold,
  );
  const errors = selected.filter(
    (row) => row.result!.outcome !== row.expected,
  ).length;
  return {
    threshold,
    selected: selected.length,
    total: labeled.length,
    errors,
    coverage: ratio(selected.length, labeled.length),
    accuracy: ratio(selected.length - errors, selected.length),
    fallback: ratio(labeled.length - selected.length, labeled.length),
    estimatedErrorsPer1000: labeled.length
      ? (errors / labeled.length) * 1000
      : null,
    hypotheticalCallsAvoided: selected.length,
  };
}

export function calculateMetrics(
  rows: readonly MetricEvidence[],
  outcomes: readonly KnowledgeKind[] = OUTCOMES,
) {
  primaryOnly(rows);
  const valid = rows.filter((row) => row.result !== null);
  const labeled = valid.filter((row) => row.expected !== null);
  const paired = valid.filter((row) => row.canonical !== null);
  const canonicalLabeled = rows.filter(
    (row) => row.canonical !== null && row.expected !== null,
  );
  const comparable = labeled.filter((row) => row.canonical !== null);
  const correct = labeled.filter(
    (row) => row.result!.outcome === row.expected,
  ).length;
  const matrix = Object.fromEntries(
    outcomes.map((expected) => [
      expected,
      Object.fromEntries(outcomes.map((predicted) => [predicted, 0])),
    ]),
  ) as Record<KnowledgeKind, Record<KnowledgeKind, number>>;
  for (const row of labeled) {
    if (
      !outcomes.includes(row.expected!) ||
      !outcomes.includes(row.result!.outcome)
    )
      throw new Error("Outcome outside metric contract");
    matrix[row.expected!][row.result!.outcome]++;
  }
  const perClass = outcomes.map((outcome) => {
    const truePositive = matrix[outcome][outcome];
    const examples = labeled.filter((row) => row.expected === outcome).length;
    const predictions = labeled.filter(
      (row) => row.result!.outcome === outcome,
    ).length;
    return {
      outcome,
      examples,
      precision: ratio(truePositive, predictions),
      recall: ratio(truePositive, examples),
      f1: ratio(2 * truePositive, examples + predictions),
    };
  });
  const confidenceBands = bands.map(([lower, upper]) => {
    const items = valid.filter(
      (row) =>
        row.result!.confidence !== null &&
        row.result!.confidence >= lower &&
        row.result!.confidence < upper,
    );
    const scored = items.filter((row) => row.expected !== null);
    return {
      lower,
      upper: Math.min(upper, 1),
      count: items.length,
      labeledCount: scored.length,
      accuracy: ratio(
        scored.filter((row) => row.result!.outcome === row.expected).length,
        scored.length,
      ),
    };
  });
  const sumReported = (key: "inputTokens" | "costUsd") =>
    valid.length && valid.every((row) => row.result![key] !== null)
      ? valid.reduce((sum, row) => sum + row.result![key]!, 0)
      : null;
  return {
    attempted: rows.length,
    succeeded: valid.length,
    failed: rows.length - valid.length,
    failures: Object.fromEntries(
      [
        ...new Set(rows.flatMap((row) => (row.failure ? [row.failure] : []))),
      ].map((failure) => [
        failure,
        rows.filter((row) => row.failure === failure).length,
      ]),
    ),
    labeledCount: labeled.length,
    correct,
    accuracy: ratio(correct, labeled.length),
    completion: ratio(valid.length, rows.length),
    endToEndAccuracy: ratio(
      correct,
      rows.filter((row) => row.expected !== null).length,
    ),
    canonicalAccuracy: ratio(
      canonicalLabeled.filter((row) => row.canonical === row.expected).length,
      canonicalLabeled.length,
    ),
    agreement: ratio(
      paired.filter((row) => row.canonical === row.result!.outcome).length,
      paired.length,
    ),
    disagreementRate: ratio(
      paired.filter((row) => row.canonical !== row.result!.outcome).length,
      paired.length,
    ),
    bothCorrect: comparable.filter(
      (row) =>
        row.canonical === row.expected && row.result!.outcome === row.expected,
    ).length,
    canonicalOnlyCorrect: comparable.filter(
      (row) =>
        row.canonical === row.expected && row.result!.outcome !== row.expected,
    ).length,
    providerOnlyCorrect: comparable.filter(
      (row) =>
        row.canonical !== row.expected && row.result!.outcome === row.expected,
    ).length,
    bothWrong: comparable.filter(
      (row) =>
        row.canonical !== row.expected && row.result!.outcome !== row.expected,
    ).length,
    highConfidenceErrors: labeled
      .filter(
        (row) =>
          (row.result!.confidence ?? -1) >= 0.95 &&
          row.result!.outcome !== row.expected,
      )
      .map((row) => row.id),
    calibrationCount: labeled.filter((row) => row.result!.confidence !== null)
      .length,
    confidenceBands,
    perClass,
    macroPrecision: perClass.length
      ? perClass.reduce((s, r) => s + (r.precision ?? 0), 0) / perClass.length
      : null,
    macroRecall: perClass.length
      ? perClass.reduce((s, r) => s + (r.recall ?? 0), 0) / perClass.length
      : null,
    macroF1: perClass.length
      ? perClass.reduce((s, r) => s + (r.f1 ?? 0), 0) / perClass.length
      : null,
    medianConfidence: percentile(
      labeled.flatMap((r) =>
        r.result!.confidence === null ? [] : [r.result!.confidence],
      ),
      0.5,
    ),
    matrix,
    latencyP50: percentile(
      valid.map((row) => row.result!.latencyMs),
      0.5,
    ),
    latencyP95: percentile(
      valid.map((row) => row.result!.latencyMs),
      0.95,
    ),
    inputTokens: sumReported("inputTokens"),
    costUsd: sumReported("costUsd"),
  };
}
export type DecisionMetrics = ReturnType<typeof calculateMetrics>;
