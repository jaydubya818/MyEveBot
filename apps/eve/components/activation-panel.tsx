"use client";

import { Badge, Button, Loader } from "@cloudflare/kumo";
import {
  ArrowRightIcon,
  BellIcon,
  BrowserIcon,
  CheckCircleIcon,
  IdentificationCardIcon,
  PlugsIcon,
  ShieldCheckIcon,
  SparkleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";

import type { CapabilityStatus } from "@/lib/capabilities";
import { getStarterJobs } from "@/lib/activation";
import { AGENT_NAME, OWNER_NAME } from "@/lib/identity";

type SetupSection = "appearance" | "connections" | "system" | "review-delivery" | "agents";

interface ConnectedAccount {
  toolkit: string;
  name?: string;
  accounts: { id: string; status: string; alias: string | null; label: string | null }[];
}

interface ReviewScheduleSummary {
  preferences?: { dailyBriefEnabled?: boolean; weeklyReviewEnabled?: boolean };
}

function capabilityState(capabilities: CapabilityStatus[], id: CapabilityStatus["id"]): CapabilityStatus["state"] {
  return capabilities.find((capability) => capability.id === id)?.state ?? "setup_required";
}

function SetupCard({
  icon: Icon,
  title,
  detail,
  status,
  onOpen,
}: {
  icon: Icon;
  title: string;
  detail: string;
  status: "ready" | "review" | "setup";
  onOpen: () => void;
}) {
  return (
    <button type="button" onClick={onOpen} className="group flex min-h-32 flex-col rounded-2xl border border-kumo-hairline bg-kumo-canvas p-4 text-start transition-colors hover:bg-kumo-tint">
      <div className="flex w-full items-start justify-between gap-3">
        <span className="grid size-9 place-items-center rounded-xl border border-kumo-hairline bg-kumo-recessed text-kumo-subtle"><Icon className="size-4.5" aria-hidden /></span>
        {status === "ready" ? <span className="flex items-center gap-1 text-xs text-kumo-success"><CheckCircleIcon className="size-3.5" />Ready</span> : <Badge variant="secondary">{status === "setup" ? "Set up" : "Review"}</Badge>}
      </div>
      <p className="mt-4 text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs leading-5 text-kumo-subtle">{detail}</p>
      <span className="mt-auto flex items-center gap-1 pt-3 text-xs font-medium text-kumo-interact">Open <ArrowRightIcon className="size-3 transition-transform group-hover:translate-x-0.5" /></span>
    </button>
  );
}

export function ActivationPanel({
  capabilities,
  onNavigate,
  onStartPrompt,
}: {
  capabilities: CapabilityStatus[];
  onNavigate: (section: SetupSection) => void;
  onStartPrompt: (title: string, prompt: string) => void;
}) {
  const [connections, setConnections] = useState<ConnectedAccount[] | null>(null);
  const [notificationsConfigured, setNotificationsConfigured] = useState<boolean | null>(null);
  const connectionsReady = capabilityState(capabilities, "connections") === "ready";
  const browserReady = capabilityState(capabilities, "computer") === "ready";

  useEffect(() => {
    if (!connectionsReady) {
      setConnections([]);
      return;
    }
    const controller = new AbortController();
    void fetch("/api/connections", { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<{ connections?: ConnectedAccount[] }> : null)
      .then((body) => setConnections(body?.connections ?? []))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setConnections([]);
      });
    return () => controller.abort();
  }, [connectionsReady]);

  useEffect(() => {
    if (capabilityState(capabilities, "goals") !== "ready") {
      setNotificationsConfigured(false);
      return;
    }
    const controller = new AbortController();
    void fetch("/api/review-schedule", { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<ReviewScheduleSummary> : null)
      .then((body) => setNotificationsConfigured(Boolean(body?.preferences?.dailyBriefEnabled || body?.preferences?.weeklyReviewEnabled)))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setNotificationsConfigured(false);
      });
    return () => controller.abort();
  }, [capabilities]);

  const connectedNames = useMemo(() => connections?.map((connection) => connection.name ?? connection.toolkit).filter(Boolean) ?? [], [connections]);
  const jobs = useMemo(() => getStarterJobs(connectedNames, browserReady), [connectedNames, browserReady]);
  const readyCount = 1 + Number(connections !== null && connections.length > 0) + Number(browserReady) + Number(notificationsConfigured === true);

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border border-kumo-hairline bg-kumo-canvas">
        <div className="grid gap-6 p-6 sm:p-7 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-end">
          <div>
            <div className="flex items-center gap-2 text-kumo-subtle"><SparkleIcon className="size-4" /><span className="text-xs font-semibold uppercase tracking-[0.14em]">First useful result</span></div>
            <h2 className="mt-3 max-w-xl text-2xl font-semibold tracking-tight">Set the boundaries once. Then give {AGENT_NAME} one real job.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-kumo-subtle">Start with read-only work and a visible finish line. Nothing below sends, schedules, edits, or shares without the approval stated on the job.</p>
          </div>
          <div className="rounded-2xl bg-kumo-recessed p-4">
            <p className="text-3xl font-semibold tabular-nums">{readyCount}<span className="text-base font-normal text-kumo-subtle"> / 5</span></p>
            <p className="mt-1 text-xs leading-5 text-kumo-subtle">Setup areas ready. Risk boundaries always need your review.</p>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3"><div><h3 className="text-sm font-semibold">Setup</h3><p className="mt-1 text-xs text-kumo-subtle">Confirm the identity, access, and interruption rules that apply to every job.</p></div></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <SetupCard icon={IdentificationCardIcon} title="Identity" detail={`${AGENT_NAME} works for ${OWNER_NAME}.`} status="ready" onOpen={() => onNavigate("appearance")} />
          <SetupCard icon={PlugsIcon} title="Accounts" detail={connections === null ? "Checking connected accounts…" : connections.length > 0 ? `${connections.length} connected ${connections.length === 1 ? "app" : "apps"}.` : "Connect only what a real job needs."} status={connections !== null && connections.length > 0 ? "ready" : "setup"} onOpen={() => onNavigate("connections")} />
          <SetupCard icon={BrowserIcon} title="Browser" detail={browserReady ? "Isolated web sessions are available." : "Browser work still needs setup."} status={browserReady ? "ready" : "setup"} onOpen={() => onNavigate("system")} />
          <SetupCard icon={BellIcon} title="Notifications" detail={notificationsConfigured === null ? "Checking delivery settings…" : notificationsConfigured ? "At least one brief is configured." : "Quiet until you choose a cadence."} status={notificationsConfigured ? "ready" : "setup"} onOpen={() => onNavigate("review-delivery")} />
          <SetupCard icon={ShieldCheckIcon} title="Risk boundaries" detail="Review approval, activity, and risk limits." status="review" onOpen={() => onNavigate("agents")} />
        </div>
      </section>

      <section>
        <div className="mb-3"><h3 className="text-sm font-semibold">Five good first jobs</h3><p className="mt-1 text-xs text-kumo-subtle">Recommendations adapt to the access currently available. Try one before creating a routine.</p></div>
        {connections === null ? <div className="grid min-h-40 place-items-center"><Loader size={18} /></div> : (
          <ol className="grid gap-3 lg:grid-cols-2">
            {jobs.map((job, index) => (
              <li key={job.title} className="flex flex-col rounded-2xl border border-kumo-hairline bg-kumo-canvas p-5 last:lg:col-span-2">
                <div className="flex items-start gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-kumo-recessed text-xs font-semibold tabular-nums">{index + 1}</span><div><h4 className="text-sm font-semibold">{job.title}</h4><p className="mt-1 text-sm leading-6 text-kumo-subtle">{job.summary}</p></div></div>
                <dl className="mt-4 grid gap-2 rounded-xl bg-kumo-tint p-3 text-xs sm:grid-cols-3">
                  <div><dt className="font-medium">Access</dt><dd className="mt-1 leading-5 text-kumo-subtle">{job.access}</dd></div>
                  <div><dt className="font-medium">Boundary</dt><dd className="mt-1 leading-5 text-kumo-subtle">{job.boundary}</dd></div>
                  <div><dt className="font-medium">Done when</dt><dd className="mt-1 leading-5 text-kumo-subtle">{job.finishLine}</dd></div>
                </dl>
                <div className="mt-4 flex items-center justify-between gap-3"><p className="flex items-center gap-1.5 text-xs text-kumo-subtle"><WarningCircleIcon className="size-3.5" />Starts as a draft in chat</p><Button size="sm" icon={ArrowRightIcon} onClick={() => onStartPrompt(job.title, job.prompt)}>Try once</Button></div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="rounded-2xl border border-kumo-hairline bg-kumo-tint px-4 py-3 text-xs leading-5 text-kumo-subtle"><strong className="text-kumo-default">After a verified result:</strong> open Results to run it again, save it as a reusable skill, or make it a routine. Those options appear only after completed work exists.</p>
    </div>
  );
}
