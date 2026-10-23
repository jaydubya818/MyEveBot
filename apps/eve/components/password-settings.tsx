"use client";
import { useState, type FormEvent } from "react";
import { OWNER_BROWSER_EVENT } from "@/lib/owner-browser-storage";

export function PasswordSettings() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (password !== confirm) { setError("The new passwords do not match."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: current, newPassword: password }) });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error || "Password could not be changed. Try again.");
      // Other tabs return to sign-in; this tab keeps the explicit success confirmation.
      try { window.localStorage.setItem(OWNER_BROWSER_EVENT, crypto.randomUUID()); } catch { /* Storage may be unavailable. */ }
      setCurrent(""); setPassword(""); setConfirm(""); setSuccess(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not connect. Try again."); }
    finally { setBusy(false); }
  }
  const inputStyle = "mt-2 h-12 w-full rounded-xl border border-kumo-line bg-kumo-control px-3 text-base text-kumo-default focus:outline-2 focus:outline-kumo-brand";
  return <section className="mt-8 max-w-lg border-t border-kumo-hairline pt-6" aria-labelledby="password-title">
    <h2 id="password-title" className="text-lg font-semibold">Change Password</h2>
    <p className="mt-2 text-sm leading-6 text-kumo-subtle">Use 15–128 characters. Changing your password signs out all devices and keeps your conversations and files.</p>
    {success ? <div role="status" className="mt-5 rounded-xl border border-kumo-hairline p-4"><p>Password changed. All devices have been signed out.</p><a className="mt-3 inline-block min-h-11 py-3 font-medium underline" href="/login?passwordChanged=1">Sign in with your new password</a></div>
      : <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
        <label className="text-sm font-medium">Current password<input type="password" name="currentPassword" autoComplete="current-password" required maxLength={128} value={current} onChange={e => setCurrent(e.target.value)} disabled={busy} className={inputStyle} /></label>
        <label className="text-sm font-medium">New password<input type="password" name="newPassword" autoComplete="new-password" required minLength={15} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} disabled={busy} className={inputStyle} /></label>
        <label className="text-sm font-medium">Confirm new password<input type="password" name="confirmPassword" autoComplete="new-password" required minLength={15} maxLength={128} value={confirm} onChange={e => setConfirm(e.target.value)} disabled={busy} className={inputStyle} /></label>
        {error && <p role="alert" className="text-sm text-kumo-danger">{error}</p>}
        <button disabled={busy} className="min-h-12 rounded-xl bg-kumo-brand px-5 py-3 text-sm font-medium text-white disabled:opacity-50">{busy ? "Changing password…" : "Change password"}</button>
        <a href="/forgot-password" className="min-h-11 py-3 text-sm underline">Forgot your password?</a>
      </form>}
  </section>;
}
