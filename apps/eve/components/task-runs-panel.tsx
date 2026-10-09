"use client";

import { Badge, Button, Loader } from "@cloudflare/kumo";
import {
  ArrowClockwiseIcon,
  ArrowSquareOutIcon,
  CheckCircleIcon,
  CircleIcon,
  ClockIcon,
  FileIcon,
  StopIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";

import type { TaskCheckView, TaskRunView } from "@/lib/task-types";
import { AGENT_NAME } from "@/lib/identity";
import { cn } from "@/lib/utils";

function formatWhen(value: string | null): string {
  if (value === null) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function CheckStateIcon({ check }: { check: TaskCheckView }) {
  if (check.status === "passed") return <CheckCircleIcon className="size-4 text-kumo-success" aria-hidden />;
  if (check.status === "failed" || check.status === "blocked") {
    return <WarningCircleIcon className="size-4 text-kumo-danger" aria-hidden />;
  }
  return <CircleIcon className="size-4 text-kumo-subtle" aria-hidden />;
}

export function TaskRunsPanel({ onOpenThread }: { onOpenThread: (threadId: string) => void }) {
  const [tasks, setTasks] = useState<TaskRunView[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/task-runs", { cache: "no-store" });
      if (!response.ok) throw new Error("Task activity could not be loaded.");
      const body = (await response.json()) as { tasks?: TaskRunView[] };
      const next = body.tasks ?? [];
      setTasks(next);
      setError(null);
      setSelectedId((current) => {
        const requested = new URLSearchParams(window.location.search).get("task");
        if (requested && next.some((task) => task.id === requested)) return requested;
        if (current && next.some((task) => task.id === current)) return current;
        return next[0]?.id ?? null;
      });
    } catch {
      setError("Task activity could not be loaded. Check the database and retry.");
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(timer);
  }, [load]);

  const selected = tasks?.find((task) => task.id === selectedId) ?? null;
  const selectedThreadId = selected?.threadId ?? null;

  async function update(action: "cancel" | "retry") {
    if (selected === null) return;
    setUpdating(true);
    try {
      const response = await fetch(`/api/task-runs/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? "Task update failed.");
      }
      await load();
      if (action === "retry" && selectedThreadId !== null) onOpenThread(selectedThreadId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Task update failed.");
    } finally {
      setUpdating(false);
    }
  }

  if (error !== null && tasks === null) {
    return <p className="rounded-xl border border-kumo-danger/25 bg-kumo-danger/5 p-4 text-sm">{error}</p>;
  }
  if (tasks === null) return <div className="flex justify-center py-12"><Loader size={18} /></div>;
  if (tasks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-kumo-hairline px-5 py-10 text-center">
        <p className="text-sm font-medium">No audited tasks yet</p>
        <p className="mt-1 text-sm text-kumo-subtle">Ask {AGENT_NAME} to run the local and isolated-preview self-test.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)]">
      <ul className="flex flex-col gap-2" aria-label="Task runs">
        {tasks.map((task) => (
          <li key={task.id}>
            <button
              type="button"
              className={cn(
                "w-full rounded-xl border px-3 py-3 text-start transition-colors",
                task.id === selectedId
                  ? "border-kumo-interact/40 bg-kumo-tint"
                  : "border-kumo-hairline hover:bg-kumo-tint",
              )}
              onClick={() => setSelectedId(task.id)}
            >
              <span className="block truncate text-sm font-medium">{task.title}</span>
              <span className="mt-1 flex items-center justify-between gap-2 text-xs text-kumo-subtle">
                <span>{formatWhen(task.updatedAt)}</span>
                <span>{task.status.replace("_", " ")}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {selected !== null && (
        <article className="min-w-0 rounded-2xl border border-kumo-hairline p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-kumo-hairline pb-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{selected.title}</h3>
                <Badge variant={selected.status === "failed" || selected.status === "cancelled" ? "destructive" : "secondary"}>
                  {selected.status.replace("_", " ")}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-kumo-subtle">
                Started {formatWhen(selected.startedAt)} · updated {formatWhen(selected.updatedAt)}
              </p>
            </div>
            <div className="flex gap-2">
              {selectedThreadId !== null && (
                <Button variant="secondary" size="sm" onClick={() => onOpenThread(selectedThreadId)}>
                  Open chat
                </Button>
              )}
              {selected.goalId !== null && (
                <a
                  href={`/goals?goal=${encodeURIComponent(selected.goalId)}`}
                  className="inline-flex h-8 items-center rounded-lg border border-kumo-line px-3 text-xs font-medium hover:bg-kumo-tint"
                >
                  Open goal
                </a>
              )}
              {selected.status === "running" && (
                <Button variant="secondary" size="sm" icon={StopIcon} disabled={updating} onClick={() => void update("cancel")}>
                  Stop
                </Button>
              )}
              {selected.status === "failed" && (
                <Button variant="secondary" size="sm" icon={ArrowClockwiseIcon} disabled={updating} onClick={() => void update("retry")}>
                  Retry in chat
                </Button>
              )}
            </div>
          </div>

          {error && <p className="mt-4 text-sm text-kumo-danger">{error}</p>}
          {selected.statusReason && <p className="mt-4 rounded-xl bg-kumo-tint p-3 text-sm">{selected.statusReason}</p>}

          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Time limit" value={`${Math.round(selected.guardrails.maxDurationSeconds / 60)} min`} icon={ClockIcon} />
            <Metric label="Specialists" value={`${selected.specialists.filter((item) => item.status === "completed").length}/${selected.guardrails.maxSpecialists}`} icon={CheckCircleIcon} />
            <Metric label="Model steps" value={`${selected.usage.modelSteps}/${selected.guardrails.maxModelSteps}`} icon={CircleIcon} />
            <Metric label="Est. cost" value={`$${selected.usage.estimatedCostUsd.toFixed(2)}/$${selected.guardrails.maxEstimatedCostUsd}`} icon={CircleIcon} />
          </dl>

          <section className="mt-6">
            <h4 className="text-sm font-semibold">Specialists</h4>
            <ul className="mt-2 grid gap-2 sm:grid-cols-3">
              {selected.specialists.map((specialist) => (
                <li key={specialist.role} className="rounded-xl bg-kumo-tint p-3">
                  <p className="text-sm font-medium">{specialist.label}</p>
                  <p className="mt-1 text-xs text-kumo-subtle">
                    {specialist.status} · attempt {specialist.attempts}/{1 + selected.guardrails.maxRetriesPerSpecialist}
                  </p>
                  {(specialist.error || specialist.summary) && (
                    <p className="mt-2 line-clamp-3 text-xs">{specialist.error ?? specialist.summary}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-6">
            <h4 className="text-sm font-semibold">Acceptance checks</h4>
            <ul className="mt-2 divide-y divide-kumo-hairline">
              {selected.checks.map((check) => (
                <li key={check.id} className="flex gap-3 py-3">
                  <CheckStateIcon check={check} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{check.label}</p>
                    <p className="mt-0.5 text-xs text-kumo-subtle">
                      {check.environment} · {check.artifactCount} evidence {check.artifactCount === 1 ? "item" : "items"}
                    </p>
                    {check.resultSummary && <p className="mt-1 text-xs">{check.resultSummary}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-6">
            <h4 className="text-sm font-semibold">Stored evidence</h4>
            {selected.artifacts.length === 0 ? (
              <p className="mt-2 text-sm text-kumo-subtle">No evidence stored yet.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {selected.artifacts.map((artifact) => (
                  <li key={artifact.id}>
                    <a
                      href={`/api/task-runs/${selected.id}/artifacts/${artifact.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 rounded-xl border border-kumo-hairline px-3 py-2.5 hover:bg-kumo-tint"
                    >
                      <FileIcon className="size-4 shrink-0 text-kumo-subtle" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-sm">{artifact.filename}</span>
                      <span className="text-xs text-kumo-subtle">{Math.max(1, Math.round(artifact.sizeBytes / 1024))} KB</span>
                      <ArrowSquareOutIcon className="size-3.5 text-kumo-subtle" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </article>
      )}
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof ClockIcon }) {
  return (
    <div className="rounded-xl bg-kumo-tint p-3">
      <dt className="flex items-center gap-1.5 text-xs text-kumo-subtle"><Icon className="size-3.5" aria-hidden />{label}</dt>
      <dd className="mt-1 text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
