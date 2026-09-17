"use client";

import { Button, Loader } from "@cloudflare/kumo";
import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  CircleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";

import type { ResolvedCapability } from "@/lib/capability-registry";
import type { ReadinessCheck, ReadinessReport, ReadinessState } from "@/lib/readiness";
import type { OperatorHealthReport, OperatorState } from "@/lib/operator-health";
import { AGENT_NAME } from "@/lib/identity";
import { cn } from "@/lib/utils";

const STATE_COPY: Record<ReadinessState, string> = {
  ready: "Ready",
  setup_required: "Setup required",
  error: "Needs attention",
  excluded: "Not included",
};

const OPERATOR_COPY: Record<OperatorState, string> = {
  healthy: "Healthy",
  warning: "Watch",
  critical: "Action required",
};

function CheckIcon({ state }: { state: ReadinessState }) {
  if (state === "ready") return <CheckCircleIcon className="size-5 text-kumo-success" />;
  if (state === "error") return <WarningCircleIcon className="size-5 text-kumo-danger" />;
  if (state === "setup_required") {
    return <WarningCircleIcon className="size-5 text-kumo-warning" />;
  }
  return <CircleIcon className="size-5 text-kumo-inactive" />;
}

function CheckRow({ check }: { check: ReadinessCheck }) {
  return (
    <li className="flex items-start gap-3 border-b border-kumo-hairline py-4 first:pt-0 last:border-b-0 last:pb-0">
      <span className="mt-0.5 shrink-0" aria-hidden>
        <CheckIcon state={check.state} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="text-sm font-medium">{check.label}</p>
          <span
            className={cn(
              "text-[11px] font-medium",
              check.state === "ready" && "text-kumo-success",
              check.state === "setup_required" && "text-kumo-warning",
              check.state === "error" && "text-kumo-danger",
              check.state === "excluded" && "text-kumo-subtle",
            )}
          >
            {STATE_COPY[check.state]}
          </span>
        </div>
        <p className="mt-1 text-xs leading-5 text-kumo-subtle">{check.detail}</p>
      </div>
    </li>
  );
}

const AVAILABILITY_COPY: Record<ResolvedCapability["availability"]["status"], string> = {
  available: "Available",
  unconfigured: "Needs setup",
  degraded: "Degraded",
  disabled: "Disabled",
  unavailable: "Unavailable",
};

function CapabilityRow({ capability }: { capability: ResolvedCapability }) {
  return (
    <details className="group border-b border-kumo-hairline py-3 last:border-b-0">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <p className="text-sm font-medium capitalize">{capability.name}</p>
          <p className="mt-0.5 line-clamp-1 text-xs text-kumo-subtle">
            {capability.description}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 text-[11px] font-medium",
            capability.availability.status === "available" && "text-kumo-success",
            capability.availability.status === "unconfigured" && "text-kumo-warning",
            (capability.availability.status === "degraded" ||
              capability.availability.status === "unavailable") && "text-kumo-danger",
            capability.availability.status === "disabled" && "text-kumo-subtle",
          )}
        >
          {AVAILABILITY_COPY[capability.availability.status]}
        </span>
      </summary>
      <dl className="mt-3 grid gap-2 rounded-xl bg-kumo-tint p-3 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-kumo-subtle">Kind</dt>
          <dd className="mt-0.5 capitalize">{capability.kind.replaceAll("_", " ")}</dd>
        </div>
        <div>
          <dt className="text-kumo-subtle">Risk & approval</dt>
          <dd className="mt-0.5 capitalize">
            {capability.risk.level} · {capability.approvalPolicy.mode.replaceAll("_", " ")}
          </dd>
        </div>
        <div>
          <dt className="text-kumo-subtle">Permissions</dt>
          <dd className="mt-0.5 break-words">{capability.permissions.join(", ") || "None"}</dd>
        </div>
        <div>
          <dt className="text-kumo-subtle">Dependencies</dt>
          <dd className="mt-0.5 break-words">{capability.dependencies.join(", ") || "None"}</dd>
        </div>
        {capability.availability.reason && (
          <div className="sm:col-span-2">
            <dt className="text-kumo-subtle">Availability</dt>
            <dd className="mt-0.5">{capability.availability.reason}</dd>
          </div>
        )}
      </dl>
    </details>
  );
}

export function SystemHealthPanel() {
  const [report, setReport] = useState<ReadinessReport | null>(null);
  const [registry, setRegistry] = useState<ResolvedCapability[] | null>(null);
  const [operations, setOperations] = useState<OperatorHealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const [readinessResponse, capabilityResponse, operatorResponse] = await Promise.all([
        fetch(`/api/readiness${fresh ? "?fresh=1" : ""}`),
        fetch("/api/capabilities", { cache: "no-store" }),
        fetch("/api/operator-health", { cache: "no-store" }),
      ]);
      if (!readinessResponse.ok || !capabilityResponse.ok || !operatorResponse.ok) {
        throw new Error(`${AGENT_NAME} could not run the readiness checks.`);
      }
      const capabilityBody = (await capabilityResponse.json()) as {
        registry?: ResolvedCapability[];
      };
      if (capabilityBody.registry === undefined) {
        throw new Error("The capability registry response was incomplete.");
      }
      setReport((await readinessResponse.json()) as ReadinessReport);
      setRegistry(capabilityBody.registry);
      setOperations((await operatorResponse.json()) as OperatorHealthReport);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Readiness checks failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && report === null) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-kumo-subtle">
        <Loader size={18} /> Checking {AGENT_NAME}&rsquo;s services…
      </div>
    );
  }
  if (error !== null && report === null) {
    return (
      <div className="rounded-xl border border-kumo-danger/25 bg-kumo-danger/5 p-4">
        <p className="text-sm font-medium">Readiness checks unavailable</p>
        <p className="mt-1 text-xs text-kumo-subtle">{error}</p>
        <Button className="mt-4" size="sm" variant="secondary" onClick={() => void load(true)}>
          Retry
        </Button>
      </div>
    );
  }
  if (report === null) return null;

  const readyCount = report.checks.filter((check) => check.state === "ready").length;
  const includedCount = report.checks.filter((check) => check.state !== "excluded").length;
  const requiredIssues = report.checks.filter(
    (check) => check.required && check.state !== "ready",
  ).length;
  const healthy = report.overall === "ready";
  const availableCapabilities =
    registry?.filter((capability) => capability.availability.status === "available").length ?? 0;
  const capabilityGroups = [
    ...(registry ?? []).reduce((groups, capability) => {
      const current = groups.get(capability.kind) ?? [];
      current.push(capability);
      groups.set(capability.kind, current);
      return groups;
    }, new Map<string, ResolvedCapability[]>()).entries(),
  ].sort(([left], [right]) => left.localeCompare(right));

  return (
    <div className="flex flex-col gap-5">
      <div
        className={cn(
          "flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between",
          healthy
            ? "border-kumo-success/25 bg-kumo-success/5"
            : "border-kumo-warning/30 bg-kumo-warning/5",
        )}
      >
        <div>
          <p className="text-sm font-semibold">
            {healthy ? `${AGENT_NAME} is ready` : `${AGENT_NAME} needs setup`}
          </p>
          <p className="mt-1 text-xs leading-5 text-kumo-subtle">
            {readyCount} of {includedCount} included services are ready.
            {requiredIssues > 0
              ? ` ${requiredIssues} required ${requiredIssues === 1 ? "service needs" : "services need"} attention before launch.`
              : " Optional services can be connected when you need them."}
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          icon={ArrowClockwiseIcon}
          disabled={loading}
          onClick={() => void load(true)}
        >
          {loading ? "Checking…" : "Run checks"}
        </Button>
      </div>

      <ul className="rounded-2xl border border-kumo-hairline p-4 sm:p-5">
        {report.checks.map((check) => (
          <CheckRow key={check.id} check={check} />
        ))}
      </ul>

      {operations !== null && (
        <section className="rounded-2xl border border-kumo-hairline p-4 sm:p-5" aria-labelledby="operator-health-title">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-kumo-hairline pb-4">
            <div>
              <h3 id="operator-health-title" className="text-sm font-semibold">Production operations</h3>
              <p className="mt-1 text-xs text-kumo-subtle">Owner-scoped signals from the last 24 hours. Stale Computer sessions are closed during this check.</p>
            </div>
            <span className={cn(
              "text-xs font-medium",
              operations.overall === "healthy" && "text-kumo-success",
              operations.overall === "warning" && "text-kumo-warning",
              operations.overall === "critical" && "text-kumo-danger",
            )}>{OPERATOR_COPY[operations.overall]}</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {operations.signals.map((signal) => (
              <div key={signal.id} className="rounded-xl bg-kumo-tint p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium">{signal.label}</p>
                  <span className={cn(
                    "text-xs font-semibold tabular-nums",
                    signal.state === "healthy" && "text-kumo-success",
                    signal.state === "warning" && "text-kumo-warning",
                    signal.state === "critical" && "text-kumo-danger",
                  )}>{signal.count}</span>
                </div>
                <p className="mt-1 text-[11px] leading-4 text-kumo-subtle">{signal.detail}</p>
              </div>
            ))}
          </div>
          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-kumo-subtle">Production canaries</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {operations.canaries.map((canary) => (
                <span key={canary.id} title={canary.detail} className={cn(
                  "rounded-full border px-2.5 py-1 text-xs",
                  canary.state === "passing" ? "border-kumo-success/25 text-kumo-success" : "border-kumo-danger/25 text-kumo-danger",
                )}>{canary.label} · {canary.state === "passing" ? "Passing" : "Failing"}</span>
              ))}
            </div>
          </div>
        </section>
      )}

      {registry !== null && (
        <details className="rounded-2xl border border-kumo-hairline p-4 sm:p-5">
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">Capability registry</p>
                <p className="mt-1 text-xs text-kumo-subtle">
                  {availableCapabilities} of {registry.length} capabilities are available for planning.
                </p>
              </div>
              <span className="text-xs text-kumo-subtle">View details</span>
            </div>
          </summary>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            {capabilityGroups.map(([kind, capabilities]) => (
              <section key={kind} aria-labelledby={`capability-${kind}`}>
                <div className="flex items-center justify-between border-b border-kumo-hairline pb-2">
                  <h3 id={`capability-${kind}`} className="text-xs font-semibold uppercase tracking-wide text-kumo-subtle">
                    {kind.replaceAll("_", " ")}
                  </h3>
                  <span className="text-xs text-kumo-subtle">{capabilities?.length ?? 0}</span>
                </div>
                {capabilities?.map((capability) => (
                  <CapabilityRow key={capability.id} capability={capability} />
                ))}
              </section>
            ))}
          </div>
        </details>
      )}

      <p className="text-xs text-kumo-subtle">
        Last checked {new Date(report.checkedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.
        Credentials are never returned to this page.
      </p>
    </div>
  );
}
