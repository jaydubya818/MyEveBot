"use client";

import { Badge, Button, Dialog, Input, InputArea, Loader } from "@cloudflare/kumo";
import {
  ArrowClockwiseIcon,
  BrainIcon,
  CheckCircleIcon,
  ClockCounterClockwiseIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  ShieldCheckIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { OWNER_KNOWLEDGE_TYPES, type OwnerKnowledgePage, type OwnerKnowledgeReview, type OwnerKnowledgeView } from "@/lib/owner-knowledge-types";
import { MEMORY_SCOPE_TYPES } from "@/lib/memory-scopes";
import { cn } from "@/lib/utils";

type Receipt = { id: string; operation: string; result: string; canonicalRecordId: string; remoteDeleted?: boolean; remoteDeletionVerified?: boolean; canonicalMetadataRemoved?: boolean; sourceHistoryPreserved?: boolean };
type Option = { id: string; name: string };

const REVIEW_QUEUES: Array<{ id: OwnerKnowledgeReview | ""; label: string }> = [
  { id: "", label: "All" },
  { id: "needs_review", label: "Needs review" },
  { id: "contradictions", label: "Contradictions" },
  { id: "stale", label: "Potentially stale" },
  { id: "recent", label: "Recently learned" },
  { id: "corrected", label: "Recently corrected" },
];

function label(value: string): string {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function date(value: string | null): string {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function preferenceText(value: unknown): string {
  if (typeof value === "string") return value;
  return value == null ? "" : JSON.stringify(value, null, 2);
}

function preferenceValue(value: string): unknown {
  try { return JSON.parse(value); } catch { return value; }
}

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...init });
  const body = await response.json().catch(() => null) as (T & { error?: { message?: string } | string }) | null;
  if (!response.ok) {
    const problem = typeof body?.error === "object" ? body.error.message : body?.error;
    throw new Error(problem ?? "The request could not be completed.");
  }
  if (!body) throw new Error("The server returned an empty response.");
  return body;
}

function StatusBadge({ status }: { status: string }) {
  const risky = ["contradicted", "missed", "reversed"].includes(status);
  const quiet = ["stale", "superseded", "expired", "inactive", "dismissed", "cancelled", "rejected"].includes(status);
  return <Badge variant={risky ? "destructive" : quiet ? "secondary" : "success"}>{label(status)}</Badge>;
}

function CorrectionDialog({ item, open, onOpenChange, onSaved }: { item: OwnerKnowledgeView; open: boolean; onOpenChange: (open: boolean) => void; onSaved: (receipt: Receipt, item: OwnerKnowledgeView) => void }) {
  const [content, setContent] = useState(item.content);
  const [structuredValue, setStructuredValue] = useState(preferenceText(item.structuredValue));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setContent(item.content); setStructuredValue(preferenceText(item.structuredValue)); setError(null); } }, [item.content, item.structuredValue, open]);
  const unchanged = content.trim() === item.content.trim() && structuredValue.trim() === preferenceText(item.structuredValue).trim();
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog size="base" className="p-6">
      <Dialog.Title>Correct this {label(item.canonicalType)}</Dialog.Title>
      <Dialog.Description className="mt-1 text-sm text-kumo-subtle">
        Correction creates a new canonical version and preserves the earlier version as superseded where the repository supports history.
      </Dialog.Description>
      <label className="mt-5 grid gap-1.5 text-sm font-medium">Corrected information<InputArea autoFocus required rows={6} maxLength={item.canonicalRepository === "memory" ? 4000 : 20000} value={content} onChange={(event) => setContent(event.target.value)} /></label>
      {item.canonicalType === "preference" && <label className="mt-4 grid gap-1.5 text-sm font-medium">Canonical preference value<InputArea required rows={3} maxLength={4000} value={structuredValue} onChange={(event) => setStructuredValue(event.target.value)} /><span className="text-xs font-normal text-kumo-subtle">Plain text is saved as text. Valid JSON preserves a structured value.</span></label>}
      {error && <p role="alert" className="mt-3 text-sm text-kumo-danger">{error}</p>}
      <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={saving} disabled={content.trim().length === 0 || (item.canonicalType === "preference" && structuredValue.trim().length === 0) || unchanged} onClick={() => void (async () => {
        setSaving(true); setError(null);
        try {
          const body = await jsonRequest<{ receipt: Receipt; item: OwnerKnowledgeView }>("/api/owner-knowledge", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repository: item.canonicalRepository, id: item.id, content: content.trim(), preferenceValue: item.canonicalType === "preference" ? preferenceValue(structuredValue.trim()) : undefined }) });
          onSaved(body.receipt, body.item); onOpenChange(false);
        } catch (reason) { setError(reason instanceof Error ? reason.message : "Correction failed."); } finally { setSaving(false); }
      })()}>Save correction</Button></div>
    </Dialog>
  </Dialog.Root>;
}

function ForgetDialog({ item, open, onOpenChange, onForgotten }: { item: OwnerKnowledgeView; open: boolean; onOpenChange: (open: boolean) => void; onForgotten: (receipt: Receipt) => void }) {
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setConfirmation(""); setError(null); } }, [open]);
  const remote = item.canonicalRepository === "memory" && item.remoteAvailability !== "not_applicable";
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog size="base" className="p-6">
      <Dialog.Title>Forget this {label(item.canonicalType)}</Dialog.Title>
      <Dialog.Description className="mt-1 text-sm text-kumo-subtle">This removes the active canonical record. It does not remove the related conversation, Goal, Agent, or external source.</Dialog.Description>
      <dl className="mt-5 grid gap-3 rounded-xl border border-kumo-hairline bg-kumo-tint p-4 text-sm">
        <div><dt className="text-xs text-kumo-subtle">What will be removed</dt><dd className="mt-1">{label(item.canonicalType)} · {item.scope.label}</dd></div>
        <div><dt className="text-xs text-kumo-subtle">Source</dt><dd className="mt-1">{item.source?.label ?? "Source unavailable"}</dd></div>
        <div><dt className="text-xs text-kumo-subtle">Related records retained</dt><dd className="mt-1">{[item.agentRef?.name ?? item.agentRef?.id, item.goalRef?.title ?? item.goalRef?.id, item.source?.id].filter(Boolean).join(" · ") || "None identified"}</dd></div>
        <div><dt className="text-xs text-kumo-subtle">Remote-provider impact</dt><dd className="mt-1">{remote ? "Remote Memory must be removed and verified before MyEve reports success." : "No remote deletion is required."}</dd></div>
      </dl>
      <label className="mt-5 grid gap-1.5 text-sm font-medium">Type FORGET to continue<Input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
      {error && <p role="alert" className="mt-3 text-sm text-kumo-danger">{error}</p>}
      <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="destructive" icon={TrashIcon} loading={saving} disabled={confirmation !== "FORGET"} onClick={() => void (async () => {
        setSaving(true); setError(null);
        try {
          const body = await jsonRequest<{ receipt: Receipt }>("/api/owner-knowledge", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repository: item.canonicalRepository, id: item.id, confirmation }) });
          onForgotten(body.receipt); onOpenChange(false);
        } catch (reason) { setError(reason instanceof Error ? reason.message : "Forget failed."); } finally { setSaving(false); }
      })()}>Forget permanently</Button></div>
    </Dialog>
  </Dialog.Root>;
}

function Detail({ item, onCorrect, onForget }: { item: OwnerKnowledgeView; onCorrect: () => void; onForget: () => void }) {
  return <article className="overflow-hidden rounded-2xl border border-kumo-hairline bg-kumo-elevated">
    <header className="border-b border-kumo-hairline p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{label(item.canonicalType)}</Badge><StatusBadge status={item.status} /><span className="text-xs text-kumo-subtle">{Math.round(item.confidence * 100)}% confidence</span></div>
      {item.title && <h3 className="mt-3 text-lg font-semibold">{item.title}</h3>}
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{item.content}</p>
      {item.remoteAvailability === "provider_unavailable" && <div role="status" className="mt-4 flex gap-2 rounded-xl border border-kumo-warning/25 bg-kumo-warning/5 p-3 text-xs"><WarningCircleIcon className="mt-0.5 size-4 shrink-0" /><span>The remote Memory provider is unavailable. Canonical details remain visible, but correction and Forget may not complete until the provider recovers.</span></div>}
      <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="secondary" icon={PencilSimpleIcon} onClick={onCorrect}>Correct</Button><Button size="sm" variant="ghost" icon={TrashIcon} onClick={onForget}>Forget</Button></div>
    </header>
    <div className="grid gap-0 lg:grid-cols-2">
      <div className="space-y-5 p-5 sm:p-6">
        <section><div className="flex items-center gap-2"><ShieldCheckIcon className="size-4 text-kumo-subtle" /><h4 className="text-sm font-semibold">Scope and access</h4></div><p className="mt-2 text-sm font-medium">{item.scope.label}</p><p className="mt-1 text-xs leading-5 text-kumo-subtle">{item.scope.accessSummary}</p><p className="mt-2 text-xs text-kumo-subtle">Eligible for context: {item.eligibleForContext.join(" · ")}</p><p className="mt-1 text-xs text-kumo-subtle">Used in recorded context: {item.usedInRuns} {item.usedInRuns === 1 ? "time" : "times"}</p></section>
        <section className="border-t border-kumo-hairline pt-5"><div className="flex items-center gap-2"><LinkIcon className="size-4 text-kumo-subtle" /><h4 className="text-sm font-semibold">Why MyEve knows this</h4></div>{item.source ? <div className="mt-3 text-sm"><p className="font-medium">{item.source.label}</p><p className="mt-1 text-xs text-kumo-subtle">{date(item.source.date)}</p>{item.source.url && <a className="mt-2 inline-block text-xs text-kumo-link hover:underline" href={item.source.url}>View source</a>}</div> : <p className="mt-3 text-sm text-kumo-subtle">Source unavailable</p>}{item.provenance.length > 0 && <ul className="mt-3 space-y-2">{item.provenance.map((entry, index) => <li key={`${entry.source.id ?? "source"}-${index}`} className="rounded-xl border border-kumo-hairline p-3 text-xs"><p className="font-medium">{label(entry.relation)} · {entry.source.label}</p><p className="mt-1 text-kumo-subtle">{Math.round(entry.confidence * 100)}% confidence · {date(entry.source.date)}</p></li>)}</ul>}</section>
      </div>
      <aside className="border-t border-kumo-hairline p-5 text-sm lg:border-s lg:border-t-0 sm:p-6">
        <dl className="space-y-4"><div><dt className="text-xs text-kumo-subtle">Repository</dt><dd className="mt-1 capitalize">{item.canonicalRepository}</dd></div><div><dt className="text-xs text-kumo-subtle">Updated</dt><dd className="mt-1">{date(item.updatedAt)}</dd></div><div><dt className="text-xs text-kumo-subtle">Last confirmed</dt><dd className="mt-1">{date(item.lastConfirmedAt)}</dd></div>{item.agentRef && <div><dt className="text-xs text-kumo-subtle">Agent</dt><dd className="mt-1">{item.agentRef.name ?? item.agentRef.id}</dd></div>}{item.goalRef && <div><dt className="text-xs text-kumo-subtle">Goal</dt><dd className="mt-1"><a className="text-kumo-link hover:underline" href={`/goals?goal=${encodeURIComponent(item.goalRef.id)}`}>{item.goalRef.title ?? item.goalRef.id}</a></dd></div>}</dl>
        {(item.staleReasons.length > 0 || item.contradictions.length > 0) && <section className="mt-6 rounded-xl border border-kumo-danger/20 bg-kumo-danger/5 p-3"><h4 className="text-sm font-semibold">Needs review</h4>{item.staleReasons.map((reason) => <p key={reason} className="mt-1 text-xs text-kumo-subtle">{reason}</p>)}{item.contradictions.map((id) => <p key={id} className="mt-1 text-xs text-kumo-subtle">Conflicts with {id}</p>)}</section>}
        {(item.supersedes || item.supersededBy) && <section className="mt-6 border-t border-kumo-hairline pt-4"><h4 className="flex items-center gap-2 text-sm font-semibold"><ClockCounterClockwiseIcon className="size-4" />Correction history</h4>{item.supersedes && <p className="mt-2 break-all text-xs text-kumo-subtle">Supersedes {item.supersedes}</p>}{item.supersededBy && <p className="mt-1 break-all text-xs text-kumo-subtle">Superseded by {item.supersededBy}</p>}</section>}
      </aside>
    </div>
  </article>;
}

export function WhatMyEveKnowsPanel() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [scope, setScope] = useState("");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState("");
  const [agentId, setAgentId] = useState("");
  const [goalId, setGoalId] = useState("");
  const [updatedFrom, setUpdatedFrom] = useState("");
  const [review, setReview] = useState<OwnerKnowledgeReview | "">("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<OwnerKnowledgePage | null>(null);
  const [selected, setSelected] = useState<OwnerKnowledgeView | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [forgetOpen, setForgetOpen] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [agents, setAgents] = useState<Option[]>([]);
  const [goals, setGoals] = useState<Option[]>([]);

  useEffect(() => {
    void Promise.all([
      fetch("/api/agents", { cache: "no-store" }).then((response) => response.ok ? response.json() : null),
      fetch("/api/goals", { cache: "no-store" }).then((response) => response.ok ? response.json() : null),
    ]).then(([agentBody, goalBody]) => {
      setAgents(((agentBody as { agents?: Array<{ id: string; name: string }> } | null)?.agents ?? []).map((item) => ({ id: item.id, name: item.name })));
      setGoals(((goalBody as { goals?: Array<{ id: string; title: string }> } | null)?.goals ?? []).map((item) => ({ id: item.id, name: item.title })));
    }).catch(() => undefined);
  }, []);

  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), limit: "25" });
    if (query.trim()) value.set("q", query.trim());
    if (type) value.set("type", type);
    if (scope) value.set("scope", scope);
    if (source) value.set("source", source);
    if (status) value.set("status", status);
    if (agentId) value.set("agent", agentId);
    if (goalId) value.set("goal", goalId);
    if (updatedFrom) value.set("updatedFrom", updatedFrom);
    if (review) value.set("review", review);
    return value;
  }, [agentId, goalId, page, query, review, scope, source, status, type, updatedFrom]);

  const load = useCallback(async () => {
    setError(null); setSearching(true);
    try {
      const body = await jsonRequest<OwnerKnowledgePage>(`/api/owner-knowledge?${params}`);
      if (!Array.isArray(body.items)) throw new Error("What MyEve Knows returned an invalid response.");
      setResult(body);
      setSelected((current) => current && !body.items.some((item) => item.id === current.id) ? null : current);
    } catch (reason) { setResult({ items: [], page: 1, limit: 25, hasMore: false }); setError(reason instanceof Error ? reason.message : "What MyEve Knows could not be loaded."); }
    finally { setSearching(false); }
  }, [params]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 220); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => { setPage(1); }, [agentId, goalId, query, review, scope, source, status, type, updatedFrom]);

  async function inspect(item: OwnerKnowledgeView) {
    setLoadingDetail(true); setError(null);
    try { const body = await jsonRequest<{ item: OwnerKnowledgeView }>(`/api/owner-knowledge?repository=${item.canonicalRepository}&id=${encodeURIComponent(item.id)}`); setSelected(body.item); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "That information could not be inspected."); }
    finally { setLoadingDetail(false); }
  }

  function completed(nextReceipt: Receipt, nextItem?: OwnerKnowledgeView) {
    setReceipt(nextReceipt);
    setSelected(nextItem ?? null);
    void load();
  }

  return <div className="flex flex-col gap-5">
    <header><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><BrainIcon className="size-5" /><h3 className="text-base font-semibold">What MyEve Knows</h3>{searching && <span className="flex items-center gap-1 text-xs text-kumo-subtle"><Loader size={12} />Searching</span>}</div><p className="mt-1 max-w-2xl text-sm text-kumo-subtle">Inspect durable Memory and Knowledge, understand why it exists, and keep final authority over corrections and removal.</p></div><Button variant="ghost" size="sm" shape="square" icon={ArrowClockwiseIcon} aria-label="Refresh" onClick={() => void load()} /></div></header>
    {receipt && <div className={cn("flex gap-3 rounded-xl border p-4 text-sm", receipt.result === "completed" ? "border-kumo-success/25 bg-kumo-success/5" : "border-kumo-danger/25 bg-kumo-danger/5")}><CheckCircleIcon className="mt-0.5 size-4 shrink-0" /><div><p className="font-medium">{label(receipt.operation)}</p><p className="mt-1 text-xs text-kumo-subtle">{label(receipt.result)} · Audit {receipt.id}</p>{receipt.remoteDeletionVerified !== undefined && <p className="mt-1 text-xs text-kumo-subtle">Remote Memory: {receipt.remoteDeletionVerified ? "removed and verified" : receipt.remoteDeleted ? "removal requested but absence not verified" : "not removed"}</p>}{receipt.sourceHistoryPreserved && <p className="mt-1 text-xs text-kumo-subtle">Previous version superseded · source history preserved</p>}</div></div>}
    <nav className="flex gap-1 overflow-x-auto rounded-xl border border-kumo-hairline bg-kumo-elevated p-1" aria-label="Knowledge review queues">{REVIEW_QUEUES.map((item) => <button key={item.id || "all"} type="button" className={cn("shrink-0 rounded-lg px-3 py-2 text-xs text-kumo-subtle hover:text-kumo-default", review === item.id && "bg-kumo-tint font-medium text-kumo-default")} onClick={() => setReview(item.id)}>{item.label}</button>)}</nav>
    <div className="grid gap-2 md:grid-cols-4"><div className="relative md:col-span-2"><MagnifyingGlassIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-kumo-subtle" /><Input aria-label="Search what MyEve knows" className="w-full ps-9" placeholder="Search Memory and Knowledge" value={query} onChange={(event) => setQuery(event.target.value)} /></div><select aria-label="Filter by type" className="h-9 rounded-lg border border-kumo-hairline bg-kumo-elevated px-3 text-xs" value={type} onChange={(event) => setType(event.target.value)}><option value="">All types</option>{OWNER_KNOWLEDGE_TYPES.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select><select aria-label="Filter by scope" className="h-9 rounded-lg border border-kumo-hairline bg-kumo-elevated px-3 text-xs" value={scope} onChange={(event) => setScope(event.target.value)}><option value="">All scopes</option>{MEMORY_SCOPE_TYPES.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></div>
    <details className="rounded-xl border border-kumo-hairline p-3"><summary className="cursor-pointer text-xs font-medium">More filters</summary><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5"><select aria-label="Filter by Agent" className="h-9 rounded-lg border border-kumo-hairline bg-kumo-elevated px-3 text-xs" value={agentId} onChange={(event) => setAgentId(event.target.value)}><option value="">All Agents</option>{agents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Filter by Goal" className="h-9 rounded-lg border border-kumo-hairline bg-kumo-elevated px-3 text-xs" value={goalId} onChange={(event) => setGoalId(event.target.value)}><option value="">All Goals</option>{goals.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Filter by source" className="h-9 rounded-lg border border-kumo-hairline bg-kumo-elevated px-3 text-xs" value={source} onChange={(event) => setSource(event.target.value)}><option value="">All sources</option>{["explicit", "chat", "email", "slack", "telegram", "file", "web", "run", "manual"].map((value) => <option key={value} value={value}>{label(value)}</option>)}</select><Input aria-label="Filter by status" placeholder="Status" value={status} onChange={(event) => setStatus(event.target.value)} /><Input aria-label="Updated since" type="date" value={updatedFrom} onChange={(event) => setUpdatedFrom(event.target.value)} /></div></details>
    {error && <div role="alert" className="flex gap-2 rounded-xl border border-kumo-danger/25 bg-kumo-danger/5 p-3 text-sm text-kumo-danger"><WarningCircleIcon className="mt-0.5 size-4 shrink-0" />{error}</div>}
    <div className="grid min-h-96 gap-5 lg:grid-cols-[340px_minmax(0,1fr)]"><aside>{result === null ? <div className="flex justify-center py-12"><Loader /></div> : result.items.length === 0 ? <div className="rounded-xl border border-dashed border-kumo-hairline p-8 text-center"><BrainIcon className="mx-auto size-6 text-kumo-subtle" /><p className="mt-3 text-sm font-medium">{query || type || review ? "No matching information" : "Nothing durable yet"}</p><p className="mt-1 text-xs text-kumo-subtle">Try another search or filter. MyEve never invents missing provenance.</p></div> : <><ul className="space-y-2">{result.items.map((item) => <li key={`${item.canonicalRepository}:${item.id}`}><button type="button" className={cn("w-full rounded-xl border border-kumo-hairline p-3 text-start hover:bg-kumo-tint", selected?.id === item.id && "border-kumo-line bg-kumo-tint")} onClick={() => void inspect(item)}><div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{label(item.canonicalType)}</Badge><StatusBadge status={item.status} /></div><p className="mt-2 line-clamp-2 text-sm font-medium">{item.title ?? item.content}</p>{item.title && <p className="mt-1 line-clamp-2 text-xs text-kumo-subtle">{item.content}</p>}<p className="mt-2 text-[11px] text-kumo-subtle">{item.scope.label} · {item.source?.label ?? "Source unavailable"} · {date(item.updatedAt)}</p></button></li>)}</ul><div className="mt-4 flex items-center justify-between"><Button size="sm" variant="secondary" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button><span className="text-xs text-kumo-subtle">Page {page}</span><Button size="sm" variant="secondary" disabled={!result.hasMore} onClick={() => setPage((value) => value + 1)}>Next</Button></div></>}</aside><div>{loadingDetail ? <div className="grid min-h-64 place-items-center rounded-2xl border border-kumo-hairline"><Loader /></div> : selected ? <Detail item={selected} onCorrect={() => setCorrectionOpen(true)} onForget={() => setForgetOpen(true)} /> : <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-kumo-hairline p-8 text-center"><div><BrainIcon className="mx-auto size-6 text-kumo-subtle" /><p className="mt-3 text-sm font-medium">Select information to inspect</p><p className="mt-1 text-xs text-kumo-subtle">Scope, provenance, history, and owner controls will appear here.</p></div></div>}</div></div>
    {selected && <><CorrectionDialog item={selected} open={correctionOpen} onOpenChange={setCorrectionOpen} onSaved={(nextReceipt, item) => completed(nextReceipt, item)} /><ForgetDialog item={selected} open={forgetOpen} onOpenChange={setForgetOpen} onForgotten={(nextReceipt) => completed(nextReceipt)} /></>}
  </div>;
}
