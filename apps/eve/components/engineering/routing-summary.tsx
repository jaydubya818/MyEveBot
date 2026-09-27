"use client";

export interface RouteDecisionRecord {
  id: string;
  workId: string;
  workVersion: number;
  selectedRoute: string;
  reason: string;
  source: string;
  profile: Record<string, string | number>;
  eligibleRoutes: string[];
  rejectedRoutes: { route: string; reason: string }[];
  constraints: string[];
  providerId: string | null;
  providerVersion: string | null;
  status: "PROPOSED" | "ADMITTED" | "STALE";
  createdAt: string;
}

export interface RouteTransitionRecord {
  id: string;
  fromRoute: string | null;
  toRoute: string;
  reason: string;
  trigger: string;
  createdAt: string;
}

export interface ProviderRunRecord {
  id: string;
  route: string;
  providerId: string | null;
  providerVersion: string | null;
  status: string;
  updatedAt: string;
}

export interface RoutingSnapshot {
  decision: RouteDecisionRecord | null;
  transitions: RouteTransitionRecord[];
  runs: ProviderRunRecord[];
}

export function routeLabel(route: string): string {
  // Legacy names are display compatibility only; v2 route admission uses its persisted enum.
  const names: Record<string, string> = {
    DIRECT: "Direct",
    DEEP_AGENT: "Deep Agent",
    EXECUTOR: "Executor",
    FACTORY: "MyFactory",
    MYFACTORY: "MyFactory",
    PEER: "Relay peer",
    RELAY: "Relay",
    HUMAN: "Human",
  };
  return names[route] ?? route.replaceAll("_", " ");
}

function fieldLabel(field: string): string {
  return field.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function date(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : "Unknown time";
}

export function RoutingSummary({ routing, stale = false }: { routing: RoutingSnapshot | null | undefined; stale?: boolean }) {
  const decision = routing?.decision;
  const runs = routing?.runs ?? [];
  return <section aria-label="Execution routing" className="rounded-xl border border-kumo-line p-4 text-sm">
    <h3 className="font-semibold">Execution strategy</h3>
    {stale && <p role="status" className="mt-2 rounded-lg border border-kumo-warning/40 p-3 text-xs">Work details could not be refreshed. This routing summary may be out of date.</p>}
    {!routing ? <p className="mt-2 text-kumo-subtle">Routing status is unavailable.</p> : !decision ? <p className="mt-2 text-kumo-subtle">No route selected.</p> : <>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div><p className="text-xs text-kumo-subtle">{decision.status === "PROPOSED" ? "Recommended strategy" : decision.status === "STALE" ? "Previous strategy" : "Admitted strategy"}</p><p className="mt-1 font-semibold">{routeLabel(decision.selectedRoute)}</p></div>
        <div><p className="text-xs text-kumo-subtle">Decision state</p><p className="mt-1 font-medium">{fieldLabel(decision.status)}</p></div>
      </div>
      {decision.status === "PROPOSED" && <p role="status" className="mt-3 rounded-lg border border-kumo-line bg-kumo-tint p-3 text-xs">This is a recommendation. It has not admitted an execution route.</p>}
      {decision.status === "STALE" && <p role="status" className="mt-3 rounded-lg border border-kumo-warning/40 p-3 text-xs">This routing decision is stale. It must be reevaluated before dispatch.</p>}
      <p className="mt-3"><span className="font-medium">Why:</span> {decision.reason}</p>
      <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
        <div><dt className="text-kumo-subtle">Decision source</dt><dd className="mt-1">{fieldLabel(decision.source)}</dd></div>
        <div><dt className="text-kumo-subtle">{decision.status === "PROPOSED" ? "Provider in proposal" : decision.status === "STALE" ? "Previously selected provider" : "Admitted provider"}</dt><dd className="mt-1 break-all">{decision.providerId ? `${decision.providerId}${decision.providerVersion ? ` · ${decision.providerVersion}` : ""}` : "Not assigned"}</dd></div>
        <div><dt className="text-kumo-subtle">Work version</dt><dd className="mt-1">{decision.workVersion}</dd></div>
        <div><dt className="text-kumo-subtle">Recorded</dt><dd className="mt-1"><time dateTime={decision.createdAt}>{date(decision.createdAt)}</time></dd></div>
      </dl>
      <div className="mt-4 grid gap-4 border-t border-kumo-line pt-4 text-xs sm:grid-cols-2">
        <div><h4 className="font-medium">Routing profile</h4>{Object.keys(decision.profile).length ? <dl className="mt-2 space-y-1">{Object.entries(decision.profile).map(([key, value]) => <div key={key} className="flex flex-wrap gap-1"><dt className="text-kumo-subtle">{fieldLabel(key)}:</dt><dd>{value}</dd></div>)}</dl> : <p className="mt-2 text-kumo-subtle">No profile recorded.</p>}</div>
        <div><h4 className="font-medium">{decision.status === "ADMITTED" ? "Routes eligible at admission" : "Routes listed in proposal"}</h4><p className="mt-2">{decision.eligibleRoutes.length ? decision.eligibleRoutes.map(routeLabel).join(" · ") : "None recorded"}</p>{decision.status !== "ADMITTED" && <p className="mt-1 text-kumo-subtle">Provider qualification and authority have not been independently verified.</p>}</div>
        <div><h4 className="font-medium">Rejected routes</h4>{decision.rejectedRoutes.length ? <ul className="mt-2 space-y-2">{decision.rejectedRoutes.map((entry) => <li key={entry.route}><span className="font-medium">{routeLabel(entry.route)}:</span> {entry.reason}</li>)}</ul> : <p className="mt-2 text-kumo-subtle">None recorded.</p>}</div>
        <div><h4 className="font-medium">Constraints</h4>{decision.constraints.length ? <ul className="mt-2 list-disc space-y-1 ps-4">{decision.constraints.map((constraint) => <li key={constraint}>{constraint}</li>)}</ul> : <p className="mt-2 text-kumo-subtle">None recorded.</p>}</div>
      </div>
    </>}
    {runs.length > 0 && <div className="mt-4 border-t border-kumo-line pt-4 text-xs">
      <h4 className="font-medium">Provider runs</h4>
      <ul className="mt-2 space-y-2">{runs.map((run) => <li key={run.id} className="rounded-lg border border-kumo-line p-2"><span className="font-medium">{routeLabel(run.route)} · {run.status}</span><span className="mt-1 block break-all text-kumo-subtle">{run.providerId ?? "Provider not assigned"}{run.providerVersion ? ` · ${run.providerVersion}` : ""} · Updated {date(run.updatedAt)}</span></li>)}</ul>
    </div>}
  </section>;
}

export function RoutingTimeline({ transitions }: { transitions: RouteTransitionRecord[] | undefined }) {
  return <section aria-label="Route transitions" className="border-t border-kumo-line pt-4 text-sm">
    <h4 className="font-semibold">Route changes</h4>
    {!transitions ? <p className="mt-2 text-kumo-subtle">Route history is unavailable.</p> : transitions.length === 0 ? <p className="mt-2 text-kumo-subtle">No route changes recorded.</p> : <ol className="mt-3 space-y-2">
      {transitions.toSorted((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)).map((transition) => <li key={transition.id} className="rounded-lg border border-kumo-line p-3">
        <p className="font-medium">{transition.fromRoute ? routeLabel(transition.fromRoute) : "No prior route"} → {routeLabel(transition.toRoute)}</p>
        <p className="mt-1">{transition.reason}</p>
        <p className="mt-1 text-xs text-kumo-subtle">Trigger: {fieldLabel(transition.trigger)} · <time dateTime={transition.createdAt}>{date(transition.createdAt)}</time></p>
      </li>)}
    </ol>}
  </section>;
}
