"use client";

import { useEffect, useState } from "react";

import type { manifest } from "@/lib/engineering/execution";
import type { EngineeringWorkerProjection } from "@/lib/engineering/worker-projection";
import type { Work } from "@/lib/engineering/types";

type WorkManifest = ReturnType<typeof manifest>;
type WorkList = { work: Work[]; manifests: (WorkManifest | null)[]; projections?: EngineeringWorkerProjection[] };
type WorkItem = { work: Work; manifest: WorkManifest | null; projection: EngineeringWorkerProjection | null };
type Snapshot = {
  activeCount: number;
  pending: WorkItem[];
  latest: WorkItem | null;
  latestAt: string | null;
};

function summarize(body: WorkList): Snapshot {
  const manifests = new Map(
    body.manifests.filter((item): item is WorkManifest => item !== null).map((item) => [item.workId, item]),
  );
  const projections = new Map((body.projections ?? []).map(item => [item.workId, item]));
  const active = body.work
    .filter((work) => work.lifecycle === "active")
    .map((work) => ({ work, manifest: manifests.get(work.id) ?? null, projection: projections.get(work.id) ?? null }));
  const pending = active.filter((item) => (item.projection?.pendingDecisions.length ?? item.manifest?.pendingDecisions.length ?? 0) > 0);
  const latest = active.toSorted((a, b) => {
    const aTime = Date.parse(a.projection?.lastMeaningfulActivity ?? a.manifest?.lastMeaningfulActivity ?? a.work.updatedAt);
    const bTime = Date.parse(b.projection?.lastMeaningfulActivity ?? b.manifest?.lastMeaningfulActivity ?? b.work.updatedAt);
    return bTime - aTime;
  })[0] ?? null;
  return {
    activeCount: active.length,
    pending,
    latest,
    latestAt: latest?.projection?.lastMeaningfulActivity ?? latest?.manifest?.lastMeaningfulActivity ?? latest?.work.updatedAt ?? null,
  };
}

function activity(item: WorkItem): string {
  if (item.projection) {
    if (item.projection.pendingDecisions.length > 0) return item.projection.pendingDecisions[0];
    return item.projection.activity;
  }
  const current = item.manifest;
  if (!current) return item.work.control === "paused" ? "Paused before execution" : "Work prepared";
  if (current.pendingDecisions.length > 0) return current.pendingDecisions[0];
  if (item.work.control === "human") return "You have control";
  if (item.work.control === "paused") return "Paused";
  return current.activity;
}

/** A small read-only glance at the same durable Work state used by /work. */
export function ChatWorkStatus() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let disposed = false;
    let request: AbortController | null = null;
    async function refresh() {
      request?.abort();
      const controller = new AbortController();
      request = controller;
      const timeout = window.setTimeout(() => {
        if (request === controller && !disposed) {
          setError(true);
          controller.abort();
        }
      }, 10_000);
      try {
        const response = await fetch("/api/engineering/work", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Work status is unavailable.");
        const body = (await response.json()) as Partial<WorkList>;
        if (!Array.isArray(body.work) || !Array.isArray(body.manifests)) {
          throw new Error("Work status is incomplete.");
        }
        if (disposed || controller.signal.aborted) return;
        setSnapshot(summarize(body as WorkList));
        setRefreshedAt(Date.now());
        setError(false);
      } catch {
        if (!disposed && !controller.signal.aborted) setError(true);
      } finally {
        window.clearTimeout(timeout);
        if (request === controller) request = null;
      }
    }
    const onFocus = () => void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    void refresh();
    const interval = window.setInterval(() => {
      setClock(Date.now());
      if (document.visibilityState === "visible") void refresh();
    }, 15_000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      request?.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [retry]);

  const stale = error || (refreshedAt > 0 && clock - refreshedAt > 45_000);
  const pending = snapshot?.pending[0] ?? null;
  return (
    <section aria-label="Engineering Work status" className="mx-3 mb-3 rounded-xl border border-kumo-hairline bg-kumo-canvas p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <a href="/work" className="font-semibold text-kumo-default underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2">
          Work
        </a>
        {!stale && snapshot && <span className="tabular-nums text-kumo-subtle">{snapshot.activeCount} active</span>}
      </div>
      {snapshot === null && !error ? (
        <p role="status" className="mt-2 text-kumo-subtle">Loading Work status…</p>
      ) : stale || snapshot === null ? (
        <div className="mt-2">
          <p role="status" className="text-kumo-subtle">Work status is not current.</p>
          <button type="button" className="mt-2 min-h-9 font-medium text-kumo-strong underline underline-offset-2" onClick={() => setRetry((value) => value + 1)}>
            Retry
          </button>
        </div>
      ) : snapshot.activeCount === 0 ? (
        <p className="mt-2 text-kumo-subtle">No active engineering Work.</p>
      ) : (
        <>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-kumo-hairline pt-3">
            <span className="text-kumo-subtle">Needs You</span>
            <span className={`tabular-nums font-semibold ${snapshot.pending.length > 0 ? "text-kumo-warning" : "text-kumo-default"}`}>
              {snapshot.pending.length}
            </span>
          </div>
          {pending && (
            <a href={`/work?id=${encodeURIComponent(pending.work.id)}&tab=Decisions`} className="mt-1 block break-words font-medium text-kumo-default underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2">
              {(pending.projection?.attention ?? pending.manifest?.attention)?.reconciliation ? "Reconcile" : "Review"} {pending.work.title}
            </a>
          )}
          {snapshot.latest && (
            <div className="mt-3 border-t border-kumo-hairline pt-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-kumo-subtle">Latest activity</p>
              <a href={`/work?id=${encodeURIComponent(snapshot.latest.work.id)}`} className="mt-1 block break-words font-medium text-kumo-default underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2">
                {snapshot.latest.work.title}
              </a>
              <p className="mt-1 line-clamp-2 break-words text-kumo-subtle">{activity(snapshot.latest)}</p>
              {(snapshot.latest.projection?.nextStep ?? snapshot.latest.manifest?.nextStep) && (
                <p className="mt-2 line-clamp-2 break-words text-kumo-subtle">
                  <span className="font-medium text-kumo-default">Next:</span> {snapshot.latest.projection?.nextStep ?? snapshot.latest.manifest?.nextStep}
                </p>
              )}
              {(snapshot.latest.projection?.repositoryObservation ?? snapshot.latest.manifest?.repositoryObservation)?.status !== undefined &&
                (snapshot.latest.projection?.repositoryObservation ?? snapshot.latest.manifest?.repositoryObservation)?.status !== "fresh" && (
                  <p className="mt-2 text-kumo-warning">
                    Repository observation {(snapshot.latest.projection?.repositoryObservation ?? snapshot.latest.manifest?.repositoryObservation)?.status}.
                  </p>
                )}
              {snapshot.latestAt && Number.isFinite(Date.parse(snapshot.latestAt)) && (
                <time className="mt-1 block text-[11px] text-kumo-subtle" dateTime={snapshot.latestAt}>
                  {new Date(snapshot.latestAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </time>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
