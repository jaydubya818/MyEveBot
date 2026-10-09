"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { WorkInboxView } from "@/lib/product/work-inbox";
import type { WorkLane } from "@/lib/product/work-state";
import { Empty } from "./primitives";
const lanes: WorkLane[] = ["Needs You", "Working", "Monitoring", "Completed", "Waiting"];

export function WorkInbox({ overview = false }: { overview?: boolean }) {
  const [data, setData] = useState<WorkInboxView | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [offset, setOffset] = useState(0);
  const [lane, setLane] = useState<WorkLane>("Working");
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("state");
    if (lanes.includes(requested as WorkLane)) setLane(requested as WorkLane);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    async function load() {
      if (busy) return;
      busy = true;
      try {
        const response = await fetch(`/api/work-inbox?offset=${offset}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
        if (!response.ok) throw Error();
        const next: WorkInboxView = await response.json();
        if (!controller.signal.aborted) { setData(next); setError(false); }
      } catch { if (!controller.signal.aborted) { setData(null); setError(true); } }
      finally { busy = false; }
    }
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    void load();
    const timer = setInterval(refresh, 10000);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("online", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [offset, revision]);
  const workList = (items: WorkInboxView["works"]) => <ul className="owner-list">{items.map(work => <li key={work.id} data-work-id={work.id} data-work-state={work.lane}>
    <div className="owner-row"><h3><Link href={`/work?kind=work&id=${encodeURIComponent(work.id)}`}>{work.title}</Link></h3><span className="owner-muted">{work.lane === "Waiting" ? "Queued" : work.lane}</span></div>
    {work.agentName && <p className="owner-muted">{work.agentName}</p>}
    <p>{work.detail}</p>{work.result && <p>{work.result}</p>}
  </li>)}</ul>;
  const sections = [
    { title: "In progress", works: data?.works.filter(w => ["Working", "Monitoring", "Waiting"].includes(w.lane)) ?? [] },
    { title: "Recently completed", works: data?.works.filter(w => w.lane === "Completed") ?? [] },
  ];
  return <section id="work-inbox" aria-label="Work" data-work-inbox>
    {error ? <div role="alert"><p>Work could not be refreshed.</p><button onClick={() => setRevision(v => v + 1)}>Try again</button></div> : !data ? <p role="status">Loading your Work…</p> : <>
      {overview ? sections.map(section => section.works.length > 0 && <section className="owner-today-section" key={section.title}><div className="owner-row"><h2>{section.title}</h2><Link href="/work">View all Work →</Link></div>{workList(section.works.slice(0, 3))}</section>) : <>
        <div className="owner-actions" role="group" aria-label="Filter Work by state">{lanes.map(value => <button key={value} type="button" aria-pressed={lane === value} onClick={() => setLane(value)}>{value} ({data.counts[value]})</button>)}</div>
        {workList(data.works.filter(w => w.lane === lane))}
        {!data.counts[lane] && <Empty title="No Work here yet">Ask Sofie to get something done. You can follow its progress here. <Link href="/chat">Ask Sofie →</Link></Empty>}
      </>}
      {!overview && <nav className="owner-actions" aria-label="Work pages">{offset > 0 && <button onClick={() => { setData(null); setOffset(Math.max(0, offset - 20)); }}>Newer Work</button>}{data.nextOffset !== null && <button onClick={() => { setData(null); setOffset(data.nextOffset!); }}>Older Work</button>}</nav>}
    </>}
  </section>;
}
