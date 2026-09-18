"use client";

import { Button } from "@cloudflare/kumo";
import { ClockCounterClockwiseIcon, IdentificationBadgeIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { ComputerSessionsPanel } from "@/components/computer-sessions-panel";
import { ComputerViewer } from "@/components/computer-viewer";
import { cn } from "@/lib/utils";

type ComputerTab = "profiles" | "activity";

export function ComputerWorkspace() {
  const [tab, setTab] = useState<ComputerTab>("profiles");
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 ps-8 md:ps-0">
        <div>
          <div className="flex items-center gap-2 text-kumo-subtle"><IdentificationBadgeIcon className="size-4" /><span className="text-xs font-medium uppercase tracking-[0.14em]">Controlled browser access</span></div>
          <h1 className="mt-2 text-xl font-semibold tracking-tight">Computer</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-kumo-subtle">Persistent signed-in profiles for approved account work, plus the complete activity record for isolated browser sessions.</p>
        </div>
        <div className="flex rounded-xl border border-kumo-hairline bg-kumo-tint p-1" role="tablist" aria-label="Computer views">
          <Button size="sm" variant={tab === "profiles" ? "primary" : "ghost"} icon={IdentificationBadgeIcon} onClick={() => setTab("profiles")} role="tab" aria-selected={tab === "profiles"}>Profiles</Button>
          <Button size="sm" variant={tab === "activity" ? "primary" : "ghost"} icon={ClockCounterClockwiseIcon} onClick={() => setTab("activity")} role="tab" aria-selected={tab === "activity"}>Activity</Button>
        </div>
      </header>

      <section className={cn(tab !== "profiles" && "hidden")} role="tabpanel">
        <div className="mb-4 rounded-2xl border border-kumo-hairline bg-kumo-tint px-4 py-3 text-xs leading-5 text-kumo-subtle"><strong className="text-kumo-default">Passwords stay with you.</strong> Sign in through owner takeover. MyEve stores profile ownership, state, and sharing grants; Orgo retains the encrypted desktop and browser session.</div>
        <ComputerViewer />
      </section>
      <section className={cn(tab !== "activity" && "hidden")} role="tabpanel">
        <ComputerSessionsPanel embedded />
      </section>
    </div>
  );
}
