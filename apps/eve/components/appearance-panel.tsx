"use client";
import { invalidateOwnerBrowserSession } from "@/lib/owner-browser-storage";

import { CheckCircleIcon, SignOutIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import {
  readThemePreference,
  saveThemePreference,
  type ThemePreference,
} from "@/lib/appearance";
import { AGENT_NAME, OWNER_NAME } from "@/lib/identity";
import { cn } from "@/lib/utils";

export function AppearancePanel() {
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [saved, setSaved] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => setTheme(readThemePreference()), []);

  function chooseTheme(nextTheme: ThemePreference) {
    setTheme(nextTheme);
    saveThemePreference(nextTheme);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  async function signOut() {
    setSigningOut(true);
    setSignOutError(null);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Sign-out not confirmed");
      invalidateOwnerBrowserSession();
      window.location.assign("/login");
    } catch {
      setSignOutError("Sign-out could not be confirmed. Try again.");
      setSigningOut(false);
    }
  }

  const options: { value: ThemePreference; label: string; detail: string }[] = [
    { value: "system", label: "System", detail: "Match this device" },
    { value: "light", label: "Light", detail: "Bright and clean" },
    { value: "dark", label: "Dark", detail: "Quiet and focused" },
  ];

  return (
    <div className="flex flex-col gap-5">
      {signOutError && <p role="alert" className="text-sm text-kumo-danger">{signOutError}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-kumo-hairline p-4">
          <p className="text-xs font-medium tracking-wide text-kumo-subtle uppercase">Assistant</p>
          <p className="mt-2 text-base font-semibold">{AGENT_NAME}</p>
          <p className="mt-1 text-xs text-kumo-subtle">Your personal AI agent</p>
        </div>
        <div className="rounded-xl border border-kumo-hairline p-4">
          <p className="text-xs font-medium tracking-wide text-kumo-subtle uppercase">Works for</p>
          <p className="mt-2 text-base font-semibold">{OWNER_NAME}</p>
          <p className="mt-1 text-xs text-kumo-subtle">Used in greetings and task context</p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Theme</h3>
            <p className="mt-0.5 text-xs text-kumo-subtle">Applied throughout MyEve.</p>
          </div>
          <span
            className={cn(
              "text-xs text-kumo-success transition-opacity",
              saved ? "opacity-100" : "opacity-0",
            )}
          >
            Saved
          </span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Theme">
          {options.map((option) => {
            const selected = theme === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                onKeyDown={(event) => {
                  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
                  event.preventDefault();
                  const current = options.findIndex(item => item.value === option.value);
                  const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (current + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) + options.length) % options.length;
                  chooseTheme(options[next].value);
                  const radios = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
                  radios?.[next]?.focus();
                }}
                className={cn(
                  "flex min-h-20 items-start justify-between rounded-xl border p-3 text-start transition-colors",
                  selected
                    ? "border-kumo-brand bg-kumo-tint"
                    : "border-kumo-hairline hover:bg-kumo-tint",
                )}
                onClick={() => chooseTheme(option.value)}
              >
                <span>
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="mt-1 block text-xs text-kumo-subtle">{option.detail}</span>
                </span>
                {selected && <CheckCircleIcon className="size-4 text-kumo-interact" aria-hidden />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-kumo-hairline pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-lg text-xs leading-5 text-kumo-subtle">
          Names come from this deployment&rsquo;s environment so {AGENT_NAME}&rsquo;s identity stays consistent
          in chat, notifications, and background work.
        </p>
        <button
          type="button"
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-kumo-hairline px-3 text-xs font-medium transition-colors hover:bg-kumo-tint"
          onClick={() => void signOut()}
          disabled={signingOut}
        >
          <SignOutIcon className="size-4" aria-hidden /> {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </div>
  );
}
