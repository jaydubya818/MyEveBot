"use client";

import { Badge, Button, Loader } from "@cloudflare/kumo";
import { ArrowClockwiseIcon, ArrowSquareOutIcon, BrowserIcon, FileIcon, MonitorIcon, PauseIcon, PlayIcon, StopIcon, TerminalWindowIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";

import type { ComputerActionView, ComputerSessionView } from "@/lib/computer-types";
import { LiveComputerView } from "@/components/live-computer-view";
import { cn } from "@/lib/utils";

const ACTIVE = new Set(["provisioning", "ready", "running", "paused"]);
type ControlAction = "pause" | "resume" | "stop" | "takeOver" | "returnControl";
const CONTROL_PROGRESS: Record<ControlAction,string> = { pause:"Pausing Agent…",resume:"Resuming Agent…",stop:"Stopping session…",takeOver:"Acquiring control…",returnControl:"Re-observing environment and returning control…" };

function formatWhen(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function duration(session: ComputerSessionView): string {
  const end = session.completedAt ? new Date(session.completedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((end - new Date(session.startedAt).getTime()) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function ComputerSessionsPanel({ embedded = false }: { embedded?: boolean }) {
  const [sessions, setSessions] = useState<ComputerSessionView[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actions, setActions] = useState<ComputerActionView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<ControlAction | null>(null);
  const [desktopInput, setDesktopInput] = useState(false);

  useEffect(() => { const query=window.matchMedia("(min-width: 768px) and (pointer: fine)");const update=()=>setDesktopInput(query.matches);update();query.addEventListener("change",update);return()=>query.removeEventListener("change",update);}, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/computer-sessions", { cache: "no-store" });
      if (!response.ok) throw new Error("Computer activity could not be loaded.");
      const next = ((await response.json()) as { sessions?: ComputerSessionView[] }).sessions ?? [];
      setSessions(next); setError(null);
      setSelectedId((current) => { const requested=new URLSearchParams(window.location.search).get("session"); return requested&&next.some(session=>session.id===requested)?requested:current&&next.some((session) => session.id === current) ? current : next[0]?.id ?? null; });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Computer activity could not be loaded."); }
  }, []);

  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 5000); return () => window.clearInterval(timer); }, [load]);
  useEffect(() => {
    if (!selectedId) { setActions([]); return; }
    const controller = new AbortController();
    void fetch(`/api/computer-sessions/${selectedId}/actions`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("Session actions could not be loaded."); setActions(((await response.json()) as { actions?: ComputerActionView[] }).actions ?? []); })
      .catch((cause: unknown) => { if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(cause instanceof Error ? cause.message : "Session actions could not be loaded."); });
    return () => controller.abort();
  }, [selectedId, sessions]);

  const selected = sessions?.find((session) => session.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId || selected?.control.controller !== "OWNER") return;
    const version = selected.control.version;
    const heartbeat = async () => {
      try {
        const response = await fetch(`/api/computer-sessions/${selectedId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "heartbeat", expectedVersion: version }),
        });
        if (!response.ok) throw new Error("Owner control lease could not be renewed.");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Owner control lease could not be renewed.");
        await load();
      }
    };
    void heartbeat();
    const timer = window.setInterval(() => void heartbeat(), 10_000);
    return () => window.clearInterval(timer);
  }, [load, selected?.control.controller, selected?.control.version, selectedId]);

  async function update(action: ControlAction) {
    if (!selected) return;
    setPendingAction(action);
    try {
      const response = await fetch(`/api/computer-sessions/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, expectedVersion:selected.control.version }) });
      const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(body?.error?.message ?? "Computer session could not be updated.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Computer session could not be updated."); }
    finally { setPendingAction(null); }
  }

  if (sessions === null && !error) return <div className="flex justify-center py-16"><Loader size={18} /></div>;
  if (sessions === null) return <div className="rounded-2xl border border-kumo-danger/25 bg-kumo-danger/5 p-5"><p className="text-sm font-medium">Computer activity unavailable</p><p className="mt-1 text-sm text-kumo-subtle">{error}</p><Button className="mt-4" size="sm" variant="secondary" icon={ArrowClockwiseIcon} onClick={() => void load()}>Retry</Button></div>;
  const activeCount = sessions.filter((session) => ACTIVE.has(session.status)).length;

  return <div className="flex flex-col gap-5">
    <header className="flex flex-wrap items-end justify-between gap-4 ps-8 md:ps-0"><div>{!embedded && <div className="flex items-center gap-2 text-kumo-subtle"><MonitorIcon className="size-4" /><span className="text-xs font-medium uppercase tracking-[0.14em]">Agent runtime</span></div>}<h2 className={cn("font-semibold tracking-tight", embedded ? "text-base" : "mt-2 text-xl")}>Computer sessions</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-kumo-subtle">Inspect isolated browser and sandbox work, attributable actions, and durable evidence.</p></div><div className="rounded-xl border border-kumo-hairline bg-kumo-tint px-3 py-2 text-xs tabular-nums text-kumo-subtle"><span className="font-semibold text-kumo-strong">{activeCount}</span> active · {sessions.length} recent</div></header>
    {error && <p className="rounded-xl border border-kumo-danger/25 bg-kumo-danger/5 px-4 py-3 text-sm">{error}</p>}
    {sessions.length === 0 ? <div className="rounded-2xl border border-dashed border-kumo-hairline px-6 py-14 text-center"><MonitorIcon className="mx-auto size-7 text-kumo-subtle" /><p className="mt-4 text-sm font-medium">No computer sessions yet</p><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-kumo-subtle">Ask an Agent with computer capabilities to perform browser or sandbox work. Its session and evidence trail will appear here.</p></div> :
      <div className="grid min-h-[560px] overflow-hidden rounded-2xl border border-kumo-hairline lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="border-b border-kumo-hairline bg-kumo-tint/40 p-2 lg:border-b-0 lg:border-e"><ul className="flex gap-2 overflow-x-auto lg:flex-col" aria-label="Computer sessions">{sessions.map((session) => <li key={session.id} className="min-w-64 lg:min-w-0"><button type="button" onClick={() => setSelectedId(session.id)} className={cn("w-full rounded-xl border px-3.5 py-3 text-start transition-colors", selectedId === session.id ? "border-kumo-interact/40 bg-kumo-elevated shadow-sm" : "border-transparent hover:border-kumo-hairline hover:bg-kumo-elevated")}><span className="flex items-center justify-between gap-3"><span className="truncate text-sm font-medium">{session.agentName}</span><span className={cn("size-2 rounded-full", ACTIVE.has(session.status) ? "bg-kumo-success" : session.status === "failed" ? "bg-kumo-danger" : "bg-kumo-inactive")} /></span><span className="mt-1.5 block truncate text-xs text-kumo-subtle">{session.taskTitle ?? session.runTitle ?? session.goalTitle ?? "Unlinked computer work"}</span><span className="mt-2 flex justify-between text-[11px] text-kumo-subtle"><span className="capitalize">{session.status}</span><span>{formatWhen(session.startedAt)}</span></span></button></li>)}</ul></aside>
        {selected && <article className="min-w-0 p-4 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4 border-b border-kumo-hairline pb-5"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{selected.agentName}&rsquo;s computer</h2><Badge variant={selected.status === "failed"||selected.status === "lost" ? "destructive" : "secondary"}>{selected.status}</Badge><Badge variant="secondary">Control: {selected.control.controller}</Badge></div><p className="mt-1 text-xs text-kumo-subtle">Started {formatWhen(selected.startedAt)} · {duration(selected)} · expires {formatWhen(selected.expiresAt)}</p><p className="mt-2 text-sm font-medium" role="status" aria-live="polite">{selected.control.controller==="OWNER"?`You are controlling this computer. ${selected.agentName} is paused.`:selected.control.controller==="AGENT"?`${selected.agentName} is controlling this computer.`:selected.control.controller==="PAUSED"?"Computer is paused.":"Computer control is closed."}</p></div>{ACTIVE.has(selected.status) && selected.control.controller!=="NONE" && <div className="flex flex-wrap gap-2">{selected.control.controller==="AGENT"&&<><Button size="sm" variant="secondary" icon={PauseIcon} disabled={pendingAction!==null} onClick={() => void update("pause")}>Pause Agent</Button><Button size="sm" variant="secondary" disabled={pendingAction!==null||!selected.control.capabilities.humanTakeover||!desktopInput} title={!desktopInput?"Live takeover is available on desktop":!selected.control.capabilities.humanTakeover?"Not supported by the current Computer provider":undefined} onClick={() => void update("takeOver")}>Take Over</Button></>}{selected.control.controller==="PAUSED"&&<><Button size="sm" variant="secondary" icon={PlayIcon} disabled={pendingAction!==null} onClick={() => void update("resume")}>Resume Agent</Button><Button size="sm" variant="secondary" disabled={pendingAction!==null||!selected.control.capabilities.humanTakeover||!desktopInput} title={!desktopInput?"Live takeover is available on desktop":!selected.control.capabilities.humanTakeover?"Not supported by the current Computer provider":undefined} onClick={() => void update("takeOver")}>Take Over</Button></>}{selected.control.controller==="OWNER"&&<><Button size="sm" variant="secondary" disabled={pendingAction!==null} onClick={() => void update("returnControl")}>Return Control</Button><Button size="sm" variant="secondary" icon={PauseIcon} disabled={pendingAction!==null} onClick={() => void update("pause")}>Pause</Button></>}<Button size="sm" variant="secondary" icon={StopIcon} disabled={pendingAction!==null} onClick={() => void update("stop")}>Stop Session</Button></div>}</div>
          {pendingAction&&<p className="mt-4 text-sm text-kumo-subtle" role="status" aria-live="polite">{CONTROL_PROGRESS[pendingAction]}</p>}
          {!selected.control.capabilities.liveView&&<div className="mt-4 rounded-xl border border-kumo-hairline bg-kumo-tint p-3 text-sm"><p className="font-medium">Live view unavailable</p><p className="mt-1 text-kumo-subtle">The current Computer provider supports audited observation, Pause, Resume, and Stop, but not session-bound Human Takeover.</p></div>}
          <LiveComputerView session={selected} desktopInput={desktopInput} />
          {(selected.failureSummary || selected.failureCode) && <div className="mt-4 rounded-xl border border-kumo-danger/25 bg-kumo-danger/5 p-3 text-sm"><p className="font-medium">{selected.failureCode?.replaceAll("_", " ")}</p><p className="mt-1 text-kumo-subtle">{selected.failureSummary}</p></div>}
          <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Goal" value={selected.goalTitle??"Not linked"} /><Metric label="Task" value={selected.taskTitle??"Not linked"} /><Metric label="Run" value={selected.runTitle??"Not linked"} /><Metric label="Provider" value={selected.control.provider} /><Metric label="Computer session" value={selected.id} /><Metric label="Browser session" value={selected.browser?.id??"Not active"} /><Metric label="Current page" value={selected.browser?.currentUrl ?? "No page open"} /><Metric label="Observation freshness" value={`Updated ${formatWhen(selected.control.viewFreshAt)}`} /><Metric label="Actions" value={`${selected.actionCount} / ${selected.resourceLimits.maxBrowserActions}`} /><Metric label="Network" value={String(selected.networkPolicy.mode??"Unknown")} /><Metric label="Runtime limit" value={`${selected.resourceLimits.maxRuntimeSeconds}s`} /><Metric label="Runtime cost" value="Unavailable" /><Metric label="Control version" value={String(selected.control.version)} /><Metric label="Artifacts" value={String(selected.artifacts.length)} /></dl>
          <section className="mt-7"><h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-kumo-subtle">Timeline</h3>{actions.length === 0 ? <p className="mt-3 text-sm text-kumo-subtle">No detailed actions recorded yet.</p> : <ol className="mt-3 divide-y divide-kumo-hairline">{actions.map((action) => <ActionRow key={action.id} action={action} />)}</ol>}</section>
          <section className="mt-7"><h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-kumo-subtle">Artifacts</h3>{selected.artifacts.length === 0 ? <p className="mt-3 text-sm text-kumo-subtle">No durable artifacts captured.</p> : <ul className="mt-3 grid gap-2 sm:grid-cols-2">{selected.artifacts.map((artifact) => <li key={artifact.id}><a className="flex items-center gap-3 rounded-xl border border-kumo-hairline px-3 py-3 hover:bg-kumo-tint" href={`/api/computer-sessions/${selected.id}/artifacts/${artifact.id}`} target="_blank" rel="noreferrer"><FileIcon className="size-4 shrink-0 text-kumo-subtle" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{artifact.filename}</span><span className="text-xs text-kumo-subtle">{artifact.kind} · {Math.max(1, Math.round(artifact.sizeBytes / 1024))} KB</span></span><ArrowSquareOutIcon className="size-3.5 text-kumo-subtle" /></a></li>)}</ul>}</section>
        </article>}
      </div>}
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="min-w-0 rounded-xl bg-kumo-tint p-3"><dt className="text-xs text-kumo-subtle">{label}</dt><dd className="mt-1 truncate text-sm font-semibold capitalize" title={value}>{value}</dd></div>; }
function ActionRow({ action }: { action: ComputerActionView }) { const Icon = action.type.startsWith("browser.") ? BrowserIcon : action.type.startsWith("terminal.") ? TerminalWindowIcon : FileIcon; return <li className="flex gap-3 py-3.5"><span className="mt-0.5 rounded-lg bg-kumo-tint p-2"><Icon className="size-4 text-kumo-subtle" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{action.type.replace(".", " · ")}</p><span className="text-[11px] capitalize text-kumo-subtle">{action.status} · {formatWhen(action.startedAt)}</span></div><p className="mt-1 truncate text-xs text-kumo-subtle">{action.target ?? action.inputSummary}</p>{action.failureSummary && <p className="mt-1 text-xs text-kumo-danger">{action.failureSummary}</p>}</div></li>; }
