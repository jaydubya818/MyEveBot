"use client";

import { useEffect, useState, type FormEvent } from "react";

type SetupState = "form" | "submitting" | "deploying" | "verifying" | "ready" | "failed";

export function JoinForm({ token, email, relayInviteUrl, claimed }: {
  token: string;
  email: string;
  relayInviteUrl: string;
  claimed: boolean;
}) {
  const [state, setState] = useState<SetupState>(claimed ? "deploying" : "form");
  const [ownerName, setOwnerName] = useState("");
  const [agentName, setAgentName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [eveUrl, setEveUrl] = useState<string | null>(null);

  useEffect(() => {
    if (state !== "deploying" && state !== "verifying") return;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const response = await fetch("/api/managed/join/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
          cache: "no-store",
        });
        const body = await response.json() as { state?: string; url?: string; error?: string };
        if (stopped) return;
        if (!response.ok) {
          setError(body.error ?? "Could not check setup status. Retrying…");
          return;
        }
        setError("");
        if (body.state === "ready" && body.url) {
          setEveUrl(body.url);
          setState("ready");
        } else if (body.state === "failed") {
          setError(body.error ?? "Setup stopped. Ask the beta operator for help.");
          setState("failed");
        } else if (body.state === "verifying") {
          setState("verifying");
        }
      } catch {
        if (!stopped) setError("Connection interrupted. Retrying setup status…");
      }
    }, 5000);
    return () => { stopped = true; clearInterval(timer); };
  }, [state, token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setState("submitting");
    setError("");
    try {
      const response = await fetch("/api/managed/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          ownerName,
          agentName,
          ownerTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          accessPassword: password,
        }),
      });
      const body = await response.json() as { error?: string };
      setPassword("");
      setConfirmPassword("");
      if (!response.ok) throw new Error(body.error ?? "Could not start setup.");
      setState("deploying");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start setup.");
      setState("form");
    }
  }

  return (
    <div className="mt-10 grid gap-6 md:grid-cols-2">
      <section className="rounded-xl border border-gray-a5 bg-gray-2 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-10">Step 1</p>
        <h2 className="mt-2 text-xl font-semibold">Accept your Relay invitation</h2>
        <p className="mt-3 text-sm leading-6 text-gray-11">This invitation belongs to <strong className="text-gray-12">{email}</strong>. Create your Relay account, then return here to set up your Eve.</p>
        <a href={relayInviteUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="mt-5 inline-block rounded-lg border border-gray-a6 px-4 py-3 text-sm font-semibold hover:bg-gray-3">Open Relay invitation ↗</a>
      </section>
      <section className="rounded-xl border border-gray-a5 bg-gray-2 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-10">Step 2</p>
        <h2 className="mt-2 text-xl font-semibold">Set up your Eve</h2>
        {state === "form" ? (
          <form onSubmit={submit} className="mt-4 grid gap-4">
            <label className="grid gap-1 text-sm">Your name<input required maxLength={100} value={ownerName} onChange={(event) => setOwnerName(event.target.value)} autoComplete="name" className="rounded-lg border border-gray-a6 bg-gray-1 px-3 py-2" /></label>
            <label className="grid gap-1 text-sm">Your Eve’s name<input required maxLength={100} value={agentName} onChange={(event) => setAgentName(event.target.value)} className="rounded-lg border border-gray-a6 bg-gray-1 px-3 py-2" /></label>
            <label className="grid gap-1 text-sm">Eve sign-in password<input required minLength={12} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" className="rounded-lg border border-gray-a6 bg-gray-1 px-3 py-2" /></label>
            <label className="grid gap-1 text-sm">Confirm password<input required minLength={12} type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" className="rounded-lg border border-gray-a6 bg-gray-1 px-3 py-2" /></label>
            <p className="text-xs leading-5 text-gray-10">We create a dedicated Vercel project and database. You can download your owner archive from Eve’s Manage page. Binary file features are unavailable in this first managed profile.</p>
            {error && <p role="alert" className="text-sm text-red-9">{error}</p>}
            <button className="rounded-lg bg-gray-12 px-4 py-3 text-sm font-semibold text-gray-1 hover:opacity-90">Create my Eve</button>
          </form>
        ) : state === "ready" && eveUrl ? (
          <div className="mt-4">
            <p role="status" className="text-sm leading-6 text-gray-11">Your Eve is online. Sign in, then open Manage → Relay to finish the connection and choose any sharing permissions.</p>
            <a href={eveUrl} className="mt-5 inline-block rounded-lg bg-gray-12 px-4 py-3 text-sm font-semibold text-gray-1">Open your Eve →</a>
          </div>
        ) : (
          <div className="mt-4">
            <p role="status" className="text-sm leading-6 text-gray-11">{state === "submitting" ? "Starting your isolated environment…" : state === "deploying" ? "Building your Eve… This may take a few minutes." : state === "verifying" ? "Checking your Eve’s health…" : "Setup needs operator attention."}</p>
            {error && <p role="alert" className="mt-3 text-sm text-red-9">{error}</p>}
          </div>
        )}
      </section>
    </div>
  );
}
