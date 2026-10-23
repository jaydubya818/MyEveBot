"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { invalidateOwnerBrowserSession } from "@/lib/owner-browser-storage";
export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    // Fragments stay out of HTTP logs and referrers; discard from this history entry.
    setToken(new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "");
    window.history.replaceState(null, "", window.location.pathname);
    setLoaded(true);
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (password !== confirm) { setError("The passwords do not match."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, newPassword: password }) });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error || "Password could not be reset. Try again.");
      invalidateOwnerBrowserSession();
      setPassword(""); setConfirm(""); setToken(""); setSuccess(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not connect. Try again."); }
    finally { setBusy(false); }
  }
  const inputStyle = "mt-2 h-12 w-full rounded-xl border border-kumo-line bg-kumo-control px-3 text-base focus:outline-2 focus:outline-kumo-brand";
  return <main className="grid min-h-dvh place-items-center bg-kumo-canvas px-5 py-10"><section className="w-full max-w-md rounded-2xl border border-kumo-hairline bg-kumo-elevated p-7">
    <h1 className="text-2xl font-semibold">Reset your password</h1>
    {!loaded ? <p role="status" className="mt-5">Loading reset link…</p> : success ? <div role="status" className="mt-5"><p>Password reset. All devices have been signed out.</p><a className="mt-5 inline-block min-h-11 py-3 font-medium underline" href="/login?passwordReset=1">Sign in with your new password</a></div>
      : !token ? <p role="alert" className="mt-5 text-sm leading-6">This reset link is missing or incomplete. <a href="/forgot-password" className="underline">Ask for a new link.</a></p>
        : <form onSubmit={submit} className="mt-5 flex flex-col gap-4"><p className="text-sm leading-6 text-kumo-subtle">Use 15–128 characters. Resetting signs out all devices and keeps your conversations and files.</p>
          <label className="text-sm font-medium">New password<input type="password" autoComplete="new-password" required minLength={15} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} disabled={busy} className={inputStyle} /></label>
          <label className="text-sm font-medium">Confirm new password<input type="password" autoComplete="new-password" required minLength={15} maxLength={128} value={confirm} onChange={e => setConfirm(e.target.value)} disabled={busy} className={inputStyle} /></label>
          {error && <p role="alert" className="text-sm text-kumo-danger">{error}</p>}
          <button disabled={busy} className="min-h-12 rounded-xl bg-kumo-brand px-5 py-3 font-medium text-white disabled:opacity-50">{busy ? "Resetting password…" : "Reset password"}</button>
        </form>}
  </section></main>;
}
