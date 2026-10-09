import type { EngineeringWorkerProjection } from '../engineering/worker-projection.ts';

export type OwnerWorkStatus = 'Queued' | 'Working' | 'Verifying' | 'Needs You' | 'Completed' | 'Verified candidate' | 'Couldn’t complete' | 'Stopped' | 'Outcome unconfirmed';
export interface OwnerWorkPresentation {
  status: OwnerWorkStatus;
  tone: 'neutral' | 'active' | 'attention' | 'success' | 'warning';
  summary: string;
  verified: boolean;
  checksPassed: number;
  checksTotal: number;
  currentResult: boolean;
}
/** Read-only presentation of already-bound evidence. A stale Result, a partial
 * outcome, or an admitted request is never promoted to successful execution. */
export function ownerWorkPresentation(work: EngineeringWorkerProjection): OwnerWorkPresentation {
  const result = work.nativeResult;
  const accepted = work.lifecycle==='accepted' && work.externalAlpha?.acceptance?.resultId===result?.id && work.externalAlpha?.acceptance?.completedVersion===work.workVersion && work.externalAlpha?.acceptance?.completedGeneration===work.workGeneration;
  const currentResult = result?.current === true && result.proof.workId === work.workId && (result.proof.workVersion === work.workVersion || accepted) && result.proof.criteriaVersion === work.criteriaVersion;
  const evidence = currentResult ? result.proof.evidence.filter(e => e.resultRevision === result.proof.resultRevision) : [];
  const criteria = currentResult ? work.criteria?.map(c => c.id) ?? [...new Set(evidence.map(e => e.criterionId))] : [];
  const checksPassed = criteria.filter(id => { const checks = evidence.filter(e => e.criterionId === id); return checks.length > 0 && checks.every(e => e.state === 'PASS'); }).length;
  const checksTotal = criteria.length;
  const verified = currentResult && work.verification.candidateSha === result.proof.resultRevision && work.verification.status === 'PASS' && checksTotal > 0 && checksPassed === checksTotal;
  const base = { verified, checksPassed, checksTotal, currentResult };
  const state = (status: OwnerWorkStatus, tone: OwnerWorkPresentation['tone'], summary: string) => ({ ...base, status, tone, summary });
  if (work.externalAlpha?.state === 'UNKNOWN' || work.conversationRuntime?.usageUnknown || work.nativeRuntime?.usageUnknown || work.status === 'Needs reconciliation')
    return state('Outcome unconfirmed', 'warning', 'The outcome could not be confirmed. Review the retained details before any further action.');
  if (work.lifecycle === 'cancelled' || work.lifecycle === 'superseded' || work.control === 'stopping' || work.externalAlpha?.factoryOutcome === 'CANCELLED')
    return state('Stopped', 'neutral', work.lifecycle === 'superseded' ? 'This Work was replaced. Its history is preserved.' : 'This Work has stopped or is stopping. Its history is preserved.');
  if (work.lifecycle === 'failed' || work.externalAlpha?.factoryOutcome === 'FAILED' || work.nativeResult?.current && work.nativeResult.proof.outcome === 'FAILED')
    return state('Couldn’t complete', 'warning', 'Sofie could not complete this Work. The result and available evidence are preserved.');
  if (accepted) return state('Completed', 'success', 'You accepted this verified private Result. Nothing was published.');
  if (work.attention || work.pendingDecisions.length)
    return state('Needs You', 'attention', 'Sofie needs your judgment before this Work can move forward.');
  if (work.lifecycle === 'accepted') return work.externalAlpha
    ? state('Outcome unconfirmed', 'warning', 'The saved completion does not match a current private acceptance. Review the retained evidence.')
    : state('Completed', 'success', 'You accepted this outcome. Publication is recorded separately.');
  if (verified) return state('Verified candidate', 'success', work.externalAlpha?.result?.current ? 'The change was verified and remains private. Nothing was published.' : 'The candidate passed its recorded checks. Review the result and any remaining limitations.');
  if (currentResult) return state('Needs You', 'attention', 'A result is available, with checks or limitations that need review.');
  if (work.control === 'paused') return state('Stopped', 'neutral', 'This Work is paused. Ask Sofie when you are ready to continue.');
  if (work.externalAlpha?.factoryOutcome === 'NOT_DISPATCHED') return state('Couldn’t complete', 'warning', 'The request did not start. Review the retained explanation with Sofie.');
  if (work.nativeDevelopment?.current && work.nativeDevelopment.phase === 'VERIFICATION_REQUESTED' || work.nativeExecution?.phase === 'VERIFYING')
    return state('Verifying', 'active', 'The candidate is being checked against the acceptance criteria.');
  if (work.runTruth.activeRun || work.conversationRuntime?.inflight || work.nativeRuntime?.inflight)
    return state('Working', 'active', 'Sofie is working toward the requested outcome.');
  if (work.externalAlpha && !work.externalAlpha.result && !work.externalAlpha.factoryOutcome)
    return state('Queued', 'neutral', 'The request is recorded. A current progress update has not arrived yet.');
  return state('Queued', 'neutral', 'Sofie has recorded the objective. Execution has not been confirmed.');
}
