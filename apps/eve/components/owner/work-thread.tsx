"use client";
import { useEffect, useState } from 'react';
import type { WorkThreadView } from '@/lib/product/work-thread';
import { useDestinationAllowed } from "./destination-gate";
import { WorkSummary } from './work-summary';
import { OwnerCandidateDecision } from './candidate-decision';
import './work-thread.css';

/** One observation per Work. Polling only refreshes canonical state; it never
 * starts, resumes or approves execution. Unmount does not stop durable Work. */
export function WorkThread({ threadId }: { threadId: string }) {
  const destinationAllowed = useDestinationAllowed();
  const [data, setData] = useState<WorkThreadView | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | undefined;
    async function load() {
      controller?.abort();
      const current = new AbortController(); controller = current;
      try {
        const response = await fetch(`/api/work-thread?threadId=${encodeURIComponent(threadId)}&offset=${offset}`, { cache: 'no-store', signal: current.signal });
        if (response.status === 404) { if (!disposed) { setData({works:[],nextOffset:null}); setError(''); } return; }
        if (!response.ok) throw Error('Work progress could not be refreshed.');
        const body = await response.json() as WorkThreadView;
        if (!disposed && !current.signal.aborted) { setData(body); setError(''); }
      } catch {
        if (!disposed && !current.signal.aborted) setError('Work progress could not be refreshed. Check your connection and try again.');
      } finally { if (!disposed && !current.signal.aborted) timer = setTimeout(load, 10000); }
    }
    function refresh() { clearTimeout(timer); void load(); }
    function visible() { if (document.visibilityState === 'visible') refresh(); }
    void load(); window.addEventListener('online', refresh); document.addEventListener('visibilitychange', visible);
    return () => { disposed = true; clearTimeout(timer); controller?.abort(); window.removeEventListener('online', refresh); document.removeEventListener('visibilitychange', visible); };
  }, [threadId, offset, revision]);
  if (!data && !error) return <p className="text-xs text-kumo-subtle" role="status">Checking saved Work…</p>;
  if (!error && !data?.works.length && offset === 0) return null;
  return <section className="work-thread" aria-label="Work in this conversation" data-thread-id={threadId}>
    {error && <div role="alert"><p>{error} {data ? 'Previously loaded progress is shown below; refresh before deciding.' : ''}</p><button type="button" onClick={() => setRevision(v => v + 1)}>Retry Work progress</button></div>}
    {data?.works.map(({ projection: work }) => <div key={work.workId}>
      <WorkSummary work={work} compact />
      {destinationAllowed("/manage") && work.nativeDevelopment?.phase === 'VERIFICATION_PASSED' && work.nativeResult?.current && work.factoryWriter && !error &&
        <OwnerCandidateDecision key={`${work.workId}:${work.workVersion}:${work.workGeneration}:${work.latestResult?.id ?? work.nativeResult?.id}`} workId={work.workId} embedded />}
    </div>)}
    {(offset > 0 || data?.nextOffset !== null && data?.nextOffset !== undefined) && <nav aria-label="Work history pages">
      {offset > 0 && <button onClick={() => { setData(null); setOffset(Math.max(0, offset - 10)); }}>Newer Work</button>}
      {data?.nextOffset != null && <button onClick={() => { setData(null); setOffset(data.nextOffset!); }}>Older Work</button>}
    </nav>}
  </section>;
}
