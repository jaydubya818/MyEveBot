/** Product-only subset of EngineeringWorkerProjection at 7bbf296.
 * Canonical integration must check this interface against its final source.
 * There are intentionally no execution, verification or authority methods here. */
export interface CanonicalWorkDisplay {
  workId: string;
  workVersion: number;
  workGeneration: number;
  title: string;
  activity: string;
  nextStep: string;
  status: string;
  completionStatus: string;
  readiness: { ready: boolean; reasons: string[] };
  verification: {
    candidateSha: string | null;
    status: string;
    jobStatus: string | null;
    evidenceCount: number;
    evidenceHashes: string[];
  };
  latestResult: {
    id: string;
    version: number;
    summary: string;
    candidate: string;
    createdAt: string;
  } | null;
}
export const canonicalQ37Boundary = {
  status: "WAITING_FOR_CANONICAL_Q37",
  dispatchEnabled: false,
  label: "Software Engineer",
  message: "Engineering production is awaiting its qualified integration.",
} as const;
export function displayCanonicalWork(value: CanonicalWorkDisplay | null) {
  if (!value)
    return {
      boundary: canonicalQ37Boundary.status,
      title: canonicalQ37Boundary.label,
      activity: canonicalQ37Boundary.message,
      candidate: null,
      result: null,
      ready: false,
    };
  // A fixture may exercise presentation. It never activates dispatch or declares Ready.
  return {
    boundary: canonicalQ37Boundary.status,
    title: value.title,
    activity: value.activity,
    candidate: value.verification.candidateSha,
    result: value.latestResult,
    ready: false,
    reportedCompletion: value.completionStatus,
    reportedVerification: value.verification.status,
    nextStep: value.nextStep,
  };
}

/** Display subset of Universal Inbox AttentionView at cf19943.
 * Trusted consumer supplies this after owner filtering; messages cannot self-authorize. */
export interface CanonicalAttentionDisplay {
  id: string;
  ownerId: string;
  correlationId: string;
  episode: number;
  workId: string | null;
  workGeneration: number | null;
  workVersion: number | null;
  kind: string;
  title: string;
  summary: string;
  status: string;
  needsYou: boolean;
  source: { system: string; threadId: string | null; reference: string };
  action: {
    involvement: "NECESSARY_JUDGMENT" | "AVOIDABLE_COORDINATION";
    prompt: string;
  } | null;
}
export function displayCanonicalAttention(
  ownerId: string,
  items: readonly CanonicalAttentionDisplay[],
) {
  return items
    .filter((item) => item.ownerId === ownerId)
    .map((item) => ({
      id: item.id,
      correlationId: item.correlationId,
      episode: item.episode,
      workId: item.workId,
      title: item.title,
      summary: item.summary,
      source: item.source.system,
      sourceReference: item.source.reference,
      needsYou:
        item.needsYou &&
        item.status === "NEEDS_ACTION" &&
        item.action?.involvement === "NECESSARY_JUDGMENT",
      canExecute: false as const,
    }));
}
