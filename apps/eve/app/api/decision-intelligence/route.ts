import {
  experimentAnalysis,
  matchedSixSeven,
} from "@/lib/decision-intelligence/experiment-metrics";
import {
  challengeQuality,
  frozenChallengeRows,
  experimentDefinition,
} from "@/lib/decision-intelligence/experiment";
import type { MetricEvidence } from "@/lib/decision-intelligence/metrics";
import { apiError } from "@/lib/api-errors";
import { requireWebAuth } from "@/lib/web-auth";
import { dataset } from "@/lib/decision-intelligence/dataset";
import { readEvaluationRuns } from "@/lib/decision-intelligence/evidence-store";
import { calculateMetrics } from "@/lib/decision-intelligence/metrics";
import type { DecisionView } from "@/lib/decision-intelligence/view";
import {
  jevConfigured,
  jevMetadata,
} from "@/lib/decision-intelligence/jev-provider";

export async function GET(request: Request): Promise<Response> {
  const denied = requireWebAuth(request);
  if (denied) return denied;
  const url = new URL(request.url);
  // Artifacts are deployment-scoped synthetic benchmarks. Owner/subject selectors are never accepted.
  if (
    [...url.searchParams.keys()].some(
      (key) =>
        ![
          "run",
          "filter",
          "class",
          "confidence",
          "page",
          "decision",
          "difficulty",
          "boundary",
          "groundTruth",
        ].includes(key),
    )
  )
    return apiError(
      request,
      400,
      "invalid_filter",
      "Unknown evaluation filter.",
    );
  try {
    const runs = await readEvaluationRuns(
      process.env.MYEVE_DECISION_EVIDENCE_DIR,
    );
    const runId = url.searchParams.get("run");
    const run = runId ? runs.find((item) => item.id === runId) : runs[0];
    if (runId && !run)
      return apiError(
        request,
        404,
        "evaluation_not_found",
        "Evaluation not found.",
      );
    const def =
      run && "experiment" in run ? experimentDefinition(run.experiment) : null;
    const analysis =
      run && "experiment" in run ? experimentAnalysis(run) : undefined;
    let rows: MetricEvidence[] = run?.rows ?? [];
    const difficulty = url.searchParams.get("difficulty"),
      boundary = url.searchParams.get("boundary");
    if (difficulty)
      rows = rows.filter(
        (r) =>
          frozenChallengeRows.find((c) => c.id === r.id)?.difficulty ===
          difficulty,
      );
    if (boundary)
      rows = rows.filter((r) =>
        frozenChallengeRows
          .find((c) => c.id === r.id)
          ?.boundaries.includes(boundary),
      );
    if (url.searchParams.get("groundTruth"))
      rows = rows.filter(
        (r) =>
          frozenChallengeRows.find((c) => c.id === r.id)?.state ===
          url.searchParams.get("groundTruth"),
      );
    const filter = url.searchParams.get("filter");
    if (filter === "correct")
      rows = rows.filter(
        (r) => r.expected !== null && r.result?.outcome === r.expected,
      );
    if (filter === "incorrect")
      rows = rows.filter(
        (r) =>
          r.expected !== null && r.result && r.result.outcome !== r.expected,
      );
    if (filter === "review-disagreement")
      rows = rows.filter((r) => {
        const c = frozenChallengeRows.find((c) => c.id === r.id);
        return c && c.label !== c.review?.label;
      });
    if (filter === "disagreement")
      rows = rows.filter(
        (row) =>
          row.result &&
          ((row.canonical !== null && row.canonical !== row.result.outcome) ||
            (row.expected !== null && row.expected !== row.result.outcome)),
      );
    if (filter === "high-confidence-errors")
      rows = rows.filter(
        (row) =>
          row.result &&
          row.expected !== null &&
          row.expected !== row.result.outcome &&
          (row.result.confidence ?? -1) >= 0.95,
      );
    if (url.searchParams.get("class"))
      rows = rows.filter(
        (row) => row.expected === url.searchParams.get("class"),
      );
    if (url.searchParams.get("confidence"))
      rows = rows.filter(
        (row) =>
          (row.result?.confidence ?? -1) >=
          Number(url.searchParams.get("confidence")),
      );
    const page = Math.max(
      0,
      Math.min(50, Number(url.searchParams.get("page")) || 0),
    );
    const detailRow = run?.rows.find(
      (row) => row.id === url.searchParams.get("decision"),
    );
    const lastLive = runs.find(
      (item) => item.environment === "live-experiment",
    );
    const configured = jevConfigured();
    const six =
      run && "experiment" in run && run.cohort !== "TAXONOMY_STRESS"
        ? runs.find(
            (r) =>
              "experiment" in r &&
              r.cohort === run.cohort &&
              r.environment === run.environment &&
              r.experiment.endsWith("_SIX"),
          )
        : undefined;
    const seven =
      run && "experiment" in run && run.cohort !== "TAXONOMY_STRESS"
        ? runs.find(
            (r) =>
              "experiment" in r &&
              r.cohort === run.cohort &&
              r.environment === run.environment &&
              r.experiment.endsWith("_SEVEN"),
          )
        : undefined;
    const body: DecisionView = {
      matchedComparison:
        six && seven && "experiment" in six && "experiment" in seven
          ? matchedSixSeven(six, seven)
          : undefined,
      provider: {
        ...jevMetadata,
        status: !configured
          ? "Not configured"
          : lastLive?.rows.some((row) => row.failure)
            ? "Degraded"
            : lastLive?.rows.some((row) => row.result)
              ? "Available"
              : "Unavailable",
      },
      runs: runs.map((item) => ({
        id: item.id,
        createdAt: item.createdAt,
        environment: item.environment,
        count: item.rows.length,
        experiment: "experiment" in item ? item.experiment : "V0_ORIGINAL",
      })),
      run: run
        ? {
            id: run.id,
            createdAt: run.createdAt,
            environment: run.environment,
            datasetVersion: run.datasetVersion,
            datasetHash: run.datasetHash,
            contractHash: run.contractHash,
            canonicalSource: run.canonicalSource,
            experiment: "experiment" in run ? run.experiment : undefined,
            cohort: "cohort" in run ? run.cohort : undefined,
            decisionVersion: run.decisionVersion,
            rubricHash: "rubricHash" in run ? run.rubricHash : undefined,
          }
        : null,
      metrics:
        run && analysis?.kind !== "stress"
          ? calculateMetrics(run.rows, def?.outcomes)
          : null,
      outcomes: def?.outcomes,
      analysis,
      quality: def ? challengeQuality : undefined,
      comparisons: runs.map((item) => {
        const a = "experiment" in item ? experimentAnalysis(item) : undefined;
        const m =
          a?.kind === "stress"
            ? null
            : a?.kind === "primary"
              ? a.metrics
              : calculateMetrics(item.rows);
        return {
          id: item.id,
          experiment: "experiment" in item ? item.experiment : "V0_ORIGINAL",
          environment: item.environment,
          count: item.rows.length,
          accuracy: m?.accuracy ?? null,
          macroF1: m?.macroF1 ?? null,
          adversarialAccuracy:
            a?.kind === "primary"
              ? (a.difficulty.ADVERSARIAL?.accuracy ?? null)
              : null,
          stressHighConfidence:
            a?.kind === "stress"
              ? (a.stress.highConfidenceRates.find((r) => r.threshold === 0.95)
                  ?.rate ?? null)
              : null,
          insightF1:
            m?.perClass.find((r) => r.outcome === "insight")?.f1 ?? null,
          medianConfidence:
            a?.kind === "stress"
              ? a.stress.medianConfidence
              : (m?.medianConfidence ?? null),
        };
      }),
      rows: rows.slice(page * 20, (page + 1) * 20),
      total: rows.length,
      simulation: (run?.rows ?? [])
        .filter((row) => row.expected !== null)
        .map((row) => ({
          confidence: row.result?.confidence ?? null,
          correct: row.result ? row.result.outcome === row.expected : null,
        })),
      detail: detailRow
        ? {
            evidence: detailRow,
            text:
              dataset.find((row) => row.id === detailRow.id)?.text ??
              frozenChallengeRows.find((row) => row.id === detailRow.id)!
                .candidate,
            context: frozenChallengeRows.find((row) => row.id === detailRow.id)
              ?.context,
            metadata: frozenChallengeRows.find(
              (row) => row.id === detailRow.id,
            ),
          }
        : null,
    };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return apiError(
      request,
      503,
      "decision_evidence_unavailable",
      "Decision Intelligence data could not be loaded. Your Agent's normal behavior is unaffected.",
    );
  }
}
