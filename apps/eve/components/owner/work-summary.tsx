"use client";
import Link from 'next/link';
import type { EngineeringWorkerProjection } from '@/lib/engineering/worker-projection';
import { ownerWorkPresentation } from '@/lib/product/owner-work';
import { CurrentWorkTruth } from '../engineering/current-work-truth';
import { journeyCostText } from '@/lib/digital-worker/model-accounting';

export function WorkSummary({work, compact=false}: {work: EngineeringWorkerProjection; compact?: boolean}) {
  const view = ownerWorkPresentation(work);
  const proof = work.nativeResult?.proof;
  return <article className="owner-work-summary" data-work-id={work.workId} data-result-id={work.nativeResult?.id}>
    <header className="owner-row"><div><p className="owner-muted">{work.factoryWriter || work.externalAlpha ? 'Software Engineer' : 'Sofie'}</p><h2>{work.title}</h2></div><span className="owner-status" data-tone={view.tone}>{view.status}</span></header>
    {!compact && <p>{work.objective}</p>}
    <p>{view.summary}</p>
    {view.status === 'Outcome unconfirmed' && <div className="owner-notice" role="status"><h3>I couldn’t confirm the outcome</h3><p>The operation may have reached the provider. An unconfirmed outcome does not permit an automatic retry.</p></div>}
    {view.checksTotal > 0 && <section aria-label="Verification"><h3>Verification</h3><p>{view.checksPassed} of {view.checksTotal} recorded checks passed{view.verified ? '.' : ' — verification is incomplete.'}</p>{work.criteria && <ul>{work.criteria.map(criterion => { const evidence = proof?.evidence.filter(e => e.criterionId === criterion.id && e.resultRevision === proof.resultRevision) ?? []; return <li key={criterion.id}>{evidence.length && evidence.every(e => e.state === 'PASS') ? '✓' : '○'} {criterion.statement}</li>; })}</ul>}</section>}
    {proof && <section aria-label="Result"><h3>{view.currentResult ? 'Result' : 'Earlier result'}</h3><p>{work.externalAlpha?.acceptance ? 'Accepted private Result' : view.verified ? 'Verified candidate ready for review' : 'Result retained for review'}</p>{proof.outcome !== 'COMPLETED' && <p className="owner-muted">{work.externalAlpha?.acceptance ? 'The original Proof was recorded before your acceptance and remains unchanged.' : proof.outcome === 'PARTIAL' ? 'Some parts of the outcome remain incomplete.' : `Outcome: ${proof.outcome.toLowerCase().replaceAll('_',' ')}`}</p>}{proof.limitations.length > 0 && <p className="owner-muted">Review {proof.limitations.length} recorded limitation{proof.limitations.length === 1 ? "" : "s"} in Proof.</p>}</section>}
    {(work.attention || work.pendingDecisions.length > 0 || work.externalAlpha?.result?.current && view.status === 'Verified candidate' && !work.externalAlpha.acceptance) && <Link className="owner-button" href={`/needs-you?workId=${encodeURIComponent(work.workId)}`}>Review decisions →</Link>}
    <details><summary>View proof</summary>
      {proof && proof.limitations.length > 0 && <section><h3>Limitations</h3><ul>{proof.limitations.map((text,index)=><li key={index}>{text}</li>)}</ul></section>}
      {work.journeyAccounting && <p>{journeyCostText(work.journeyAccounting)}</p>}
      {proof && <ul className="owner-list">{proof.evidence.map((e,index)=><li key={`${e.criterionId}:${index}`}><span>{e.state === 'PASS' ? 'Passed' : e.state === 'FAIL' ? 'Did not pass' : 'Not confirmed'}</span><p className="owner-muted">{e.sourceRef}</p></li>)}</ul>}
      {proof && <div className="owner-actions">{[...new Set(proof.artifactRefs)].filter(ref=>ref.startsWith('factory-evidence:sha256:')).map((ref,index)=><a key={ref} href={`/api/beta/evidence?workId=${encodeURIComponent(work.workId)}&resultId=${encodeURIComponent(work.nativeResult!.id)}&reference=${encodeURIComponent(ref)}`}>Evidence {index+1}</a>)}</div>}
      <details><summary>Technical details</summary>{work.latestResult && <p>{work.latestResult.summary}</p>}<CurrentWorkTruth projection={work}/></details>
    </details>
    {compact && <Link href={`/work?kind=work&id=${encodeURIComponent(work.workId)}`}>View Work →</Link>}
  </article>;
}
