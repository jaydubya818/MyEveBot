"use client";

import { useEffect, useState } from "react";
import type { ComputerRuntimeState } from "@/lib/computer-runtime";

export const COMPUTER_RUNTIME_COPY: Record<ComputerRuntimeState, { title: string; detail: string }> = {
  DISABLED: { title: "Computer is disabled", detail: "This deployment does not include browser execution." },
  NOT_CONFIGURED: { title: "Computer needs configuration", detail: "Connect a runtime provider before starting an isolated browser session." },
  COLD: { title: "Computer is ready to start", detail: "The first session may take a little longer while MyEve prepares the runtime." },
  PREPARING: { title: "Preparing Computer…", detail: "MyEve is preparing the runtime. Status updates automatically." },
  READY: { title: "Computer is ready", detail: "Approved Agents can start an isolated browser session." },
  UNAVAILABLE: { title: "Computer couldn’t be prepared", detail: "Check status again before retrying your Computer request. Other features remain available." },
};

export function ComputerRuntimeStatus() {
  const [state, setState] = useState<ComputerRuntimeState | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch("/api/computer-runtime", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("unavailable");
        const body = await response.json();
        if (!(body.state in COMPUTER_RUNTIME_COPY)) throw new Error("unavailable");
        setState(body.state);
      } catch { if (!controller.signal.aborted) setState("UNAVAILABLE"); }
      if (!controller.signal.aborted) timer = setTimeout(poll, 5_000);
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [refresh]);
  const copy = state ? COMPUTER_RUNTIME_COPY[state] : { title: "Checking Computer status…", detail: "Runtime availability is separate from profile access and Agent permissions." };
  return <section className="rounded-2xl border border-kumo-hairline p-4" aria-label="Computer runtime">
    <div role="status" aria-live="polite"><h2 className="text-sm font-medium">{copy.title}</h2><p className="mt-1 text-sm leading-6 text-kumo-subtle">{copy.detail}</p></div>
    {state === "UNAVAILABLE" && <button className="mt-3 min-h-11 rounded-lg border border-kumo-hairline px-4 text-sm" onClick={() => setRefresh(value => value + 1)}>Check status</button>}
  </section>;
}
