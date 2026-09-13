"use client";

import { Button } from "@cloudflare/kumo";
import { ArrowRightIcon, LockKeyIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { type FormEvent, useEffect, useState } from "react";

import { AGENT_NAME, OWNER_NAME } from "@/lib/identity";

function safeDestination(): string {
  const requested = new URLSearchParams(window.location.search).get("returnTo");
  return requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/";
}

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);

  useEffect(() => {
    setSetupRequired(new URLSearchParams(window.location.search).get("setup") === "required");
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || password.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        if (response.status === 503) setSetupRequired(true);
        throw new Error(body?.error ?? "Could not sign in.");
      }
      window.location.replace(safeDestination());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.");
      setSubmitting(false);
    }
  }

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-kumo-canvas px-5 py-10">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        aria-hidden
        style={{
          background:
            "radial-gradient(circle at 18% 12%, color-mix(in srgb, var(--color-kumo-brand) 16%, transparent) 0, transparent 36%), radial-gradient(circle at 88% 86%, color-mix(in srgb, var(--color-kumo-info) 11%, transparent) 0, transparent 32%)",
        }}
      />
      <section className="relative w-full max-w-md rounded-3xl border border-kumo-hairline bg-kumo-elevated/95 p-7 shadow-2xl shadow-black/10 backdrop-blur sm:p-9">
        <div className="mb-8 flex items-center justify-between">
          <div className="grid size-11 place-items-center rounded-2xl border border-kumo-hairline bg-kumo-tint text-kumo-strong">
            <span className="text-lg font-semibold">{AGENT_NAME.slice(0, 1).toUpperCase()}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-kumo-hairline px-2.5 py-1 text-[11px] font-medium tracking-wide text-kumo-subtle uppercase">
            <LockKeyIcon className="size-3.5" aria-hidden /> Private
          </div>
        </div>

        <p className="text-xs font-medium tracking-[0.14em] text-kumo-subtle uppercase">
          Personal workspace
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-kumo-strong">
          Welcome back, {OWNER_NAME}
        </h1>
        <p className="mt-3 max-w-sm text-sm leading-6 text-kumo-subtle">
          Unlock {AGENT_NAME} to open your conversations, memory, automations, and connected apps.
        </p>

        {setupRequired && (
          <div className="mt-7 flex gap-3 rounded-2xl border border-kumo-warning/30 bg-kumo-warning/5 p-4 text-left">
            <WarningCircleIcon className="mt-0.5 size-5 shrink-0 text-kumo-warning" aria-hidden />
            <div>
              <p className="text-sm font-medium text-kumo-strong">Deployment setup required</p>
              <p className="mt-1 text-xs leading-5 text-kumo-subtle">
                Add the access password and session secret in the deployment environment, then
                redeploy {AGENT_NAME}.
              </p>
            </div>
          </div>
        )}

        <form className={setupRequired ? "mt-5" : "mt-8"} onSubmit={submit}>
          <label htmlFor="password" className="text-xs font-medium text-kumo-default">
            Access password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            disabled={setupRequired}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 h-11 w-full rounded-xl border border-kumo-line bg-kumo-control px-3.5 text-sm text-kumo-default outline-none transition focus:border-kumo-brand focus:ring-2 focus:ring-kumo-focus/30"
            placeholder="Enter your password"
          />
          <div className="mt-2 min-h-5 text-xs text-kumo-danger" aria-live="polite">
            {error}
          </div>
          <Button
            type="submit"
            variant="primary"
            className="mt-3 w-full justify-center"
            disabled={setupRequired || submitting || password.length === 0}
          >
            {submitting ? `Opening ${AGENT_NAME}…` : `Open ${AGENT_NAME}`}
            {!submitting && <ArrowRightIcon className="ms-1 size-4" aria-hidden />}
          </Button>
        </form>

        <p className="mt-7 border-t border-kumo-hairline pt-5 text-xs leading-5 text-kumo-subtle">
          Your session stays on this device for seven days. The password is stored only in your
          deployment environment.
        </p>
      </section>
    </main>
  );
}
