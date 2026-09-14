"use client";

import { Badge, Button } from "@cloudflare/kumo";
import { ArrowSquareOutIcon, CheckCircleIcon, ClockIcon, StopIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";

import type { TaskRunView } from "@/lib/task-types";

function statusVariant(status: TaskRunView["status"]): "secondary" | "destructive" {
  return status === "failed" || status === "cancelled" ? "destructive" : "secondary";
}

export function TaskRunCard({ threadId }: { threadId: string }) {
  const [task, setTask] = useState<TaskRunView | null>(null);
  const [updating, setUpdating] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/task-runs?threadId=${encodeURIComponent(threadId)}`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const body = (await response.json()) as { tasks?: TaskRunView[] };
    setTask(body.tasks?.[0] ?? null);
  }, [threadId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), task?.status === "running" ? 2500 : 10000);
    return () => window.clearInterval(timer);
  }, [load, task?.status]);

  if (task === null) return null;
  const passed = task.checks.filter((check) => check.status === "passed").length;
  const completeSpecialists = task.specialists.filter((specialist) => specialist.status === "completed").length;

  async function cancel() {
    const taskId = task?.id;
    if (taskId === undefined) return;
    setUpdating(true);
    try {
      const response = await fetch(`/api/task-runs/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (response.ok) {
        const body = (await response.json()) as { task: TaskRunView };
        setTask(body.task);
      }
    } finally {
      setUpdating(false);
    }
  }

  return (
    <MessageTaskShell>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{task.title}</p>
          <p className="mt-1 text-xs text-kumo-subtle">
            {completeSpecialists}/{task.guardrails.maxSpecialists} specialists · {passed}/{task.checks.length} checks ·{" "}
            {task.usage.modelSteps}/{task.guardrails.maxModelSteps} steps · ${task.usage.estimatedCostUsd.toFixed(2)}/${task.guardrails.maxEstimatedCostUsd}
          </p>
        </div>
        <Badge variant={statusVariant(task.status)}>{task.status.replace("_", " ")}</Badge>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-kumo-recessed" aria-hidden>
        <div
          className="h-full rounded-full bg-kumo-interact transition-[width]"
          style={{ width: `${task.checks.length === 0 ? 0 : (passed / task.checks.length) * 100}%` }}
        />
      </div>
      {task.statusReason && <p className="mt-2 text-xs text-kumo-danger">{task.statusReason}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs text-kumo-subtle">
          {task.status === "completed" ? (
            <CheckCircleIcon className="size-3.5 text-kumo-success" aria-hidden />
          ) : (
            <ClockIcon className="size-3.5" aria-hidden />
          )}
          {Math.round(task.guardrails.maxDurationSeconds / 60)}-minute Balanced run
        </span>
        <div className="flex gap-2">
          {task.status === "running" && (
            <Button
              variant="secondary"
              size="sm"
              icon={StopIcon}
              disabled={updating}
              onClick={() => void cancel()}
            >
              Stop
            </Button>
          )}
          <a
            href={`/manage/activity?task=${encodeURIComponent(task.id)}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-kumo-interact hover:bg-kumo-tint"
          >
            Review evidence
            <ArrowSquareOutIcon className="size-3.5" aria-hidden />
          </a>
        </div>
      </div>
    </MessageTaskShell>
  );
}

function MessageTaskShell({ children }: { children: React.ReactNode }) {
  return (
    <section
      aria-label="Task progress"
      className="rounded-2xl border border-kumo-hairline bg-kumo-canvas p-4 shadow-sm"
    >
      {children}
    </section>
  );
}
