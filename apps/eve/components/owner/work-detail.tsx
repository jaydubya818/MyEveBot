"use client";
import Link from 'next/link';
import type { EngineeringWorkerProjection } from '@/lib/engineering/worker-projection';
import { ProductShell, ResourceState } from './product-shell';
import { useProductResource } from './resource';
import { WorkSummary } from './work-summary';
import { CodingSessions } from '../engineering/coding-sessions';
import type { FactoryCodingSessionAdapter } from '@/lib/engineering/coding-sessions';
import { WorkControls } from './work-controls';

/** Observes saved progress. Refresh and reconnect never dispatch execution. */
export function WorkDetail({workId}: {workId:string}) {
  const source = useProductResource<{canonical?:{projection:EngineeringWorkerProjection;codingSessions?:Awaited<ReturnType<FactoryCodingSessionAdapter["observe"]>>}}>(`/api/beta/work?workId=${encodeURIComponent(workId)}`,10000);
  return <ProductShell title="Work" description="The outcome, progress and evidence in one place.">
    <p><Link href="/work">← All Work</Link></p>
    <ResourceState {...source}/>
    {source.data?.canonical && <><WorkSummary work={source.data.canonical.projection}/><CodingSessions view={source.data.canonical.codingSessions}/><WorkControls key={`${workId}:${source.data.canonical.projection.workVersion}:${source.data.canonical.projection.workGeneration}`} work={source.data.canonical.projection} onRefresh={source.refresh}/></>}
    {!source.loading && !source.error && source.data && !source.data.canonical && <p role="alert">This Work’s details are unavailable. <button onClick={source.refresh}>Refresh details</button></p>}
  </ProductShell>;
}
