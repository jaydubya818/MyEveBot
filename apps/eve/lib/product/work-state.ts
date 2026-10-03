import type { EngineeringWorkerProjection } from '../engineering/worker-projection.ts';
import type { OwnerPublication } from '../engineering/owner-publication.ts';

export type WorkLane = 'Needs You' | 'Working' | 'Monitoring' | 'Completed' | 'Waiting';
type Publication = Awaited<ReturnType<OwnerPublication['view']>>;
/** Presentation only. Settlement never changes Work lifecycle or archives chat.
 * A retained Result or online environment alone is not completion evidence. */
export function workState(work: EngineeringWorkerProjection, publication: Publication | null = null): {lane: WorkLane; detail: string} {
  if (work.lifecycle === 'accepted') return {lane:'Completed',detail:'Accepted'};
  if (work.lifecycle === 'cancelled' || work.lifecycle === 'superseded') return {lane:'Completed',detail:work.lifecycle === 'cancelled' ? 'Cancelled' : 'Superseded'};
  if (work.lifecycle === 'failed') return {lane:'Needs You',detail:'Work failed; review the retained evidence.'};
  const bound = publication && publication.binding.workId === work.workId && publication.binding.version === work.workVersion && publication.binding.generation === work.workGeneration && publication.binding.resultId === work.nativeResult?.id && work.nativeResult.current;
  if (bound && (publication.readback?.ci.status === 'FAIL' || publication.readback?.review.status === 'FAIL')) return {lane:'Needs You',detail:'Published checks or independent review need attention.'};
  if (work.attention || work.pendingDecisions.length) return {lane:'Needs You',detail:'A current decision needs your attention.'};
  if (work.runTruth.activeRun || work.conversationRuntime?.inflight || work.nativeRuntime?.inflight) return {lane:'Working',detail:'Current Work is in progress.'};
  if (bound) {
    if (!publication.decision) return {lane:'Needs You',detail:'Choose what happens to the verified candidate.'};
    if (publication.decision.action === 'reject') return {lane:'Needs You',detail:'Candidate rejected. Continue with the changes you want.'};
    if (publication.decision.action === 'keep_private') return {lane:'Completed',detail:'Verified Result kept private. Conversation remains open.'};
    const state = publication.publication?.state;
    if (state === 'BRANCH_PUBLISHED') return {lane:'Completed',detail:'Verified branch published. Conversation remains open.'};
    if (state === 'PR_OPEN') {
      if (publication.readback?.ci.status === 'PASS' && publication.readback.review.status === 'PASS') return {lane:'Completed',detail:'Pull request checks and independent review passed. Acceptance and merge remain separate.'};
      return {lane:'Monitoring',detail:'Pull request open; awaiting recorded checks and review.'};
    }
    if (state === 'FAILED' || state === 'DENIED' || state === 'UNKNOWN') return {lane:'Needs You',detail:'Publication needs reconciliation before another decision.'};
    return {lane:'Waiting',detail:'Publication decision retained; awaiting canonical readback.'};
  }
  return {lane:'Waiting',detail:work.nextStep};
}
