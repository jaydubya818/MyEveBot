"use client";

import { Badge, Button, Input, Loader } from "@cloudflare/kumo";
import { ArrowClockwiseIcon, ChatCircleIcon, PauseIcon, StopIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";

import { CONTROL_VIEWS, type ControlCenterSummary, type ControlRunView, type ControlView } from "@/lib/control-center-types";
import { cn } from "@/lib/utils";
import { RoutinesPanel } from "./routines-panel";
import { ActionAuthorityPanel } from "./action-authority-panel";

const VIEW_LABELS: Record<ControlView, string> = {
  working: "Working", waiting: "Waiting", approval: "Needs approval",
  needs_owner:"Needs You", failed: "Failed", completed: "Completed", all: "All",
};

function formatWhen(value: string | null): string {
  if (!value) return "Unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function elapsed(run: ControlRunView): string {
  if (!run.startedAt) return "Not started";
  const end = run.completedAt ? new Date(run.completedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((end - new Date(run.startedAt).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function statusVariant(run: ControlRunView): "secondary" | "destructive" {
  return run.view === "failed" ? "destructive" : "secondary";
}

export function ControlCenterPanel({ onOpenThread }: { onOpenThread: (threadId: string) => void }) {
  const [view, setView] = useState<ControlView>("all");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<ControlCenterSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ view });
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(`/api/control?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Control Center could not be loaded.");
      setData(await response.json() as ControlCenterSummary);
      setError(null);
    } catch {
      setError("Control Center could not be loaded. Check the database and retry.");
    }
  }, [query, view]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), query ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, query]);

  useEffect(() => {
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function act(run: ControlRunView, action: "pause" | "resume" | "cancel" | "retry") {
    setUpdatingId(run.id);
    try {
      const response = await fetch(`/api/task-runs/${encodeURIComponent(run.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? "The run changed before this action could be applied.");
      }
      await load();
      if ((action === "resume" || action === "retry") && run.threadId) onOpenThread(run.threadId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Control action failed.");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div>
      <RoutinesPanel attentionOnly />
      <ActionAuthorityPanel />
      <div className="flex flex-col gap-3 border-b border-kumo-hairline pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-base font-semibold">Execution overview</h3>
          <p className="mt-1 max-w-2xl text-sm text-kumo-subtle">Supervise active work, understand why it is waiting, and stop it safely. Unknown telemetry stays unknown.</p>
        </div>
        <Input aria-label="Search runs" placeholder="Search runs" value={query} onChange={(event) => setQuery(event.target.value)} className="sm:max-w-xs" />
      </div>

      <div className="mt-4 overflow-x-auto">
        <div className="flex min-w-max gap-1" role="tablist" aria-label="Control Center views">
          {CONTROL_VIEWS.map((item) => (
            <button key={item} type="button" role="tab" aria-selected={view === item} onClick={() => setView(item)}
              className={cn("rounded-lg px-3 py-2 text-sm font-medium", view === item ? "bg-kumo-recessed" : "text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default")}
            >{VIEW_LABELS[item]}{data && data.counts[item] > 0 ? ` ${data.counts[item]}` : ""}</button>
          ))}
        </div>
      </div>

      {error && <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-kumo-danger/25 bg-kumo-danger/5 p-3 text-sm"><span>{error}</span><Button size="sm" variant="secondary" onClick={() => void load()}>Retry</Button></div>}
      {data === null ? <div className="flex justify-center py-16"><Loader size={18} /></div> : data.runs.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-kumo-hairline px-5 py-12 text-center">
          <p className="text-sm font-medium">No {view === "all" ? "runs" : VIEW_LABELS[view].toLowerCase()}</p>
          <p className="mt-1 text-sm text-kumo-subtle">{query ? "Try a broader search." : "New delegated work will appear here automatically."}</p>
        </div>
      ) : (
        <ul className="mt-5 grid gap-3">
          {data.runs.map((run) => (
            <li key={run.id} className="rounded-2xl border border-kumo-hairline p-4 sm:p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-semibold">{run.title}</h4>
                    <Badge variant={statusVariant(run)}>{run.taskStatus.replaceAll("_", " ")}</Badge>
                    {run.approvalsPending > 0 && <Badge variant="secondary">{run.approvalsPending} approval pending</Badge>}
                  </div>
                  {(run.objective || run.expectedOutput) && <p className="mt-2 text-sm text-kumo-subtle">{run.objective ?? run.expectedOutput}</p>}
                  {run.waitingReason && <p className="mt-3 rounded-xl bg-kumo-tint px-3 py-2 text-sm"><span className="font-medium">Waiting:</span> {run.waitingReason}</p>}
                  {!run.waitingReason && run.statusReason && <p className="mt-3 rounded-xl bg-kumo-tint px-3 py-2 text-sm"><span className="font-medium">{run.view === "failed" ? "Failure" : "Reason"}:</span> {run.statusReason}</p>}
                  {!run.waitingReason && !run.statusReason && run.currentAction && <p className="mt-3 text-sm"><span className="font-medium">Current:</span> {run.currentAction}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {run.threadId && <Button size="sm" variant="secondary" icon={ChatCircleIcon} onClick={() => onOpenThread(run.threadId!)}>View</Button>}
                  {run.computer && <a className="inline-flex h-8 items-center rounded-lg border border-kumo-line px-3 text-xs font-medium hover:bg-kumo-tint" href={`/computer?session=${encodeURIComponent(run.computer.id)}`}>Watch Computer</a>}
                  {run.availableActions.includes("pause") && <Button size="sm" variant="secondary" icon={PauseIcon} disabled={updatingId === run.id} onClick={() => void act(run, "pause")}>Pause</Button>}
                  {run.availableActions.includes("resume") && <Button size="sm" variant="secondary" icon={ArrowClockwiseIcon} disabled={updatingId === run.id} onClick={() => void act(run, "resume")}>Resume in chat</Button>}
                  {run.availableActions.includes("retry") && <Button size="sm" variant="secondary" icon={ArrowClockwiseIcon} disabled={updatingId === run.id} onClick={() => void act(run, "retry")}>Retry in chat</Button>}
                  {run.availableActions.includes("cancel") && <Button size="sm" variant="secondary" icon={StopIcon} disabled={updatingId === run.id} onClick={() => void act(run, "cancel")}>Cancel</Button>}
                </div>
              </div>

              <dl className="mt-4 grid gap-3 border-t border-kumo-hairline pt-4 text-xs sm:grid-cols-2 xl:grid-cols-6">
                <div><dt className="text-kumo-subtle">Executor</dt><dd className="mt-1 font-medium">{run.agent.name}{run.agent.roleId ? ` · ${run.agent.roleId}` : ""}</dd></div>
                <div><dt className="text-kumo-subtle">Goal</dt><dd className="mt-1 font-medium">{run.goal?.title ?? "Not linked"}</dd></div>
                <div><dt className="text-kumo-subtle">Elapsed</dt><dd className="mt-1 font-medium tabular-nums">{elapsed(run)}</dd></div>
                <div><dt className="text-kumo-subtle">Provider / session</dt><dd className="mt-1 truncate font-medium" title={run.runtimeSessionId ?? undefined}>{run.provider.execution}{run.provider.computer ? ` · ${run.provider.computer}` : ""}<br />{run.runtimeSessionId ?? "Unknown"}</dd></div>
                <div><dt className="text-kumo-subtle">Progress</dt><dd className="mt-1 font-medium">{run.progress ? `${run.progress.completed}/${run.progress.total} ${run.progress.label}` : "Unknown"}</dd></div>
                <div><dt className="text-kumo-subtle">Cost</dt><dd className="mt-1 font-medium">Est. {run.cost.estimatedUsd === null ? "unknown" : `$${run.cost.estimatedUsd.toFixed(2)}`} · actual unknown</dd></div>
              </dl>
              <p className="mt-3 text-[11px] text-kumo-subtle">Updated {formatWhen(run.updatedAt)}{run.computer ? ` · Computer ${run.computer.status} · Control ${run.computer.controller}` : ""}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
