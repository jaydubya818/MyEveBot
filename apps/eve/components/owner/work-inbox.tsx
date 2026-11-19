"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { WorkInboxView } from "@/lib/product/work-inbox";
import type { WorkLane } from "@/lib/product/work-state";
import { Empty } from "./primitives";
import { INBOX_REFRESH_TIMEOUT_MS, initialInboxRefresh, nextInboxRefresh } from "@/lib/product/work-inbox-refresh";
const lanes: WorkLane[] = ["Needs You", "Working", "Monitoring", "Completed", "Waiting", "Stopped", "Ready"];

export function WorkInbox({ overview = false }: { overview?: boolean }) {
  const [refresh, setRefresh] = useState(initialInboxRefresh<WorkInboxView>);
  const { data, error, stale } = refresh;
  const setData = (_: null) => setRefresh(initialInboxRefresh<WorkInboxView>());
  const [revision, setRevision] = useState(0);
  const [offset, setOffset] = useState(0);
  const [lane, setLane] = useState<WorkLane | "Active">("Active");
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
        const response = await fetch(`/api/work-inbox?offset=${offset}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(INBOX_REFRESH_TIMEOUT_MS)]) });
        if (!response.ok) { if (!controller.signal.aborted) setRefresh(previous => nextInboxRefresh(previous, { ok: false, status: response.status })); return; }
        const next: WorkInboxView = await response.json();
        if (!controller.signal.aborted) setRefresh(previous => nextInboxRefresh(previous, { ok: true, data: next }));
      } catch { if (!controller.signal.aborted) setRefresh(previous => nextInboxRefresh(previous, { ok: false })); }
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
    <div className="owner-row"><h3><Link href={`/work?kind=work&id=${encodeURIComponent(work.id)}`}>{work.title}</Link></h3><span className="owner-muted">{work.display.status}</span></div>
    {work.agentName && <p className="owner-muted">{work.agentName}</p>}
    <p>{work.display.summary}</p>
  </li>)}</ul>;
  const sections = [
    { title: "Work needs your attention", works: data?.works.filter(w => w.lane === "Needs You") ?? [] },
    { title: "In progress", works: data?.works.filter(w => ["Working", "Monitoring", "Waiting"].includes(w.lane)) ?? [] },
    { title: "Ready to review", works: data?.works.filter(w => w.lane === "Ready") ?? [] },
    { title: "Recently completed", works: data?.works.filter(w => w.lane === "Completed") ?? [] },
  ];
  return <section id="work-inbox" aria-label="Work" data-work-inbox>
    {error === "signed-out" ? <div role="alert"><p>Your session ended.</p><Link href="/login">Sign in again →</Link></div>
      : error ? <div role="alert"><p>Work could not be refreshed.</p><button onClick={() => setRevision(v => v + 1)}>Try again</button></div> : !data ? <p role="status">Loading your Work…</p> : <>
      {stale && <p role="status" className="owner-muted" data-work-inbox-stale>Showing the last update. Refreshing…</p>}
      {data.unavailableWorks > 0 && <p role="status" className="owner-muted" data-work-inbox-unavailable>{data.unavailableWorks === 1 ? "1 Work item could not be shown." : `${data.unavailableWorks} Work items could not be shown.`}</p>}
      {overview ? sections.map(section => section.works.length > 0 && <section className="owner-today-section" key={section.title}><div className="owner-row"><h2>{section.title}</h2><Link href="/work">View all Work →</Link></div>{workList(section.works.slice(0, 3))}</section>) : <>
        <div className="owner-actions" role="group" aria-label="Filter Work by state">{(["Active", "Needs You", "Ready", "Completed", "Stopped"] as const).map(value => <button key={value} type="button" aria-pressed={lane === value} onClick={() => setLane(value)}>{value === "Ready" ? "Results" : value} ({value === "Active" ? data.counts.Working + data.counts.Monitoring + data.counts.Waiting : data.counts[value]})</button>)}</div>
        {workList(data.works.filter(w => lane === "Active" ? ["Working", "Monitoring", "Waiting"].includes(w.lane) : w.lane === lane))}
        {!data.works.some(w => lane === "Active" ? ["Working", "Monitoring", "Waiting"].includes(w.lane) : w.lane === lane) && <Empty title="No Work here yet">Ask Sofie to get something done. You can follow its progress here. <Link href="/chat">Ask Sofie →</Link></Empty>}
      </>}
      {!overview && <nav className="owner-actions" aria-label="Work pages">{offset > 0 && <button onClick={() => { setData(null); setOffset(Math.max(0, offset - 20)); }}>Newer Work</button>}{data.nextOffset !== null && <button onClick={() => { setData(null); setOffset(data.nextOffset!); }}>Older Work</button>}</nav>}
    </>}
  </section>;
}
