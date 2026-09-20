import { OUTCOMES, type Evidence, type Outcome } from "./contract.ts";

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
  rows: readonly Evidence[],
  threshold: number,
) {
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
  };
}

export function calculateMetrics(rows: readonly Evidence[]) {
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
    OUTCOMES.map((expected) => [
      expected,
      Object.fromEntries(OUTCOMES.map((predicted) => [predicted, 0])),
    ]),
  ) as Record<Outcome, Record<Outcome, number>>;
  for (const row of labeled) matrix[row.expected!][row.result!.outcome]++;
  const perClass = OUTCOMES.map((outcome) => {
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
