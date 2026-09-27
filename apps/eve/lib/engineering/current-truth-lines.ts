import type { EngineeringWorkerProjection } from "./worker-projection.ts";

/** The same read-only facts are rendered in Work and selected-Work model context. */
export function currentTruthLines(projection: EngineeringWorkerProjection): string[] {
  const truth=projection.runTruth;
  return [
    truth.activeRun?`Active Run: ${truth.activeRun.id}; ${truth.activeRun.purpose}; ${truth.activeRun.effectiveStatus}. Fresh checks are required at every action boundary.`:"Active Run: none currently confirmed executable. This does not mean Work has no Run history.",
    truth.latestRun?`Latest Run: ${truth.latestRun.id}; ${truth.latestRun.purpose}; ${truth.latestRun.effectiveStatus}; recorded ${truth.latestRun.storedStatus}; deadline ${truth.latestRun.deadline??"unavailable"}.`
      :truth.runHistory.length?"Latest Run: ordering unavailable; inspect retained Run history.":"Latest Run: none recorded.",
    `Run history: ${truth.runHistory.length?truth.runHistory.map(run=>`${run.id} (${run.purpose}; ${run.effectiveStatus}; recorded ${run.storedStatus}; ${run.timestampSource} ${run.associatedAt??"unknown"})`).join("; "):"none recorded"}.`,
    `Writer session: ${truth.writerSession.recordedId??"none recorded"}; ${truth.writerSession.productive?"current custody observed; recheck before effects":"not confirmed productive; historical identity grants no authority"}.`,
    `Candidate: ${projection.verification.candidateSha??projection.latestResult?.candidate??"none retained"}.`,
    projection.draft?`Draft: revision ${projection.draft.revision}; hash ${projection.draft.contentHash}; ${projection.draft.differsFromCandidate?"unverified changes beyond the frozen candidate":"matches retained candidate"}.`:"Draft: no native draft retained.",
    `Candidate history: ${projection.candidateHistory.map(candidate=>`${candidate.sha}: ${candidate.checks}, ${candidate.evidenceCount} evidence records${candidate.failures.length?", failed checks "+candidate.failures.join(","):""}`).join("; ")||"none retained"}.`,
    `Completion state: ${projection.completionStatus}.`,
    `Protected verification: ${projection.verification.status}; candidate ${projection.verification.candidateSha??"none"}; job ${projection.verification.jobStatus??"none"}; ${projection.verification.evidenceCount} bound evidence records.`,
    projection.latestResult?`Result: ${projection.latestResult.id}; candidate ${projection.latestResult.candidate}; ${projection.latestResult.summary}`:"Result: none retained.",
    projection.conversationRuntime?`Budget: $${projection.conversationRuntime.spentUsd.toFixed(6)} spent; $${projection.conversationRuntime.reservedUsd.toFixed(6)} reserved; ${projection.conversationRuntime.status}; unknown usage ${projection.conversationRuntime.usageUnknown}.`:"Budget: no common ledger grant observed.",
    `Completion budget: $${projection.completionBudget.ceilingUsd.toFixed(6)} ceiling; ${projection.completionBudget.heldUsd===null?"held capacity unavailable":`$${projection.completionBudget.heldUsd.toFixed(6)} held`}; ${projection.completionBudget.remainingUsd===null?"available allowance not established":`$${projection.completionBudget.remainingUsd.toFixed(6)} uncommitted`}. This observation is not spend authority.`,
    `Readiness: ${projection.readiness.ready?"Ready for Review":projection.readiness.reasons.join("; ")}`,
    `Blocker / next permitted action: ${projection.nextStep}`,
  ];
}
