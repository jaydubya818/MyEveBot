import type { Work } from "./types.ts";

export interface RunObservation {
  id: string;
  purpose: string;
  storedStatus: string;
  effectiveStatus: string;
  reasons: string[];
  generationCurrent: boolean;
  associatedAt: string | null;
  timestampSource: "admission" | "execution-start" | "unavailable";
  deadline: string | null;
}
export interface ObservedRunInput {
  id: string; purpose: string; status: string; generation: number | null;
  version: number | null; associatedAt: string | null;
  timestampSource: RunObservation["timestampSource"]; deadline: string | null;
}
/** Observation only. A successful check is a point-in-time fact, never a grant. */
export function projectRuns(work: Work, inputs: ObservedRunInput[], authority: {
  runId: string | null; writerRunId: string | null; writerSessionId: string | null;
  reason: string;
}, now = Date.now()) {
  const history: RunObservation[] = inputs.map(run => {
    const current = run.generation === work.generation && (run.version === null || run.version === work.version);
    const reasons: string[] = [];
    const status = run.status.toUpperCase();
    if (!["RUNNING", "QUEUED"].includes(status)) reasons.push("Recorded non-executing Run");
    if (!current) reasons.push("Work version or generation changed");
    if (work.lifecycle !== "active" || work.control !== "agent") reasons.push("Work is not under active Agent control");
    const expired = run.deadline !== null && Number.isFinite(Date.parse(run.deadline)) && Date.parse(run.deadline) <= now;
    if (!run.deadline || !Number.isFinite(Date.parse(run.deadline))) reasons.push("Deadline unavailable");
    else if (expired) reasons.push("Original deadline expired");
    if (authority.runId !== run.id) reasons.push(authority.reason);
    if (authority.writerRunId !== run.id || !authority.writerSessionId) reasons.push("No confirmed productive writer custody");
    return { id: run.id, purpose: run.purpose, storedStatus: run.status,
      effectiveStatus: !["RUNNING", "QUEUED"].includes(status) ? status
        : expired ? "EXPIRED" : !current ? "STALE" : reasons.length ? "NOT_EXECUTABLE" : "ACTIVE",
      reasons, generationCurrent: current, associatedAt: run.associatedAt,
      timestampSource: run.timestampSource, deadline: run.deadline };
  }).sort((a,b) => (Date.parse(b.associatedAt ?? "") || 0) - (Date.parse(a.associatedAt ?? "") || 0) || a.id.localeCompare(b.id));
  const executable = history.filter(run => run.effectiveStatus === "ACTIVE");
  // Ambiguous custody is never advertised as one usable writer.
  if (executable.length > 1) for (const run of executable) {
    run.effectiveStatus = "NOT_EXECUTABLE"; run.reasons.push("Ambiguous active Run custody");
  }
  const latestOrderCertain = history.every(run => run.associatedAt !== null && Number.isFinite(Date.parse(run.associatedAt)));
  return { activeRun: executable.length === 1 ? executable[0] : null,
    latestRun: latestOrderCertain ? history[0] ?? null : null,
    runHistory: history, latestOrderCertain,
    writerSession: { recordedId: authority.writerSessionId, runId: authority.writerRunId,
      productive: executable.length === 1, boundaryRecheckRequired: true as const } };
}
