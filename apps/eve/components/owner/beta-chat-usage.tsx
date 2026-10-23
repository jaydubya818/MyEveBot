"use client";
import { useEffect, useState } from "react";
import { alphaChatUsageSchema, type AlphaChatUsage } from "@/lib/external-alpha/usage-contract";
import { useExternalLinksAllowed } from "./destination-gate";

const money = (microusd: number, measured = false) => `$${(microusd / 1_000_000).toFixed(measured ? 4 : 2)}`;

export function BetaChatUsageView({ usage }: { usage: AlphaChatUsage }) {
  const paused = usage.localPaused || usage.state !== "active";
  return <section aria-label="Beta chat usage" className="mt-2 max-h-40 shrink-0 overflow-y-auto rounded-xl border border-kumo-line px-3 py-2 text-xs text-kumo-subtle">
    <p className="font-medium text-kumo-default">{usage.quotaRemaining}/{usage.limits.dailyTurns} chat turns remaining today</p>
    <p>Daily budget reserved: {money(usage.dailyReservedMicrousd)} / {money(usage.limits.dailyMicrousd)} · Trial: {money(usage.trialReservedMicrousd)} / {money(usage.limits.trialMicrousd)}</p>
    {paused && <p role="status">{usage.state === "expired" ? "This chat trial has ended." : usage.state === "revoked" ? "This chat trial is disabled." : usage.state === "inactive" ? "Chat is not activated yet." : "Chat is temporarily paused. Unused quota does not guarantee availability."}</p>}
    {!paused && usage.quotaRemaining === 0 && <p role="status">{usage.trialReservedMicrousd >= usage.limits.trialMicrousd ? "Your trial budget is fully reserved." : "Today's chat allowance is fully reserved. Daily limits reset at 00:00 UTC."}</p>}
    <details>
      <summary className="cursor-pointer">Usage details and limits</summary>
      <p>{usage.dailyTurnsUsed}/{usage.limits.dailyTurns} turns reserved today. Each turn reserves {money(usage.limits.perTurnMicrousd)} permanently, even if it fails or costs less. Reservations are not refunded.</p>
      <p>Recorded model spend for today's turns: {money(usage.measured.dailyMicrousd, true)}. Trial: {money(usage.measured.trialMicrousd, true)}. This is separate from the reserved budget.</p>
      <p>{usage.measured.unsettledOperations ? `${usage.measured.unsettledOperations} model operation${usage.measured.unsettledOperations === 1 ? " has" : "s have"} unsettled usage; recorded spend is incomplete.` : "Only settled model usage is included; usage may update after a turn completes."}</p>
      <p>The two testers share a {money(usage.limits.sharedDailyMicrousd)} daily and {money(usage.limits.sharedTrialMicrousd)} trial ceiling. Your personal limits are shown above. Paid Work and purchases are disabled.</p>
      <p>Daily reset: {new Date(usage.resetsAt).toUTCString()}. Trial ends: {usage.expiresAt ? new Date(usage.expiresAt).toUTCString() : "Not activated"}.</p>
      <p>Checked {new Date(usage.checkedAt).toUTCString()}. Availability is checked again when sending.</p>
    </details>
  </section>;
}

export function BetaChatUsage({ refreshKey }: { refreshKey: string }) {
  const alpha = !useExternalLinksAllowed();
  const [usage, setUsage] = useState<AlphaChatUsage | null>(null);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!alpha) return;
    const controller = new AbortController();
    let busy = false;
    async function refresh() {
      if (busy || controller.signal.aborted) return;
      busy = true;
      try {
        const response = await fetch("/api/chat-usage", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
        if (!response.ok) throw Error();
        const next = alphaChatUsageSchema.parse(await response.json());
        if (!controller.signal.aborted) { setUsage(next); setFailed(false); }
      } catch {
        if (!controller.signal.aborted) { setUsage(null); setFailed(true); }
      } finally { busy = false; }
    }
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    void refresh();
    const timer = setInterval(onVisible, 30000);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("focus", onVisible); window.removeEventListener("online", onVisible); document.removeEventListener("visibilitychange", onVisible); };
  }, [alpha, refreshKey, revision]);
  if (!alpha) return null;
  if (usage) return <BetaChatUsageView usage={usage} />;
  return <section aria-label="Beta chat usage" className="mt-2 shrink-0 px-3 py-2 text-xs text-kumo-subtle">
    <p role="status">{failed ? "Chat usage could not be refreshed. Limits still apply." : "Checking chat allowance…"}</p>
    {failed && <button type="button" className="underline" onClick={() => setRevision(v => v + 1)}>Refresh usage</button>}
  </section>;
}
