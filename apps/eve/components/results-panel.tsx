"use client";

import { Badge, Button, Loader } from "@cloudflare/kumo";
import { ArrowClockwiseIcon, CheckCircleIcon, RepeatIcon, StarIcon, TimerIcon, TrashIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";

import type { OutcomeView, OwnerFeedback } from "@/lib/outcome-types";

function when(value: string): string {
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function ResultsPanel({ onStartPrompt }: { onStartPrompt: (title: string, prompt: string) => void }) {
  const [results, setResults] = useState<OutcomeView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/outcomes?limit=100", { cache: "no-store" });
      if (!response.ok) throw new Error("Results could not be loaded.");
      setResults(((await response.json()) as { outcomes?: OutcomeView[] }).outcomes ?? []);
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Results could not be loaded."); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function review(result: OutcomeView, ownerFeedback: OwnerFeedback) {
    setUpdating(result.id);
    try {
      const response = await fetch(`/api/outcomes/${result.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ownerFeedback }) });
      if (!response.ok) throw new Error("Review could not be saved.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Review could not be saved."); }
    finally { setUpdating(null); }
  }

  async function requestChanges(result: OutcomeView) {
    await review(result, "unhelpful");
    onStartPrompt("Revise result", `Revise this result based on my feedback. Preserve its evidence and create a superseding outcome when done.\n\nResult: ${result.summary}\nOutcome id: ${result.id}`);
  }
  async function remove(result: OutcomeView) {
    if (!window.confirm("Delete this result and revoke its evidence links? This cannot be undone.")) return;
    setUpdating(result.id);
    try { const response = await fetch(`/api/outcomes/${result.id}`, { method: "DELETE" }); if (!response.ok) throw new Error("Result could not be deleted."); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Result could not be deleted."); }
    finally { setUpdating(null); }
  }

  if (results === null && !error) return <div className="flex justify-center py-16"><Loader size={18} /></div>;
  return <div className="flex flex-col gap-5">
    <header><div className="flex items-center gap-2 text-kumo-subtle"><CheckCircleIcon className="size-4" /><span className="text-xs font-medium uppercase tracking-[0.14em]">Completed work</span></div><h1 className="mt-2 text-xl font-semibold tracking-tight">Results</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-kumo-subtle">Review what Sofie delivered, trace its evidence, and turn useful work into a reusable skill or routine.</p></header>
    {error && <div className="rounded-xl border border-kumo-danger/25 bg-kumo-danger/5 p-4 text-sm"><p>{error}</p><Button className="mt-3" size="sm" variant="secondary" icon={ArrowClockwiseIcon} onClick={() => void load()}>Retry</Button></div>}
    {results?.length === 0 ? <div className="rounded-2xl border border-dashed border-kumo-hairline px-6 py-14 text-center"><CheckCircleIcon className="mx-auto size-7 text-kumo-subtle" /><p className="mt-4 text-sm font-medium">No completed results yet</p><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-kumo-subtle">When Sofie finishes goal-linked or audited work, the result and its evidence will appear here.</p></div> :
      <ol className="grid gap-3">{results?.map((result) => <li key={result.id} className="rounded-2xl border border-kumo-hairline bg-kumo-canvas p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold leading-6">{result.summary}</p><p className="mt-1 text-xs text-kumo-subtle">{when(result.occurredAt)} · {result.evidence.length} evidence item{result.evidence.length === 1 ? "" : "s"}</p></div><Badge variant={result.status === "failed" || result.status === "ineffective" ? "destructive" : "secondary"}>{result.status.replaceAll("_", " ")}</Badge></div>
        <p className="mt-2 text-xs text-kumo-subtle">{result.agentName ? `${result.agentName} · ` : ""}{result.runTitle ?? (result.runId ? `Run ${result.runId}` : "Goal result")}{result.threadId ? ` · Thread ${result.threadId}` : ""} · retained until deleted</p>
        {result.rationale.length > 0 && <ul className="mt-3 list-disc space-y-1 ps-5 text-sm text-kumo-subtle">{result.rationale.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-kumo-hairline pt-3"><div className="flex gap-2"><Button size="sm" variant={result.ownerFeedback === "helpful" ? "primary" : "secondary"} disabled={updating === result.id} onClick={() => void review(result, "helpful")}>Accept</Button><Button size="sm" variant="secondary" disabled={updating === result.id} onClick={() => void requestChanges(result)}>Request changes</Button></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="ghost" icon={RepeatIcon} onClick={() => onStartPrompt("Run result again", `Run this work again using the same intent and evidence standard. Link the new outcome to the prior result ${result.id}.\n\nPrior result: ${result.summary}`)}>Run again</Button><Button size="sm" variant="ghost" icon={StarIcon} onClick={() => onStartPrompt("Save result as skill", `Turn this completed work into a concise reusable skill. Show me the proposed skill before saving it.\n\nResult: ${result.summary}`)}>Save as skill</Button><Button size="sm" variant="ghost" icon={TimerIcon} onClick={() => onStartPrompt("Make result a routine", `Turn this completed work into a recurring routine. Ask me for cadence, timezone, delivery channel, and approval boundary before scheduling it.\n\nResult: ${result.summary}`)}>Make routine</Button><Button size="sm" variant="ghost" icon={TrashIcon} disabled={updating === result.id} onClick={() => void remove(result)}>Delete</Button></div></div>
      </li>)}</ol>}
  </div>;
}
