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
        !["run", "filter", "class", "confidence", "page", "decision"].includes(
          key,
        ),
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
    let rows = run?.rows ?? [];
    const filter = url.searchParams.get("filter");
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
    const body: DecisionView = {
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
          }
        : null,
      metrics: run ? calculateMetrics(run.rows) : null,
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
            text: dataset.find((row) => row.id === detailRow.id)!.text,
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
