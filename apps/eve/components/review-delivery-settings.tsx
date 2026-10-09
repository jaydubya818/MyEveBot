"use client";

import { Badge, Button, Loader } from "@cloudflare/kumo";
import { BellRingingIcon, CheckCircleIcon, ClockIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";

import type {
  DeliveryChannel,
  ReviewDeliveryPreferences,
  ReviewDeliveryView,
  ReviewSchedulePatch,
  ReviewScheduleState,
} from "@/lib/review-schedule-types";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const CHANNEL_LABELS: Record<DeliveryChannel, string> = {
  in_app: "In app",
  push: "Web Push",
  telegram: "Telegram",
};

function availableTimezones(current: string): string[] {
  const values = typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : ["America/Los_Angeles", "America/New_York", "Europe/London", "Asia/Tokyo", "UTC"];
  return Array.from(new Set([current, ...values])).sort();
}

function formatWhen(value: string | null, timezone: string): string {
  if (value === null) return "Not scheduled";
  return new Date(value).toLocaleString(undefined, {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
        checked ? "border-kumo-brand bg-kumo-brand" : "border-kumo-line bg-kumo-recessed",
      )}
      onClick={() => onChange(!checked)}
    >
      <span className={cn("absolute top-0.5 size-4.5 rounded-full bg-white shadow-sm transition-transform", checked ? "translate-x-5" : "translate-x-0.5")} />
    </button>
  );
}

function DeliveryHistory({ deliveries, timezone }: { deliveries: ReviewDeliveryView[]; timezone: string }) {
  if (deliveries.length === 0) {
    return <p className="py-5 text-sm text-kumo-subtle">No scheduled review deliveries yet.</p>;
  }
  return (
    <ul className="divide-y divide-kumo-hairline">
      {deliveries.slice(0, 8).map((delivery) => (
        <li key={delivery.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium capitalize">{delivery.reviewKind} review</p>
              <Badge variant="secondary">{delivery.status}</Badge>
              <span className="text-xs text-kumo-subtle">{CHANNEL_LABELS[delivery.channel]}</span>
            </div>
            <p className="mt-1 text-xs text-kumo-subtle">
              Scheduled {formatWhen(delivery.scheduledFor, timezone)} · {delivery.attemptCount} {delivery.attemptCount === 1 ? "attempt" : "attempts"}
              {delivery.deduplicationHits > 0 && ` · ${delivery.deduplicationHits} duplicate ${delivery.deduplicationHits === 1 ? "run" : "runs"} suppressed`}
            </p>
            {delivery.failureSummary && (
              <p className="mt-1 text-xs text-kumo-danger">{delivery.failureSummary}</p>
            )}
          </div>
          {delivery.checkpointId && (
            <a href={`/review?kind=${delivery.reviewKind}`} className="text-xs font-medium text-kumo-interact hover:underline">
              Open review
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ReviewDeliverySettings() {
  const [state, setState] = useState<ReviewScheduleState | null>(null);
  const [draft, setDraft] = useState<ReviewDeliveryPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    void fetch("/api/review-schedule", { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as (ReviewScheduleState & { error?: { message?: string } }) | null;
        if (!response.ok || body === null) throw new Error(body?.error?.message ?? "Delivery settings could not be loaded.");
        setState(body);
        setDraft(body.preferences);
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "Delivery settings could not be loaded.");
      });
    return () => controller.abort();
  }, [loadAttempt]);

  const timezones = useMemo(() => availableTimezones(draft?.ownerTimezone ?? "UTC"), [draft?.ownerTimezone]);
  const update = <K extends keyof ReviewSchedulePatch>(key: K, value: ReviewSchedulePatch[K]) => {
    setDraft((current) => current === null ? current : { ...current, [key]: value });
    setSaved(false);
  };

  async function save() {
    if (draft === null) return;
    setSaving(true);
    setError(null);
    try {
      const patch: ReviewSchedulePatch = {
        ownerTimezone: draft.ownerTimezone,
        dailyBriefEnabled: draft.dailyBriefEnabled,
        dailyBriefTime: draft.dailyBriefTime,
        weeklyReviewEnabled: draft.weeklyReviewEnabled,
        weeklyReviewDay: draft.weeklyReviewDay,
        weeklyReviewTime: draft.weeklyReviewTime,
        quietHoursEnabled: draft.quietHoursEnabled,
        quietHoursStart: draft.quietHoursStart,
        quietHoursEnd: draft.quietHoursEnd,
        preferredDeliveryChannel: draft.preferredDeliveryChannel,
        maxProactivePushesPerDay: draft.maxProactivePushesPerDay,
      };
      const response = await fetch("/api/review-schedule", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await response.json().catch(() => null) as (ReviewScheduleState & { error?: { message?: string } }) | null;
      if (!response.ok || body === null) throw new Error(body?.error?.message ?? "Delivery settings could not be saved.");
      setState(body);
      setDraft(body.preferences);
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Delivery settings could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  if (draft === null || state === null) {
    return error ? (
      <div className="grid min-h-40 place-items-center text-center">
        <div>
          <p role="alert" className="text-sm text-kumo-danger">{error}</p>
          <Button className="mt-3" variant="secondary" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
            Try again
          </Button>
        </div>
      </div>
    ) : <div className="grid min-h-40 place-items-center"><Loader size={18} /></div>;
  }

  return (
    <fieldset className="space-y-7" disabled={saving} aria-busy={saving}>
      <div className="rounded-2xl border border-kumo-brand/20 bg-kumo-brand/5 p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-kumo-brand/10 text-kumo-brand"><BellRingingIcon className="size-5" aria-hidden /></span>
          <div>
            <p className="text-sm font-semibold">Quiet by default</p>
            <p className="mt-1 text-sm leading-6 text-kumo-subtle">Briefs stay off until you enable them. MyEve sends one configured digest, never every available channel.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm font-medium md:col-span-2">
          Your timezone
          <select className="block h-10 w-full rounded-xl border border-kumo-line bg-kumo-base px-3 text-sm" value={draft.ownerTimezone} onChange={(event) => update("ownerTimezone", event.target.value)}>
            {timezones.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}
          </select>
          <span className="block text-xs font-normal text-kumo-subtle">IANA timezone; daylight-saving changes are handled automatically.</span>
        </label>

        <section className="rounded-2xl border border-kumo-hairline p-4">
          <div className="flex items-center justify-between gap-4">
            <div><h3 className="text-sm font-semibold">Daily Brief</h3><p className="mt-1 text-xs text-kumo-subtle">Your priorities and risks for the day.</p></div>
            <Toggle checked={draft.dailyBriefEnabled} label="Daily Brief" onChange={(value) => update("dailyBriefEnabled", value)} />
          </div>
          <label className="mt-4 block text-xs font-medium">Delivery time<input type="time" className="mt-1 block h-9 w-full rounded-lg border border-kumo-line bg-kumo-base px-3 text-sm" value={draft.dailyBriefTime} onChange={(event) => update("dailyBriefTime", event.target.value)} /></label>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-kumo-subtle"><ClockIcon className="size-3.5" />Next: {formatWhen(draft.dailyNextAt, draft.ownerTimezone)}</p>
        </section>

        <section className="rounded-2xl border border-kumo-hairline p-4">
          <div className="flex items-center justify-between gap-4">
            <div><h3 className="text-sm font-semibold">Weekly Review</h3><p className="mt-1 text-xs text-kumo-subtle">Monday–Sunday progress and proposed focus.</p></div>
            <Toggle checked={draft.weeklyReviewEnabled} label="Weekly Review" onChange={(value) => update("weeklyReviewEnabled", value)} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <label className="text-xs font-medium">Day<select className="mt-1 block h-9 w-full rounded-lg border border-kumo-line bg-kumo-base px-2 text-sm" value={draft.weeklyReviewDay} onChange={(event) => update("weeklyReviewDay", Number(event.target.value))}>{WEEKDAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>
            <label className="text-xs font-medium">Time<input type="time" className="mt-1 block h-9 w-full rounded-lg border border-kumo-line bg-kumo-base px-2 text-sm" value={draft.weeklyReviewTime} onChange={(event) => update("weeklyReviewTime", event.target.value)} /></label>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-kumo-subtle"><ClockIcon className="size-3.5" />Next: {formatWhen(draft.weeklyNextAt, draft.ownerTimezone)}</p>
        </section>
      </div>

      <section className="rounded-2xl border border-kumo-hairline p-4">
        <div className="flex items-center justify-between gap-4"><div><h3 className="text-sm font-semibold">Quiet hours</h3><p className="mt-1 text-xs text-kumo-subtle">Scheduled digests wait until quiet hours end.</p></div><Toggle checked={draft.quietHoursEnabled} label="Quiet hours" onChange={(value) => update("quietHoursEnabled", value)} /></div>
        <div className="mt-4 grid max-w-sm grid-cols-[1fr_auto_1fr] items-end gap-2">
          <label className="text-xs font-medium">Start<input type="time" className="mt-1 block h-9 w-full rounded-lg border border-kumo-line bg-kumo-base px-2 text-sm" value={draft.quietHoursStart} onChange={(event) => update("quietHoursStart", event.target.value)} /></label>
          <span className="pb-2 text-xs text-kumo-subtle">to</span>
          <label className="text-xs font-medium">End<input type="time" className="mt-1 block h-9 w-full rounded-lg border border-kumo-line bg-kumo-base px-2 text-sm" value={draft.quietHoursEnd} onChange={(event) => update("quietHoursEnd", event.target.value)} /></label>
        </div>
      </section>

      <section className="rounded-2xl border border-kumo-hairline p-4">
        <h3 className="text-sm font-semibold">Delivery</h3>
        <p className="mt-1 text-xs text-kumo-subtle">In-app is always available. External channels appear only when ready.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {state.channels.filter((channel) => channel.available).map((channel) => (
            <button key={channel.channel} type="button" className={cn("rounded-xl border px-3 py-2 text-sm", draft.preferredDeliveryChannel === channel.channel ? "border-kumo-brand bg-kumo-brand/5 text-kumo-strong" : "border-kumo-line text-kumo-subtle")} onClick={() => update("preferredDeliveryChannel", channel.channel)}>{CHANNEL_LABELS[channel.channel]}</button>
          ))}
        </div>
        {draft.preferredDeliveryChannel === "push" && (
          <label className="mt-4 block max-w-xs text-xs font-medium">Daily proactive push budget<input type="number" min={0} max={20} className="mt-1 block h-9 w-full rounded-lg border border-kumo-line bg-kumo-base px-3 text-sm" value={draft.maxProactivePushesPerDay} onChange={(event) => update("maxProactivePushesPerDay", Number(event.target.value))} /></label>
        )}
        {state.channels.filter((channel) => !channel.available).map((channel) => <p key={channel.channel} className="mt-2 text-xs text-kumo-subtle">{CHANNEL_LABELS[channel.channel]} unavailable: {channel.reason}</p>)}
      </section>

      {error && <p role="alert" className="flex items-center gap-2 text-sm text-kumo-danger"><WarningCircleIcon className="size-4" />{error}</p>}
      <div className="flex items-center gap-3"><Button onClick={() => void save()} loading={saving}>Save delivery settings</Button>{saved && <span role="status" className="flex items-center gap-1.5 text-sm text-kumo-success"><CheckCircleIcon className="size-4" weight="fill" />Saved</span>}</div>

      <section className="border-t border-kumo-hairline pt-6"><h3 className="text-sm font-semibold">Delivery history</h3><p className="mt-1 text-xs text-kumo-subtle">Generated checkpoint, schedule, channel, retries, and failures.</p><DeliveryHistory deliveries={state.deliveries} timezone={draft.ownerTimezone} /></section>
    </fieldset>
  );
}
