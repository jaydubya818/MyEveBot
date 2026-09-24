"use client";

import { Button, Input, Loader } from "@cloudflare/kumo";
import { ArrowClockwiseIcon, BrainIcon, LinkIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { KNOWLEDGE_STATUSES, type KnowledgeKind, type KnowledgeRecordView } from "@/lib/knowledge-types";
import { cn } from "@/lib/utils";

const TABS: { id: KnowledgeKind; label: string; description: string }[] = [
  { id: "decision", label: "Decisions", description: "Choices with rationale and conditions for revisiting them." },
  { id: "fact", label: "Facts", description: "Durable assertions with confidence and evidence." },
  { id: "observation", label: "Observations", description: "Patterns noticed, not automatically promoted to preferences." },
  { id: "hypothesis", label: "Hypotheses", description: "Uncertain interpretations that still need evaluation." },
  { id: "commitment", label: "Commitments", description: "Explicit obligations and their current status." },
  { id: "preference", label: "Preferences", description: "Trusted guidance with an inspectable origin." },
];

interface ApiProblem { error?: string | { message?: string }; }
async function requestJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  const body = await response.json().catch(() => null) as (T & ApiProblem) | null;
  if (!response.ok) throw new Error(typeof body?.error === "object" ? body.error.message : typeof body?.error === "string" ? body.error : "The request could not be completed.");
  if (!body) throw new Error("The server returned an empty response.");
  return body;
}

function date(value: string | null): string {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function Status({ value }: { value: string }) {
  const caution = ["contradicted", "reversed", "rejected", "missed"].includes(value);
  const quiet = ["stale", "superseded", "dismissed", "inactive", "expired", "cancelled"].includes(value);
  return <span className={cn("rounded-full border border-kumo-hairline bg-kumo-tint px-2 py-0.5 text-[11px] font-medium capitalize", caution && "border-kumo-danger/25 bg-kumo-danger/10 text-kumo-danger", quiet && "text-kumo-subtle")}>{value.replaceAll("_", " ")}</span>;
}

function RecordTitle({ record }: { record: KnowledgeRecordView }) {
  if (record.title) return record.title;
  if (record.kind === "preference" && record.preferenceKey) return record.preferenceKey;
  if (record.kind === "commitment" && record.subject) return record.subject;
  return record.statement;
}

function Detail({ record, onOpen }: { record: KnowledgeRecordView; onOpen: (id: string) => void }) {
  const when = record.decidedAt ?? record.dueAt ?? record.generatedAt ?? record.createdAt;
  return (
    <article className="min-w-0 rounded-2xl border border-kumo-hairline bg-kumo-elevated shadow-sm">
      <header className="border-b border-kumo-hairline px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-medium uppercase tracking-[0.14em] text-kumo-subtle">{record.kind}</span><Status value={record.status} /><span className="text-xs text-kumo-subtle">{Math.round(record.confidence * 100)}% confidence</span></div>
        <h2 className="mt-3 text-xl font-semibold tracking-tight"><RecordTitle record={record} /></h2>
        {(record.title || record.preferenceKey || record.subject) && <p className="mt-2 text-sm leading-6 text-kumo-default">{record.statement}</p>}
      </header>
      <div className="grid gap-0 sm:grid-cols-[minmax(0,1fr)_210px]">
        <div className="min-w-0 px-5 py-5 sm:px-6">
          {record.rationale && <section><h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-kumo-subtle">Rationale</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{record.rationale}</p></section>}
          {record.alternatives.length > 0 && <section className="mt-6"><h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-kumo-subtle">Alternatives considered</h3><ul className="mt-2 space-y-2 text-sm">{record.alternatives.map((alternative) => <li key={alternative} className="flex gap-2"><span className="text-kumo-subtle">—</span><span>{alternative}</span></li>)}</ul></section>}
          {record.reopenCondition && <section className="mt-6 rounded-xl border border-kumo-hairline bg-kumo-tint p-4"><h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-kumo-subtle">Reopen when</h3><p className="mt-1.5 text-sm leading-6">{record.reopenCondition}</p></section>}
          {record.testDescription && <section className="mt-6"><h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-kumo-subtle">Test</h3><p className="mt-2 text-sm leading-6">{record.testDescription}</p>{record.decisionTrigger && <p className="mt-2 text-xs text-kumo-subtle">Decision trigger: {record.decisionTrigger}</p>}</section>}
          {record.kind === "preference" && <section className="mt-6 grid gap-3 rounded-xl border border-kumo-hairline p-4 text-sm"><div><span className="text-kumo-subtle">Value</span><p className="mt-1 font-mono text-xs">{JSON.stringify(record.preferenceValue)}</p></div><div className="flex flex-wrap gap-4"><span>Scope: {record.preferenceScope}</span><span>Origin: {record.preferenceSourceType?.replaceAll("_", " ")}</span></div></section>}
          <section className="mt-7 border-t border-kumo-hairline pt-5">
            <div className="flex items-center gap-2"><LinkIcon className="size-4 text-kumo-subtle" /><h3 className="text-sm font-semibold">Evidence & sources</h3></div>
            {record.provenance.length === 0 ? <p className="mt-3 text-sm text-kumo-subtle">No source is attached yet. Treat this record cautiously until its origin is documented.</p> : <ol className="mt-3 space-y-3">{record.provenance.map((link) => <li key={link.id} className="rounded-xl border border-kumo-hairline p-3"><div className="flex flex-wrap items-center gap-2 text-xs"><span className="font-medium capitalize">{link.relation.replaceAll("_", " ")}</span><span className="text-kumo-subtle">{Math.round(link.confidence * 100)}%</span></div><p className="mt-1.5 text-sm">{link.source.author ?? link.source.provider ?? "Recorded source"}</p><p className="mt-1 text-xs capitalize text-kumo-subtle">{link.source.sourceType} · {date(link.source.capturedAt)}</p>{link.source.referenceUri && <a className="mt-2 inline-block max-w-full truncate text-xs text-kumo-link hover:underline" href={link.source.referenceUri}>{link.source.referenceUri}</a>}</li>)}</ol>}
          </section>
          {(record.supersedesId || record.supersededById) && <section className="mt-7 border-t border-kumo-hairline pt-5"><h3 className="text-sm font-semibold">History</h3><div className="mt-3 flex flex-wrap gap-2">{record.supersedesId && <Button variant="outline" size="sm" onClick={() => onOpen(record.supersedesId!)}>Earlier version</Button>}{record.supersededById && <Button variant="outline" size="sm" onClick={() => onOpen(record.supersededById!)}>Newer version</Button>}</div></section>}
        </div>
        <aside className="border-t border-kumo-hairline px-5 py-5 text-sm sm:border-s sm:border-t-0">
          <dl className="space-y-4"><div><dt className="text-xs text-kumo-subtle">Date</dt><dd className="mt-1">{date(when)}</dd></div><div><dt className="text-xs text-kumo-subtle">Created by</dt><dd className="mt-1 capitalize">{record.createdByType}</dd></div>{record.goalId && <div><dt className="text-xs text-kumo-subtle">Related goal</dt><dd className="mt-1"><a className="text-kumo-link hover:underline" href={`/goals?goal=${encodeURIComponent(record.goalId)}`}>{record.goalTitle ?? "Open goal"}</a></dd></div>}{record.dueAt && <div><dt className="text-xs text-kumo-subtle">Due</dt><dd className="mt-1">{date(record.dueAt)}</dd></div>}{record.occurrenceCount && <div><dt className="text-xs text-kumo-subtle">Occurrences</dt><dd className="mt-1">{record.occurrenceCount}</dd></div>}{record.projectRef && <div><dt className="text-xs text-kumo-subtle">Project reference</dt><dd className="mt-1 break-all">{record.projectRef}</dd></div>}</dl>
        </aside>
      </div>
    </article>
  );
}

export function KnowledgePanel() {
  const [tab, setTab] = useState<KnowledgeKind>("decision");
  const [records, setRecords] = useState<KnowledgeRecordView[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<KnowledgeRecordView | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const tabInfo = useMemo(() => TABS.find((item) => item.id === tab)!, [tab]);

  const [revision, setRevision] = useState(0);
  const [initialized, setInitialized] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const load = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const id = new URLSearchParams(window.location.search).get("knowledge");
    if (!id) { setInitialized(true); return; }
    void requestJson<{ record: KnowledgeRecordView }>(`/api/knowledge/${encodeURIComponent(id)}`, controller.signal)
      .then(({ record }) => { setTab(record.kind); setSelectedId(record.id); })
      .catch((reason) => { if (!controller.signal.aborted) setDetailError(reason instanceof Error ? reason.message : "This record could not be loaded."); })
      .finally(() => { if (!controller.signal.aborted) setInitialized(true); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!initialized) return;
    const controller = new AbortController();
    setRecords(null); setError(null);
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ type: tab });
      if (query.trim()) params.set("q", query.trim());
      if (status) params.set("status", status);
      void requestJson<{ records: KnowledgeRecordView[] }>(`/api/knowledge?${params}`, controller.signal)
        .then(({ records: next }) => {
          if (controller.signal.aborted) return;
          setRecords(next);
          setSelectedId((current) => current && next.some((record) => record.id === current) ? current : next[0]?.id ?? null);
        })
        .catch((reason) => {
          if (controller.signal.aborted) return;
          setRecords([]); setSelectedId(null);
          setError(reason instanceof Error ? reason.message : "Knowledge could not be loaded.");
        });
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [initialized, query, status, tab, revision]);

  useEffect(() => {
    setDetail(null);
    if (!selectedId) return;
    const controller = new AbortController();
    setDetailError(null);
    void requestJson<{ record: KnowledgeRecordView }>(`/api/knowledge/${encodeURIComponent(selectedId)}`, controller.signal)
      .then(({ record }) => { if (!controller.signal.aborted) setDetail(record); })
      .catch((reason) => { if (!controller.signal.aborted) setDetailError(reason instanceof Error ? reason.message : "This record could not be loaded."); });
    return () => controller.abort();
  }, [selectedId, revision]);

  function select(id: string) {
    setSelectedId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("knowledge", id);
    window.history.replaceState(null, "", url.pathname + url.search);
  }

  function changeTab(kind: KnowledgeKind) {
    setTab(kind); setStatus(""); setQuery(""); setRecords(null); setSelectedId(null); setDetail(null); setDetailError(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("knowledge");
    window.history.replaceState(null, "", url.pathname + url.search);
  }

  return <section>
    <header className="mb-5 ps-8 md:ps-0"><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><BrainIcon className="size-5" /><h1 className="text-xl font-semibold tracking-tight">Knowledge</h1></div><p className="mt-1 text-sm text-kumo-subtle">What is known, why it is believed, and what remains uncertain.</p></div><Button variant="ghost" size="sm" shape="square" icon={ArrowClockwiseIcon} aria-label="Refresh knowledge" onClick={() => void load()} /></div></header>
    <div className="mb-5 overflow-x-auto"><div className="flex min-w-max gap-1 rounded-xl border border-kumo-hairline bg-kumo-elevated p-1">{TABS.map((item) => <button key={item.id} type="button" className={cn("rounded-lg px-3 py-2 text-sm text-kumo-subtle transition-colors hover:text-kumo-default", tab === item.id && "bg-kumo-tint font-medium text-kumo-default")} aria-pressed={tab === item.id} onClick={() => changeTab(item.id)}>{item.label}</button>)}</div></div>
    <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside><div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2"><div className="relative"><MagnifyingGlassIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-kumo-subtle" /><Input aria-label="Search knowledge" value={query} placeholder={`Search ${tabInfo.label.toLowerCase()}`} className="w-full ps-9" onChange={(event) => setQuery(event.target.value)} /></div><select aria-label="Filter by status" className="h-9 rounded-lg border border-kumo-hairline bg-kumo-elevated px-2 text-xs capitalize" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{KNOWLEDGE_STATUSES[tab].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></div><p className="mt-3 text-xs leading-5 text-kumo-subtle">{tabInfo.description}</p>
        {error && <div role="alert" className="mt-4 rounded-xl border border-kumo-danger/25 bg-kumo-danger/10 p-3 text-sm text-kumo-danger">{error}</div>}
        {records === null ? <div className="flex justify-center py-12"><Loader /></div> : records.length === 0 ? <div className="mt-5 rounded-xl border border-dashed border-kumo-hairline p-5 text-center"><p className="text-sm font-medium">No {tabInfo.label.toLowerCase()} found</p><p className="mt-1 text-xs leading-5 text-kumo-subtle">Ask Sofie to record a {tabInfo.id}. Saved records appear here with their sources.</p></div> : <ul className="mt-4 space-y-2">{records.map((record) => <li key={record.id}><button type="button" className={cn("w-full rounded-xl border border-kumo-hairline bg-kumo-elevated p-3 text-start transition-colors hover:bg-kumo-tint", selectedId === record.id && "border-kumo-line bg-kumo-tint")} onClick={() => select(record.id)}><div className="flex items-center justify-between gap-2"><Status value={record.status} /><span className="text-[11px] text-kumo-subtle">{date(record.decidedAt ?? record.createdAt)}</span></div><p className="mt-2 line-clamp-2 text-sm font-medium"><RecordTitle record={record} /></p>{record.title && <p className="mt-1 line-clamp-2 text-xs leading-5 text-kumo-subtle">{record.statement}</p>}</button></li>)}</ul>}
      </aside>
      <div>{detailError ? <div role="alert" className="rounded-xl border border-kumo-danger/25 p-5"><p>{detailError}</p><Button variant="outline" size="sm" onClick={load}>Retry</Button></div> : selectedId && detail === null ? <div className="flex min-h-64 items-center justify-center rounded-2xl border border-kumo-hairline"><Loader /></div> : detail ? <Detail record={detail} onOpen={select} /> : <div className="flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-kumo-hairline p-8 text-center"><div><BrainIcon className="mx-auto size-6 text-kumo-subtle" /><p className="mt-3 text-sm font-medium">Select a record</p><p className="mt-1 text-xs text-kumo-subtle">Its provenance and history will appear here.</p></div></div>}</div>
    </div>
  </section>;
}
