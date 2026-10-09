"use client";

import { Button, Dialog, Input, InputArea, Loader } from "@cloudflare/kumo";
import {
  ArrowClockwiseIcon,
  CalendarBlankIcon,
  CheckCircleIcon,
  CircleIcon,
  FlagIcon,
  HourglassIcon,
  ListChecksIcon,
  LockKeyIcon,
  PlusIcon,
  TargetIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  GoalDetailView,
  GoalFocusItem,
  GoalStatus,
  GoalSummaryView,
  GoalTaskStatus,
} from "@/lib/goal-types";
import { AGENT_NAME, OWNER_NAME } from "@/lib/identity";
import { cn } from "@/lib/utils";

type GoalTab = "active" | "waiting" | "blocked" | "completed" | "archived";

const TABS: { id: GoalTab; label: string; statuses: GoalStatus[] }[] = [
  { id: "active", label: "Active", statuses: ["active", "draft"] },
  { id: "waiting", label: "Waiting", statuses: ["waiting", "paused"] },
  { id: "blocked", label: "Blocked", statuses: ["blocked"] },
  { id: "completed", label: "Completed", statuses: ["completed"] },
  { id: "archived", label: "Archived", statuses: ["archived", "abandoned"] },
];

const TASK_TRANSITIONS: Record<GoalTaskStatus, GoalTaskStatus[]> = {
  todo: ["ready", "in_progress", "waiting", "blocked", "completed", "cancelled", "failed"],
  ready: ["in_progress", "waiting", "blocked", "completed", "cancelled", "failed"],
  in_progress: ["waiting", "blocked", "verification", "completed", "cancelled", "failed"],
  waiting: ["ready", "in_progress", "blocked", "completed", "cancelled", "failed"],
  blocked: ["ready", "in_progress", "waiting", "cancelled", "failed"],
  verification: ["in_progress", "completed", "failed", "cancelled"],
  completed: [],
  cancelled: [],
  failed: ["ready", "in_progress", "cancelled"],
};

interface ApiProblem {
  error?: string | { message?: string };
}

function problemMessage(body: ApiProblem | null, fallback: string): string {
  if (typeof body?.error === "string") return body.error;
  if (typeof body?.error === "object" && typeof body.error.message === "string") return body.error.message;
  return fallback;
}

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body = (await response.json().catch(() => null)) as (T & ApiProblem) | null;
  if (!response.ok) throw new Error(problemMessage(body, "The request could not be completed."));
  if (body === null) throw new Error("The server returned an empty response.");
  return body;
}

function formatDate(value: string | null): string {
  if (!value) return "No target date";
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function relativeDate(value: string): string {
  const elapsedDays = Math.round((new Date(value).getTime() - Date.now()) / 86_400_000);
  if (elapsedDays === 0) return "Today";
  if (elapsedDays === 1) return "Tomorrow";
  if (elapsedDays === -1) return "Yesterday";
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(elapsedDays, "day");
}

function StatusPill({ status }: { status: string }) {
  const warning = status === "blocked" || status === "failed";
  const complete = status === "completed";
  return (
    <span className={cn(
      "rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize",
      complete && "border-kumo-success/25 bg-kumo-success/10 text-kumo-success",
      warning && "border-kumo-danger/25 bg-kumo-danger/10 text-kumo-danger",
      !complete && !warning && "border-kumo-hairline bg-kumo-tint text-kumo-subtle",
    )}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

function ProgressRing({ value, size = "sm" }: { value: number; size?: "sm" | "lg" }) {
  const degrees = Math.max(0, Math.min(value, 100)) * 3.6;
  return (
    <div
      className={cn("grid shrink-0 place-items-center rounded-full", size === "lg" ? "size-16" : "size-9")}
      style={{ background: `conic-gradient(var(--color-kumo-brand) ${degrees}deg, var(--color-kumo-tint) 0deg)` }}
      aria-label={`${value}% complete`}
    >
      <div className={cn("grid place-items-center rounded-full bg-kumo-canvas font-semibold tabular-nums", size === "lg" ? "size-[54px] text-sm" : "size-[30px] text-[10px]")}>{value}%</div>
    </div>
  );
}

function GoalForm({
  initial,
  saving,
  onSubmit,
}: {
  initial?: GoalSummaryView;
  saving: boolean;
  onSubmit: (value: Record<string, unknown>) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [priority, setPriority] = useState<string>(initial?.priority ?? "normal");
  const [targetDate, setTargetDate] = useState(initial?.targetDate ?? "");
  const [criteria, setCriteria] = useState(initial?.successCriteria.join("\n") ?? "");
  return (
    <form
      className="mt-5 flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ title, description, priority, targetDate: targetDate || null, successCriteria: criteria.split("\n").map((item) => item.trim()).filter(Boolean) });
      }}
    >
      <label className="grid gap-1.5 text-sm font-medium">Outcome <Input aria-label="Outcome" autoFocus required value={title} maxLength={200} placeholder="Prepare for my Adobe interview" onChange={(event) => setTitle(event.target.value)} /></label>
      <label className="grid gap-1.5 text-sm font-medium">Why it matters <InputArea aria-label="Why it matters" value={description} minRows={3} maxRows={6} maxLength={10_000} placeholder={`Add enough context for ${AGENT_NAME} to keep the plan grounded.`} onChange={(event) => setDescription(event.target.value)} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1.5 text-sm font-medium">Priority<select className="h-9 rounded-lg border border-kumo-line bg-kumo-base px-3 text-sm" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></label>
        <label className="grid gap-1.5 text-sm font-medium">Target date<Input aria-label="Target date" type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} /></label>
      </div>
      <label className="grid gap-1.5 text-sm font-medium">Success criteria <InputArea aria-label="Success criteria" value={criteria} minRows={2} maxRows={5} placeholder="One measurable result per line" onChange={(event) => setCriteria(event.target.value)} /></label>
      <div className="flex justify-end"><Button type="submit" variant="primary" disabled={saving || title.trim().length === 0}>{saving ? "Saving…" : initial ? "Save changes" : "Create goal"}</Button></div>
    </form>
  );
}

function TaskComposer({ goal, busy, onCreate }: { goal: GoalDetailView; busy: boolean; onCreate: (body: Record<string, unknown>, dependencyId: string) => void }) {
  const [title, setTitle] = useState("");
  const [milestoneId, setMilestoneId] = useState("");
  const [dependencyId, setDependencyId] = useState("");
  return (
    <form className="mt-3 grid gap-2 rounded-xl border border-kumo-hairline bg-kumo-tint p-3" onSubmit={(event) => { event.preventDefault(); onCreate({ kind: "task", title, milestoneId: milestoneId || null, status: dependencyId ? "todo" : "ready" }, dependencyId); setTitle(""); setDependencyId(""); }}>
      <div className="flex gap-2"><Input required value={title} maxLength={240} placeholder="Add the next concrete task" aria-label="Task title" onChange={(event) => setTitle(event.target.value)} /><Button type="submit" size="sm" variant="primary" disabled={busy || title.trim().length === 0}>Add</Button></div>
      {(goal.milestones.length > 0 || goal.tasks.length > 0) && <div className="grid gap-2 sm:grid-cols-2">
        <select aria-label="Task milestone" className="h-8 rounded-lg border border-kumo-line bg-kumo-base px-2 text-xs" value={milestoneId} onChange={(event) => setMilestoneId(event.target.value)}><option value="">No milestone</option>{goal.milestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.title}</option>)}</select>
        <select aria-label="Task dependency" className="h-8 rounded-lg border border-kumo-line bg-kumo-base px-2 text-xs" value={dependencyId} onChange={(event) => setDependencyId(event.target.value)}><option value="">No dependency</option>{goal.tasks.filter((task) => task.status !== "cancelled").map((task) => <option key={task.id} value={task.id}>After: {task.title}</option>)}</select>
      </div>}
    </form>
  );
}

function GoalDetail({ goal, busy, onMutate, onReload }: { goal: GoalDetailView; busy: boolean; onMutate: (method: string, body: Record<string, unknown>) => Promise<unknown>; onReload: () => void }) {
  const [editOpen, setEditOpen] = useState(false);
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const activePlan = goal.plans.find((plan) => plan.status === "active");
  const finalized = ["completed", "abandoned", "archived"].includes(goal.status);
  async function mutate(method: string, body: Record<string, unknown>) {
    await onMutate(method, body);
    onReload();
  }
  const primaryAction = goal.status === "active" ? { label: "Pause", status: "paused" } : (["paused", "blocked", "waiting", "draft"].includes(goal.status) ? { label: "Make active", status: "active" } : null);
  return (
    <article className="min-w-0 pb-12">
      <header className="border-b border-kumo-hairline pb-5">
        <div className="flex items-start justify-between gap-5"><div className="min-w-0"><div className="mb-2 flex flex-wrap items-center gap-2"><StatusPill status={goal.status} /><span className="text-xs capitalize text-kumo-subtle">{goal.priority} priority</span></div><h2 className="text-2xl font-semibold tracking-tight text-kumo-strong">{goal.title}</h2>{goal.description && <p className="mt-2 max-w-2xl text-sm leading-6 text-kumo-subtle">{goal.description}</p>}</div><ProgressRing value={goal.progress} size="lg" /></div>
        {goal.successCriteria.length > 0 && <div className="mt-4 rounded-xl bg-kumo-tint px-3 py-2.5"><p className="text-[11px] font-semibold uppercase tracking-wide text-kumo-subtle">Done means</p><ul className="mt-1.5 space-y-1 text-xs">{goal.successCriteria.map((criterion) => <li key={criterion} className="flex gap-2"><CheckCircleIcon className="mt-0.5 size-3.5 shrink-0 text-kumo-subtle" />{criterion}</li>)}</ul></div>}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-kumo-subtle"><span className="inline-flex items-center gap-1"><CalendarBlankIcon className="size-3.5" />{formatDate(goal.targetDate)}</span><span>·</span><span>{goal.completedTaskCount} of {goal.taskCount} tasks complete</span></div>
        <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => setEditOpen(true)}>Edit goal</Button>{primaryAction && <Button size="sm" variant="secondary" disabled={busy} onClick={() => void mutate("PATCH", { kind: "goal", status: primaryAction.status, reason: `${OWNER_NAME} chose ${primaryAction.label.toLowerCase()} in Goals.` })}>{primaryAction.label}</Button>}{goal.status === "active" && <Button size="sm" variant="secondary" disabled={busy || (goal.taskCount > 0 && goal.progress < 100)} title={goal.taskCount > 0 && goal.progress < 100 ? "Complete or cancel remaining tasks first" : undefined} onClick={() => void mutate("PATCH", { kind: "goal", status: "completed", reason: `${OWNER_NAME} confirmed this goal is complete.` })}>Complete goal</Button>}{["completed", "abandoned"].includes(goal.status) && <Button size="sm" variant="secondary" disabled={busy} onClick={() => void mutate("PATCH", { kind: "goal", status: "archived", reason: `${OWNER_NAME} archived this finalized goal.` })}>Archive</Button>}</div>
      </header>

      {goal.nextAction && <section className="my-5 rounded-2xl border border-kumo-brand/25 bg-kumo-brand/5 p-4"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-kumo-brand"><TargetIcon className="size-4" />Next action</p><p className="mt-2 font-medium text-kumo-strong">{goal.nextAction.taskTitle}</p><p className="mt-1 text-xs text-kumo-subtle">{goal.nextAction.whyNow.join(" · ")}</p></section>}

      <section className="py-5"><div className="flex items-end justify-between gap-4"><div><h3 className="text-sm font-semibold">Plan & milestones</h3><p className="mt-1 text-xs text-kumo-subtle">Previous plan versions stay in the activity history.</p></div>{!finalized && <Button size="sm" variant="ghost" icon={PlusIcon} onClick={() => setMilestoneOpen(true)}>Milestone</Button>}</div>{activePlan ? <div className="mt-3 rounded-xl border border-kumo-hairline p-3"><p className="text-sm font-medium">{activePlan.summary}</p>{activePlan.strategy && <p className="mt-1 text-xs leading-5 text-kumo-subtle">{activePlan.strategy}</p>}<p className="mt-2 text-[11px] text-kumo-subtle">Plan v{activePlan.version}</p></div> : <p className="mt-3 rounded-xl border border-dashed border-kumo-line px-4 py-5 text-sm text-kumo-subtle">No plan yet. Ask {AGENT_NAME} to decompose this goal, or add milestones directly.</p>}{goal.plans.length > 1 && <details className="mt-2 rounded-xl border border-kumo-hairline px-3 py-2 text-xs"><summary className="cursor-pointer font-medium">{goal.plans.length - 1} previous plan {goal.plans.length === 2 ? "version" : "versions"}</summary><ol className="mt-2 space-y-2 text-kumo-subtle">{goal.plans.filter((plan) => plan.status === "superseded").map((plan) => <li key={plan.id}><span className="font-medium text-kumo-default">v{plan.version}</span> · {plan.summary}</li>)}</ol></details>}{goal.milestones.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2">{goal.milestones.map((milestone) => <div key={milestone.id} className="rounded-xl border border-kumo-hairline p-3"><div className="flex items-start justify-between gap-2"><p className="text-sm font-medium">{milestone.title}</p>{finalized ? <StatusPill status={milestone.status} /> : <select aria-label={`Status for ${milestone.title}`} className="h-7 rounded-lg border border-kumo-hairline bg-kumo-base px-2 text-[11px] capitalize" value={milestone.status} disabled={busy} onChange={(event) => void mutate("PATCH", { kind: "milestone", milestoneId: milestone.id, status: event.target.value })}><option value="pending">Pending</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="skipped">Skipped</option></select>}</div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-kumo-tint"><div className="h-full rounded-full bg-kumo-brand" style={{ width: `${milestone.progress}%` }} /></div><p className="mt-2 text-[11px] text-kumo-subtle">{milestone.progress}% · {formatDate(milestone.targetDate)}</p></div>)}</div>}</section>

      <section className="border-t border-kumo-hairline py-5"><div><h3 className="text-sm font-semibold">Tasks</h3><p className="mt-1 text-xs text-kumo-subtle">{finalized ? "This goal is finalized; its execution record is read-only." : "Only executable, dependency-free work enters Focus."}</p></div>{!finalized && <TaskComposer goal={goal} busy={busy} onCreate={(body, dependencyId) => void (async () => { const result = await onMutate("POST", body) as { task?: { id: string } }; if (dependencyId && result.task?.id) await onMutate("POST", { kind: "dependency", taskId: result.task.id, dependsOnTaskId: dependencyId }); onReload(); })()} />}{goal.tasks.length === 0 ? <p className="py-8 text-center text-sm text-kumo-subtle">No tasks yet. A goal becomes actionable when the first concrete task is added.</p> : <ul className="mt-3 divide-y divide-kumo-hairline">{goal.tasks.map((task) => { const milestone = goal.milestones.find((item) => item.id === task.milestoneId); return <li key={task.id} className="flex items-start gap-3 py-3"><button type="button" className="mt-0.5 text-kumo-subtle hover:text-kumo-brand disabled:opacity-50" disabled={finalized || busy || task.status === "completed" || !TASK_TRANSITIONS[task.status].includes("completed") || task.blockedByDependencies || task.unavailableCapabilities.length > 0} aria-label={`Complete ${task.title}`} onClick={() => void mutate("PATCH", { kind: "task", taskId: task.id, status: "completed", reason: `${OWNER_NAME} completed this task in Goals.` })}>{task.status === "completed" ? <CheckCircleIcon weight="fill" className="size-5 text-kumo-success" /> : task.blockedByDependencies || task.unavailableCapabilities.length > 0 ? <LockKeyIcon className="size-5" /> : <CircleIcon className="size-5" />}</button><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className={cn("text-sm font-medium", task.status === "completed" && "text-kumo-subtle line-through")}>{task.title}</p><StatusPill status={task.status} /></div><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-kumo-subtle">{milestone && <span>{milestone.title}</span>}{task.dueAt && <span>{relativeDate(task.dueAt)}</span>}{task.dependencyIds.length > 0 && <span>{task.dependencyIds.length} {task.dependencyIds.length === 1 ? "dependency" : "dependencies"}</span>}</div>{task.requiredCapabilities.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{task.requiredCapabilities.map((capability) => <span key={capability} className={cn("rounded bg-kumo-tint px-1.5 py-0.5 font-mono text-[10px]", task.unavailableCapabilities.includes(capability) && "bg-kumo-danger/10 text-kumo-danger")}>{capability}</span>)}</div>}</div>{!finalized && TASK_TRANSITIONS[task.status].length > 0 && <select aria-label={`Status for ${task.title}`} className="h-8 max-w-28 rounded-lg border border-kumo-hairline bg-kumo-base px-2 text-xs capitalize" value="" disabled={busy} onChange={(event) => { if (event.target.value) void mutate("PATCH", { kind: "task", taskId: task.id, status: event.target.value, reason: `${OWNER_NAME} moved the task to ${event.target.value}.` }); }}><option value="">Move to…</option>{TASK_TRANSITIONS[task.status].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select>}</li>; })}</ul>}</section>

      <section className="border-t border-kumo-hairline py-5"><h3 className="text-sm font-semibold">Activity</h3>{(goal.threadIds.length > 0 || goal.linkedRunIds.length > 0) && <div className="mt-3 flex flex-wrap gap-2">{goal.threadIds.map((threadId) => <a key={threadId} href={`/?thread=${encodeURIComponent(threadId)}`} className="rounded-lg border border-kumo-hairline px-2.5 py-1.5 text-xs hover:bg-kumo-tint">Open related conversation</a>)}{goal.linkedRunIds.map((runId) => <a key={runId} href={`/manage/activity?task=${encodeURIComponent(runId)}`} className="rounded-lg border border-kumo-hairline px-2.5 py-1.5 text-xs hover:bg-kumo-tint">Open linked run</a>)}</div>}{goal.events.length === 0 ? <p className="mt-3 text-sm text-kumo-subtle">No recorded activity.</p> : <ol className="mt-3 space-y-3">{goal.events.slice(0, 20).map((event) => <li key={event.id} className="grid grid-cols-[18px_1fr] gap-2 text-sm"><span className="mt-1.5 size-2 rounded-full bg-kumo-line" /><div><p>{event.summary}</p><p className="mt-0.5 text-[11px] text-kumo-subtle">{new Date(event.occurredAt).toLocaleString()}</p>{event.rationale.length > 0 && <p className="mt-1 text-xs text-kumo-subtle">{event.rationale.join(" · ")}</p>}</div></li>)}</ol>}</section>

      <Dialog.Root open={editOpen} onOpenChange={setEditOpen}><Dialog size="base" className="p-6"><Dialog.Title>Edit goal</Dialog.Title><Dialog.Description className="mt-1 text-sm text-kumo-subtle">Keep the outcome and finish line explicit.</Dialog.Description><GoalForm initial={goal} saving={busy} onSubmit={(body) => void mutate("PATCH", { kind: "goal", ...body }).then(() => setEditOpen(false))} /></Dialog></Dialog.Root>
      <Dialog.Root open={milestoneOpen} onOpenChange={setMilestoneOpen}><Dialog size="sm" className="p-6"><Dialog.Title>Add milestone</Dialog.Title><Dialog.Description className="mt-1 text-sm text-kumo-subtle">A meaningful checkpoint, not a loose category.</Dialog.Description><form className="mt-5 grid gap-4" onSubmit={(event) => { event.preventDefault(); void mutate("POST", { kind: "milestone", title: milestoneTitle, position: goal.milestones.length }).then(() => { setMilestoneTitle(""); setMilestoneOpen(false); }); }}><label className="grid gap-1.5 text-sm font-medium">Milestone<Input aria-label="Milestone" autoFocus required value={milestoneTitle} maxLength={200} placeholder="Complete two mock interviews" onChange={(event) => setMilestoneTitle(event.target.value)} /></label><div className="flex justify-end"><Button type="submit" variant="primary" disabled={busy || milestoneTitle.trim().length === 0}>Add milestone</Button></div></form></Dialog></Dialog.Root>
    </article>
  );
}

export function GoalsPanel() {
  const [goals, setGoals] = useState<GoalSummaryView[] | null>(null);
  const [focus, setFocus] = useState<GoalFocusItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GoalDetailView | null>(null);
  const [tab, setTab] = useState<GoalTab>("active");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const loadGoals = useCallback(async () => {
    try {
      setError(null);
      const [goalBody, focusBody] = await Promise.all([
        jsonRequest<{ goals: GoalSummaryView[] }>("/api/goals"),
        jsonRequest<{ focus: GoalFocusItem[] }>("/api/goals/focus"),
      ]);
      setGoals(goalBody.goals);
      setFocus(focusBody.focus);
      setSelectedId((current) => {
        const requested = new URLSearchParams(window.location.search).get("goal");
        if (requested && goalBody.goals.some((goal) => goal.id === requested)) return requested;
        return current && goalBody.goals.some((goal) => goal.id === current)
          ? current
          : goalBody.goals.find((goal) => goal.status === "active")?.id ?? goalBody.goals[0]?.id ?? null;
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Goals could not be loaded.");
      setGoals([]);
    }
  }, []);

  const loadDetail = useCallback(async () => {
    if (!selectedId) { setDetail(null); return; }
    try {
      const body = await jsonRequest<{ goal: GoalDetailView }>(`/api/goals/${encodeURIComponent(selectedId)}`);
      setDetail(body.goal);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "This goal could not be loaded.");
    }
  }, [selectedId]);

  useEffect(() => { void loadGoals(); }, [loadGoals]);
  useEffect(() => { setDetail(null); void loadDetail(); }, [loadDetail]);
  useEffect(() => {
    const selected = goals?.find((goal) => goal.id === selectedId);
    if (!selected) return;
    const current = TABS.find((item) => item.id === tab)!;
    if (current.statuses.includes(selected.status)) return;
    const destination = TABS.find((item) => item.statuses.includes(selected.status));
    if (destination) setTab(destination.id);
  }, [goals, selectedId, tab]);

  async function mutate(method: string, body: Record<string, unknown>): Promise<unknown> {
    if (!selectedId) return null;
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = await jsonRequest<unknown>(`/api/goals/${encodeURIComponent(selectedId)}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const changedGoal = (result as { goal?: GoalDetailView } | null)?.goal;
      if (changedGoal) {
        const destination = TABS.find((item) => item.statuses.includes(changedGoal.status));
        if (destination) setTab(destination.id);
      }
      setNotice("Saved");
      window.setTimeout(() => setNotice(null), 2200);
      return result;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The change could not be saved.");
      throw reason;
    } finally { setBusy(false); }
  }

  async function reloadAll() { await Promise.all([loadGoals(), loadDetail()]); }

  const visibleGoals = useMemo(() => {
    const statuses = TABS.find((item) => item.id === tab)!.statuses;
    return (goals ?? []).filter((goal) => statuses.includes(goal.status));
  }, [goals, tab]);

  if (goals === null) return <div className="grid min-h-[60vh] place-items-center"><div className="text-center"><Loader size={20} /><p className="mt-3 text-sm text-kumo-subtle">Organizing your goals…</p></div></div>;
  if (error && goals.length === 0) return <div className="mx-auto mt-20 max-w-md rounded-2xl border border-kumo-danger/25 bg-kumo-danger/5 p-6 text-center"><WarningCircleIcon className="mx-auto size-6 text-kumo-danger" /><h2 className="mt-3 font-semibold">Goals are unavailable</h2><p className="mt-2 text-sm text-kumo-subtle">{error}</p><Button className="mt-5" size="sm" variant="secondary" icon={ArrowClockwiseIcon} onClick={() => void loadGoals()}>Try again</Button></div>;

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><TargetIcon weight="duotone" className="size-5 text-kumo-brand" /><h1 className="text-xl font-semibold tracking-tight">Goals</h1></div><p className="mt-1 text-sm text-kumo-subtle">Your outcomes, current plan, and clearest next move.</p></div><Button variant="primary" size="sm" icon={PlusIcon} onClick={() => setCreateOpen(true)}>New goal</Button></div>

      {focus.length > 0 && <section className="mb-5 overflow-hidden rounded-2xl border border-kumo-brand/20 bg-kumo-brand/5"><div className="flex items-center justify-between border-b border-kumo-brand/10 px-4 py-3"><div className="flex items-center gap-2"><FlagIcon weight="fill" className="size-4 text-kumo-brand" /><h2 className="text-sm font-semibold">Focus now</h2></div><span className="text-[11px] text-kumo-subtle">Executable next actions only</span></div><div className="grid divide-y divide-kumo-brand/10 md:grid-cols-3 md:divide-x md:divide-y-0">{focus.slice(0, 3).map((item, index) => <button key={item.taskId} type="button" className="p-4 text-start hover:bg-kumo-brand/5" onClick={() => { setSelectedId(item.goalId); setTab("active"); }}><p className="text-[11px] font-medium text-kumo-brand">{index === 0 ? "Best next move" : `Next · ${index + 1}`}</p><p className="mt-1 line-clamp-2 text-sm font-medium">{item.taskTitle}</p><p className="mt-1 truncate text-xs text-kumo-subtle">{item.goalTitle}</p></button>)}</div></section>}

      {error && <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-kumo-danger/25 bg-kumo-danger/5 px-4 py-3 text-sm"><span>{error}</span><button type="button" className="text-xs font-medium" onClick={() => setError(null)}>Dismiss</button></div>}
      {notice && <div role="status" className="fixed bottom-5 end-5 z-50 rounded-lg bg-kumo-strong px-3 py-2 text-xs font-medium text-kumo-canvas shadow-lg">{notice}</div>}

      {goals.length === 0 ? <section className="grid min-h-[52vh] place-items-center rounded-2xl border border-dashed border-kumo-line bg-kumo-tint/40 p-6 text-center"><div className="max-w-md"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-kumo-brand/10 text-kumo-brand"><TargetIcon className="size-6" /></div><h2 className="mt-4 text-lg font-semibold">Turn an intention into forward motion</h2><p className="mt-2 text-sm leading-6 text-kumo-subtle">Create a goal here or tell {AGENT_NAME}, “Prepare me for my Adobe interview next week.” {AGENT_NAME} can build the plan, milestones, tasks, and next action with you.</p><Button className="mt-5" variant="primary" onClick={() => setCreateOpen(true)}>Create your first goal</Button></div></section> : <><nav className="mb-4 flex gap-1 overflow-x-auto border-b border-kumo-hairline" aria-label="Goal status">{TABS.map((item) => { const matching = goals.filter((goal) => item.statuses.includes(goal.status)); const count = matching.length; return <button key={item.id} type="button" aria-current={tab === item.id ? "page" : undefined} className={cn("relative shrink-0 px-3 py-2 text-sm text-kumo-subtle hover:text-kumo-default", tab === item.id && "font-medium text-kumo-strong after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-kumo-brand")} onClick={() => { setTab(item.id); setSelectedId(matching[0]?.id ?? null); }}>{item.label}<span className="ms-1.5 text-[11px]">{count}</span></button>; })}</nav><div className="grid min-h-[55vh] gap-6 lg:grid-cols-[280px_minmax(0,1fr)]"><aside className="lg:border-e lg:border-kumo-hairline lg:pe-4">{visibleGoals.length === 0 ? <div className="rounded-xl border border-dashed border-kumo-line p-5 text-center text-sm text-kumo-subtle"><HourglassIcon className="mx-auto mb-2 size-5" />No {tab} goals.</div> : <ul className="space-y-1">{visibleGoals.map((goal) => <li key={goal.id}><button type="button" className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start hover:bg-kumo-tint", selectedId === goal.id && "bg-kumo-tint ring-1 ring-kumo-hairline")} onClick={() => setSelectedId(goal.id)}><ProgressRing value={goal.progress} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{goal.title}</p><p className="mt-1 flex items-center gap-1 truncate text-[11px] text-kumo-subtle"><ListChecksIcon className="size-3" />{goal.completedTaskCount}/{goal.taskCount} · {formatDate(goal.targetDate)}</p></div></button></li>)}</ul>}</aside><div>{selectedId === null ? <div className="grid min-h-80 place-items-center text-sm text-kumo-subtle">Choose a goal to inspect.</div> : detail === null || detail.id !== selectedId ? <div className="grid min-h-80 place-items-center"><Loader size={18} /></div> : <GoalDetail goal={detail} busy={busy} onMutate={mutate} onReload={() => void reloadAll()} />}</div></div></>}

      <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}><Dialog size="base" className="p-6"><Dialog.Title>Create a goal</Dialog.Title><Dialog.Description className="mt-1 text-sm text-kumo-subtle">Name the outcome clearly. {AGENT_NAME} can help turn it into a plan after it exists.</Dialog.Description><GoalForm saving={busy} onSubmit={(body) => void (async () => { setBusy(true); setError(null); try { const result = await jsonRequest<{ goal: GoalDetailView }>("/api/goals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); setCreateOpen(false); setSelectedId(result.goal.id); setTab("active"); await loadGoals(); setDetail(result.goal); setNotice("Goal created"); window.setTimeout(() => setNotice(null), 2200); } catch (reason) { setError(reason instanceof Error ? reason.message : "The goal could not be created."); } finally { setBusy(false); } })()} /></Dialog></Dialog.Root>
    </div>
  );
}
