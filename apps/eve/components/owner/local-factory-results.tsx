import Link from 'next/link';
import type { LocalFactoryResultView } from '@/lib/engineering/local-factory-results';
import { Card, date } from './primitives';

/** Signed producer receipts remain distinct from native Proof and independent verification. */
export function LocalFactoryResults({results,selectedId}:{results:LocalFactoryResultView[];selectedId?:string}) {
  return <>{results.filter(r=>!selectedId||r.id===selectedId||r.workId===selectedId).map(r=><Card key={r.id} title={r.title}>
    <p>Signed local Factory Result · {r.status.toLowerCase().replaceAll('_',' ')}</p>
    <p>Factory checks: {r.checksPassed}/{r.checksTotal} passed. Independent verification is not established by this Factory receipt.</p>
    <p>{r.historical?'Retained history for the original Work revision.':'Matches the current Work revision.'} {date(r.receivedAt)}</p>
    {r.candidateCommit&&<p>Candidate: <code>{r.candidateCommit}</code></p>}
    <details><summary>Execution evidence</summary><dl><dt>Factory run</dt><dd>{r.runId}</dd><dt>WorkOrder</dt><dd>{r.workOrderId}</dd><dt>Signed manifest</dt><dd>{r.manifestDigest}</dd></dl></details>
    <Link href={`/work/${encodeURIComponent(r.workId)}`}>Open Work and history</Link>
  </Card>)}</>;
}
