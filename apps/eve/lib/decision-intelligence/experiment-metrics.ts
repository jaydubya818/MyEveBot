import type { KnowledgeKind } from "../knowledge-types.ts";
import {
  calculateMetrics,
  simulateThreshold,
  type MetricEvidence,
} from "./metrics.ts";
import {
  frozenChallengeRows,
  experimentDefinition,
  type ExperimentRun,
} from "./experiment.ts";
const fraction = (n: number, d: number) => (d ? n / d : null);
const median = (values: number[]) =>
  values.length
    ? [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!
    : null;
export const THRESHOLDS = [0.7, 0.8, 0.85, 0.9, 0.95, 0.97, 0.99] as const;
export function calculateStressMetrics(rows: readonly MetricEvidence[]) {
  if (rows.some((r) => r.expected !== null || r.cohort !== "TAXONOMY_STRESS"))
    throw new Error("Stress requires unscored stress evidence");
  const valid = rows.filter((r) => r.result !== null),
    confident = valid.filter((r) => r.result!.confidence !== null);
  const annotated = valid.map((row) => ({
    row,
    truth: frozenChallengeRows.find((c) => c.id === row.id),
  }));
  const hasDispute = (item: (typeof annotated)[number]) =>
    item.truth?.label !== item.truth?.review?.label;
  return {
    attempted: rows.length,
    succeeded: valid.length,
    failed: rows.length - valid.length,
    completion: fraction(valid.length, rows.length),
    confidenceCount: confident.length,
    medianConfidence: median(confident.map((r) => r.result!.confidence!)),
    highConfidenceRates: [0.9, 0.95, 0.99].map((threshold) => ({
      threshold,
      count: confident.filter((r) => r.result!.confidence! >= threshold).length,
      rate: fraction(
        confident.filter((r) => r.result!.confidence! >= threshold).length,
        confident.length,
      ),
    })),
    choices: Object.fromEntries(
      experimentDefinition("TAXONOMY_STRESS").outcomes.map((label) => [
        label,
        valid.filter((r) => r.result!.outcome === label).length,
      ]),
    ),
    reviewerAgreement: fraction(
      annotated.filter((x) => x.truth?.label === x.truth?.review?.label).length,
      annotated.length,
    ),
    authorOnly: annotated.filter(
      (x) =>
        x.row.result!.outcome === x.truth?.label &&
        x.row.result!.outcome !== x.truth?.review?.label,
    ).length,
    reviewerOnly: annotated.filter(
      (x) =>
        x.row.result!.outcome !== x.truth?.label &&
        x.row.result!.outcome === x.truth?.review?.label,
    ).length,
    both: annotated.filter(
      (x) =>
        x.row.result!.outcome === x.truth?.label &&
        x.row.result!.outcome === x.truth?.review?.label,
    ).length,
    neither: annotated.filter(
      (x) =>
        x.row.result!.outcome !== x.truth?.label &&
        x.row.result!.outcome !== x.truth?.review?.label,
    ).length,
    disputedHighConfidence: annotated
      .filter((x) => hasDispute(x) && (x.row.result!.confidence ?? 0) >= 0.95)
      .map((x) => ({ id: x.row.id, confidence: x.row.result!.confidence })),
    latencyP50: median(valid.map((r) => r.result!.latencyMs)),
    inputTokens:
      valid.length && valid.every((r) => r.result!.inputTokens !== null)
        ? valid.reduce((s, r) => s + r.result!.inputTokens!, 0)
        : null,
    costUsd:
      valid.length && valid.every((r) => r.result!.costUsd !== null)
        ? valid.reduce((s, r) => s + r.result!.costUsd!, 0)
        : null,
  };
}
export type StressMetrics = ReturnType<typeof calculateStressMetrics>;
export function experimentAnalysis(run: ExperimentRun) {
  const def = experimentDefinition(run.experiment);
  if (def.cohort === "TAXONOMY_STRESS")
    return {
      kind: "stress" as const,
      stress: calculateStressMetrics(run.rows),
    };
  const summarize = (rows: typeof run.rows) => {
    const m = calculateMetrics(rows, def.outcomes);
    return {
      count: rows.length,
      accuracy: m.accuracy,
      errors: m.labeledCount - m.correct,
      medianConfidence: m.medianConfidence,
      highConfidenceErrors: m.highConfidenceErrors.length,
    };
  };
  const annotated = run.rows.map((row) => ({
    row,
    truth: frozenChallengeRows.find((c) => c.id === row.id),
  }));
  return {
    kind: "primary" as const,
    metrics: calculateMetrics(run.rows, def.outcomes),
    thresholds: THRESHOLDS.map((t) => simulateThreshold(run.rows, t)),
    difficulty: Object.fromEntries(
      ["EASY", "MODERATE", "HARD", "ADVERSARIAL"].map((d) => [
        d,
        summarize(
          annotated.filter((x) => x.truth?.difficulty === d).map((x) => x.row),
        ),
      ]),
    ),
    boundaries: Object.fromEntries(
      [...new Set(annotated.flatMap((x) => x.truth?.boundaries ?? []))].map(
        (b) => [
          b,
          summarize(
            annotated
              .filter((x) => x.truth?.boundaries.includes(b))
              .map((x) => x.row),
          ),
        ],
      ),
    ),
    highConfidenceErrors: [0.9, 0.95, 0.99].map((threshold) => ({
      threshold,
      ids: run.rows
        .filter(
          (r) =>
            r.result &&
            r.result.outcome !== r.expected &&
            (r.result.confidence ?? 0) >= threshold,
        )
        .map((r) => r.id),
    })),
  };
}
export type ExperimentAnalysis = ReturnType<typeof experimentAnalysis>;
export function matchedSixSeven(six: ExperimentRun, seven: ExperimentRun) {
  if (
    !six.experiment.endsWith("_SIX") ||
    !seven.experiment.endsWith("_SEVEN") ||
    six.cohort !== seven.cohort
  )
    throw new Error("Matched cohort contracts required");
  const shared = new Set(six.rows.map((r) => r.id));
  const matched = seven.rows.filter(
    (r) => shared.has(r.id) && r.expected !== "insight",
  );
  const ids = new Set(matched.map((r) => r.id));
  const first = six.rows.filter((r) => ids.has(r.id));
  return {
    count: matched.length,
    six: calculateMetrics(first, experimentDefinition(six.experiment).outcomes),
    seven: calculateMetrics(
      matched,
      experimentDefinition(seven.experiment).outcomes,
    ),
    limitation:
      "Both outcome space and seven-class rubric wording differ; this is not an isolated causal estimate of adding one outcome.",
  };
}

export type MatchedComparison = ReturnType<typeof matchedSixSeven>;
