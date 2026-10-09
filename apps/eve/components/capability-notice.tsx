"use client";

import { Button } from "@cloudflare/kumo";
import { WarningCircleIcon } from "@phosphor-icons/react";

import { AGENT_NAME } from "@/lib/identity";

export type CapabilityNoticeState =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "limited"; labels: string[] }
  | { kind: "unavailable" };

export function CapabilityNotice({
  state,
  onReview,
}: {
  state: CapabilityNoticeState;
  onReview: () => void;
}) {
  if (state.kind === "loading" || state.kind === "ready") return null;

  const unavailable = state.kind === "unavailable";
  const detail = unavailable
    ? `${AGENT_NAME} can still chat, but service status could not be verified.`
    : `${state.labels.join(" and ")} ${state.labels.length === 1 ? "needs" : "need"} setup. Everything else remains available.`;

  return (
    <div
      className="mt-12 flex items-start gap-3 rounded-xl border border-kumo-warning/25 bg-kumo-warning/5 px-3.5 py-3 md:mt-3"
      role={unavailable ? "alert" : "status"}
    >
      <WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-kumo-warning" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-kumo-default">
          {unavailable ? "System status unavailable" : "Limited mode"}
        </p>
        <p className="mt-0.5 text-xs leading-5 text-kumo-subtle">{detail}</p>
      </div>
      <Button variant="ghost" size="sm" className="shrink-0" onClick={onReview}>
        Review setup
      </Button>
    </div>
  );
}
