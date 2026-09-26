"use client";

import { useEffect, useState } from "react";
import type { EngineeringWorkerProjection } from "@/lib/engineering/worker-projection";
import { routeLabel, type RoutingSnapshot } from "./routing-summary";

export type ChatEngineeringWork = { id: string; title: string; repository: string };
type RouteState =
  | { workId: string; kind: "loading" }
  | { workId: string; kind: "ready"; routing: RoutingSnapshot; projection: EngineeringWorkerProjection | null }
  | { workId: string; kind: "error"; message: string };

export function ChatWorkSelector({
  selected,
  onSelect,
}: {
  selected: ChatEngineeringWork | null;
  onSelect: (work: ChatEngineeringWork | null) => void;
}) {
  const [work, setWork] = useState<ChatEngineeringWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [routeState, setRouteState] = useState<RouteState | null>(null);
  const [routeRetry, setRouteRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void fetch("/api/engineering/work", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Work could not be loaded.");
        const body = await response.json().catch(() => null) as { work?: unknown } | null;
        if (!body || !Array.isArray(body.work) || !body.work.every((item) =>
          item && typeof item.id === "string" && typeof item.title === "string" && typeof item.repository === "string"
        )) throw new Error("Work returned an incomplete list.");
        return body.work.map((item) => ({ id: item.id as string, title: item.title as string, repository: item.repository as string }));
      })
      .then((items) => {
        if (!controller.signal.aborted) setWork(items);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Work could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [retry]);

  useEffect(() => {
    if (loading || error || !selected) return;
    const current = work.find((item) => item.id === selected.id);
    if (!current) onSelect(null);
    else if (current.title !== selected.title || current.repository !== selected.repository) onSelect(current);
  }, [error, loading, onSelect, selected, work]);

  useEffect(() => {
    if (!selected) {
      setRouteState(null);
      return;
    }
    const workId = selected.id;
    let disposed = false;
    let inFlight: AbortController | null = null;
    setRouteState({ workId, kind: "loading" });
    async function refreshRoute() {
      if (disposed || inFlight) return;
      const controller = new AbortController();
      inFlight = controller;
      const timeout = window.setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch(`/api/engineering/work/${encodeURIComponent(workId)}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Routing status could not be loaded.");
        const body = await response.json().catch(() => null) as {
          routing?: RoutingSnapshot;
          projection?: EngineeringWorkerProjection;
        } | null;
        if (!body?.routing || !("decision" in body.routing) || !Array.isArray(body.routing.transitions) || !Array.isArray(body.routing.runs))
          throw new Error("Routing status is incomplete.");
        if (controller.signal.aborted) throw new Error("Routing status timed out.");
        const projection = body.projection?.workId === workId &&
          typeof body.projection.status === "string" && typeof body.projection.nextStep === "string" &&
          Array.isArray(body.projection.pendingDecisions)
          ? body.projection : null;
        if (!disposed) setRouteState({ workId, kind: "ready", routing: body.routing, projection });
      } catch (reason) {
        if (!disposed) setRouteState({ workId, kind: "error", message: controller.signal.aborted ? "Routing status timed out." : reason instanceof Error ? reason.message : "Routing status could not be loaded." });
      } finally {
        window.clearTimeout(timeout);
        if (inFlight === controller) inFlight = null;
      }
    }
    void refreshRoute();
    const refreshVisible = () => { if (document.visibilityState === "visible") void refreshRoute(); };
    const interval = window.setInterval(refreshVisible, 15_000);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      disposed = true;
      inFlight?.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [selected?.id, routeRetry]);

  // A previous request may settle before React runs its cleanup. Never render
  // its route under a newly selected Work, even for one frame.
  const visibleRoute = selected && routeState?.workId === selected.id ? routeState : selected ? { workId: selected.id, kind: "loading" as const } : null;

  return (
    <section aria-label="Engineering Work context" className="mx-10 mt-3 rounded-xl border border-kumo-hairline bg-kumo-elevated px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">Work context for this thread</span>
        <a href={selected ? `/work?id=${encodeURIComponent(selected.id)}` : "/work"} className="font-medium text-kumo-brand underline-offset-2 hover:underline">Open Work</a>
      </div>
      {selected && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 break-words text-kumo-default">Selected: <span className="font-medium">{selected.title}</span></p>
          <button type="button" className="min-h-9 font-medium text-kumo-brand underline underline-offset-2" onClick={() => onSelect(null)}>Clear</button>
        </div>
      )}
      {selected && <div className="mt-2 border-t border-kumo-hairline pt-2 text-kumo-subtle">
        {visibleRoute?.kind === "ready" && visibleRoute.projection && <div className="mb-2">
          <p><span className="font-medium text-kumo-default">Status:</span> {visibleRoute.projection.status}</p>
          <p className="mt-1 break-words"><span className="font-medium text-kumo-default">Next:</span> {visibleRoute.projection.nextStep}</p>
          {visibleRoute.projection.pendingDecisions.length > 0 && <p className="mt-1 text-kumo-warning">Needs You: {visibleRoute.projection.pendingDecisions.length}</p>}
          {visibleRoute.projection.nativeDevelopment && <p className="mt-1 break-words">
            Native development: {visibleRoute.projection.nativeDevelopment.label}
            {!visibleRoute.projection.nativeDevelopment.current && " · not current for execution"}
            {visibleRoute.projection.nativeDevelopment.candidateSha &&
              ` · candidate ${visibleRoute.projection.nativeDevelopment.candidateSha.slice(0, 12)}`}
          </p>}
        </div>}
        {visibleRoute?.kind === "loading" ? <p role="status">Loading route status…</p> : visibleRoute?.kind === "error" ? <div role="alert" className="flex flex-wrap items-center justify-between gap-2 text-kumo-warning"><span>{visibleRoute.message}</span><button type="button" className="min-h-9 font-medium underline underline-offset-2" onClick={() => setRouteRetry((value) => value + 1)}>Retry route status</button></div> : visibleRoute?.kind === "ready" && visibleRoute.routing.decision ? <>
          <p className="font-medium text-kumo-default">{visibleRoute.routing.decision.status === "PROPOSED" ? "Proposed" : visibleRoute.routing.decision.status === "STALE" ? "Stale recommendation" : "Admitted"}: {routeLabel(visibleRoute.routing.decision.selectedRoute)}</p>
          {visibleRoute.routing.decision.status === "PROPOSED" && <p className="mt-1">Recommendation only; no route admitted.</p>}
          <p className="mt-1 line-clamp-2 break-words">Why: {visibleRoute.routing.decision.reason}</p>
          {visibleRoute.routing.runs.length > 0 && <p className="mt-1">Latest recorded provider run: {visibleRoute.routing.runs.toSorted((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0]?.status}</p>}
        </> : <p>No route selected.</p>}
      </div>}
      {loading ? (
        <p role="status" className="mt-2 text-kumo-subtle">Loading Work…</p>
      ) : error ? (
        <div role="alert" className="mt-2 flex flex-wrap items-center justify-between gap-2 text-kumo-warning">
          <span>{error}</span>
          <button type="button" className="min-h-9 font-medium underline underline-offset-2" onClick={() => setRetry((value) => value + 1)}>Retry</button>
        </div>
      ) : work.length === 0 ? (
        <p className="mt-2 text-kumo-subtle">No engineering Work is available yet.</p>
      ) : (
        <label className="mt-2 grid gap-1 text-kumo-subtle">
          Choose Work
          <select
            aria-label="Select Work context"
            className="min-h-9 w-full rounded-lg border border-kumo-hairline bg-kumo-canvas px-2 text-xs text-kumo-default"
            value={selected?.id ?? ""}
            onChange={(event) => onSelect(work.find((item) => item.id === event.target.value) ?? null)}
          >
            <option value="">No Work selected</option>
            {work.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.repository}</option>)}
          </select>
        </label>
      )}
      <p className="mt-2 text-kumo-subtle">Selection applies to future turns in this thread and clears on page reload.</p>
    </section>
  );
}
