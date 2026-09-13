"use client";

import { Button, Loader } from "@cloudflare/kumo";
import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  ClockCountdownIcon,
  FlagIcon,
  ShieldWarningIcon,
  SparkleIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";

import type { OwnerFeedback, OutcomeView } from "@/lib/outcome-types";
import type { DailyBriefView, ProgressReview, ReviewRecommendation, ReviewRisk, ReviewWorkItem, WeeklyReviewView } from "@/lib/review-types";
import { AGENT_NAME } from "@/lib/identity";
import { cn } from "@/lib/utils";

type Tab = "daily" | "weekly";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body = (await response.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!response.ok || body === null) throw new Error(body?.error?.message ?? "The review could not be loaded.");
  return body;
}

function WorkList({ items, empty }: { items: ReviewWorkItem[]; empty: string }) {
  if (items.length === 0) return <p className="py-4 text-sm text-kumo-subtle">{empty}</p>;
  return <ul className="divide-y divide-kumo-hairline">{items.slice(0, 8).map((item) => (
    <li key={`${item.goalId}:${item.taskId ?? "goal"}:${item.at}`} className="py-2.5">
      <p className="text-sm font-medium text-kumo-strong">{item.taskTitle ?? item.goalTitle}</p>
      {item.taskTitle && <p className="mt-0.5 text-xs text-kumo-subtle">{item.goalTitle}</p>}
    </li>
  ))}</ul>;
}

function RecommendationList({ items }: { items: ReviewRecommendation[] }) {
  if (items.length === 0) return <p className="py-6 text-sm text-kumo-subtle">No recommendation needs attention right now.</p>;
  return <ol className="space-y-2">{items.map((item, index) => (
    <li key={`${item.goalId}:${item.taskId}:${index}`} className="rounded-xl border border-kumo-hairline bg-kumo-base p-3">
      <div className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-kumo-brand/10 text-xs font-semibold text-kumo-brand">{index + 1}</span><div>
        <p className="text-sm font-medium text-kumo-strong">{item.title}</p>
        <p className="mt-1 text-xs leading-5 text-kumo-subtle"><span className="font-medium text-kumo-default">Why now:</span> {item.whyNow.join(" · ")}</p>
      </div></div>
    </li>
  ))}</ol>;
}

function RiskList({ risks }: { risks: ReviewRisk[] }) {
  if (risks.length === 0) return <p className="py-4 text-sm text-kumo-subtle">No deterministic risk signals found.</p>;
  return <ul className="space-y-2">{risks.slice(0, 10).map((risk, index) => (
    <li key={`${risk.goalId}:${risk.taskId}:${risk.reason}:${index}`} className="rounded-lg border border-kumo-hairline px-3 py-2.5">
      <div className="flex items-start gap-2"><ShieldWarningIcon className={cn("mt-0.5 size-4 shrink-0", risk.severity === "critical" ? "text-kumo-danger" : "text-kumo-warning")} /><div><p className="text-sm font-medium">{risk.taskTitle ?? risk.goalTitle}</p><p className="mt-0.5 text-xs leading-5 text-kumo-subtle">{risk.explanation}</p></div></div>
    </li>
  ))}</ul>;
}

function DailyReview({ review }: { review: DailyBriefView }) {
  return <div className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
    <div className="space-y-5">
      <section className="rounded-2xl border border-kumo-brand/20 bg-kumo-brand/5 p-4"><div className="mb-3 flex items-center gap-2"><SparkleIcon className="size-4 text-kumo-brand" /><h2 className="text-sm font-semibold">Recommended focus</h2></div><RecommendationList items={review.recommendations} /></section>
      <section><h2 className="text-sm font-semibold">At risk</h2><RiskList risks={review.atRisk} /></section>
    </div>
    <div className="space-y-5">
      <section><h2 className="flex items-center gap-2 text-sm font-semibold"><ClockCountdownIcon className="size-4" />Due now</h2><WorkList items={[...review.overdue, ...review.approaching]} empty="Nothing overdue or approaching." /></section>
      <section><h2 className="flex items-center gap-2 text-sm font-semibold"><FlagIcon className="size-4" />Needs attention</h2><WorkList items={[...review.blocked, ...review.pendingOwnerActions]} empty="No blockers or owner actions pending." /></section>
      <section><h2 className="flex items-center gap-2 text-sm font-semibold"><CheckCircleIcon className="size-4" />Completed today</h2><WorkList items={review.completed} empty="No completed work recorded today." /></section>
    </div>
  </div>;
}

function WeeklyReview({ review }: { review: WeeklyReviewView }) {
  return <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
    <div className="space-y-5"><section className="rounded-2xl border border-kumo-brand/20 bg-kumo-brand/5 p-4"><h2 className="mb-3 text-sm font-semibold">Proposed priorities</h2><RecommendationList items={review.proposedPriorities} /></section><section><h2 className="text-sm font-semibold">Stalled and blocked</h2><RiskList risks={[...review.stalled, ...review.blockers]} /></section></div>
    <div className="space-y-5"><section><h2 className="text-sm font-semibold">Completed this week</h2><WorkList items={[...review.completedGoals, ...review.completedTasks]} empty="No completions recorded this week." /></section><section><h2 className="text-sm font-semibold">Missed commitments</h2><WorkList items={review.missedCommitments} empty="No known missed commitments." /></section><section><h2 className="text-sm font-semibold">Goal progress</h2><ul className="mt-2 space-y-2">{review.progress.map((goal) => <li key={goal.goalId} className="rounded-lg border border-kumo-hairline p-3"><div className="flex justify-between gap-4 text-sm"><span className="font-medium">{goal.goalTitle}</span><span className="tabular-nums text-kumo-subtle">{goal.progress}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-kumo-tint"><div className="h-full rounded-full bg-kumo-brand" style={{ width: `${goal.progress}%` }} /></div></li>)}</ul></section></div>
  </div>;
}

function Outcomes({ outcomes, onFeedback }: { outcomes: OutcomeView[]; onFeedback: (id: string, value: OwnerFeedback) => void }) {
  return <section className="mt-8 border-t border-kumo-hairline pt-6"><div><h2 className="text-sm font-semibold">Recent outcomes</h2><p className="mt-1 text-xs text-kumo-subtle">Execution status and real-world effectiveness remain separate.</p></div>{outcomes.length === 0 ? <p className="py-6 text-sm text-kumo-subtle">No outcomes recorded yet.</p> : <ul className="mt-3 divide-y divide-kumo-hairline">{outcomes.slice(0, 10).map((outcome) => <li key={outcome.id} className="grid gap-3 py-3 sm:grid-cols-[1fr_auto]"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{outcome.summary}</p><span className="rounded-full bg-kumo-tint px-2 py-0.5 text-[11px] capitalize text-kumo-subtle">{outcome.status.replaceAll("_", " ")}</span></div><p className="mt-1 text-xs text-kumo-subtle">{new Date(outcome.occurredAt).toLocaleDateString()}</p></div><select aria-label={`Effectiveness feedback for ${outcome.summary}`} className="h-8 rounded-lg border border-kumo-hairline bg-kumo-base px-2 text-xs capitalize" value={outcome.ownerFeedback} onChange={(event) => onFeedback(outcome.id, event.target.value as OwnerFeedback)}><option value="unknown">Feedback: unknown</option><option value="helpful">Helpful</option><option value="neutral">Neutral</option><option value="unhelpful">Unhelpful</option></select></li>)}</ul>}</section>;
}

export function ReviewPanel() {
  const [tab, setTab] = useState<Tab>("daily");
  const [review, setReview] = useState<ProgressReview | null>(null);
  const [outcomes, setOutcomes] = useState<OutcomeView[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (kind: Tab, checkpoint = false) => {
    setError(null); checkpoint ? setGenerating(true) : setLoading(true);
    try {
      const [reviewBody, outcomeBody] = await Promise.all([
        requestJson<{ review: ProgressReview }>(`/api/reviews${checkpoint ? "" : `?kind=${kind}`}`, checkpoint ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind }) } : undefined),
        requestJson<{ outcomes: OutcomeView[] }>("/api/outcomes?limit=20"),
      ]);
      setReview(reviewBody.review); setOutcomes(outcomeBody.outcomes);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The review could not be loaded."); }
    finally { setLoading(false); setGenerating(false); }
  }, []);

  useEffect(() => { void load(tab); }, [tab, load]);
  async function updateFeedback(id: string, value: OwnerFeedback) {
    const prior = outcomes;
    setOutcomes((current) => current.map((outcome) => outcome.id === id ? { ...outcome, ownerFeedback: value } : outcome));
    try { const body = await requestJson<{ outcome: OutcomeView }>(`/api/outcomes/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ownerFeedback: value }) }); setOutcomes((current) => current.map((outcome) => outcome.id === id ? body.outcome : outcome)); }
    catch (caught) { setOutcomes(prior); setError(caught instanceof Error ? caught.message : "Feedback could not be saved."); }
  }

  return <div className="pb-12"><header className="mb-6 ps-8 md:ps-0"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-[0.16em] text-kumo-brand">Progress loop</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-kumo-strong">Review</h1><p className="mt-1 max-w-2xl text-sm text-kumo-subtle">A deterministic view of what matters now, grounded in persisted work—not conversation recall.</p></div><Button variant="secondary" size="sm" icon={ArrowClockwiseIcon} disabled={generating} onClick={() => void load(tab, true)}>{generating ? "Generating…" : `Generate ${tab === "daily" ? "brief" : "review"}`}</Button></div><div className="mt-5 flex gap-1 border-b border-kumo-hairline">{(["daily", "weekly"] as const).map((value) => <button key={value} type="button" className={cn("border-b-2 px-3 py-2 text-sm capitalize", tab === value ? "border-kumo-brand font-medium text-kumo-strong" : "border-transparent text-kumo-subtle")} onClick={() => setTab(value)}>{value}</button>)}</div></header>{error && <div role="alert" className="mb-4 rounded-xl border border-kumo-danger/25 bg-kumo-danger/5 px-4 py-3 text-sm text-kumo-danger">{error} <button type="button" className="ms-2 underline" onClick={() => void load(tab)}>Retry</button></div>}{loading ? <div className="grid min-h-64 place-items-center"><Loader size={20} /></div> : review?.kind === "daily" ? <DailyReview review={review} /> : review?.kind === "weekly" ? <WeeklyReview review={review} /> : <div className="rounded-xl border border-dashed border-kumo-line py-12 text-center text-sm text-kumo-subtle">No persisted review state is available.</div>}<Outcomes outcomes={outcomes} onFeedback={(id, value) => void updateFeedback(id, value)} /><p className="mt-8 text-xs text-kumo-subtle">{AGENT_NAME} proposes priorities here but does not mutate skills, preferences, or plans from a review.</p></div>;
}
