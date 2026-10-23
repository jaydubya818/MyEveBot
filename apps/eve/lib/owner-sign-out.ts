"use client";

import { invalidateOwnerBrowserSession } from "@/lib/owner-browser-storage";

/**
 * Shared owner sign-out (QA-31). Confirms the logout POST before clearing
 * the browser namespace. Callers navigate only after this returns true.
 */
export async function confirmOwnerSignOut(): Promise<boolean> {
  try {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) return false;
    invalidateOwnerBrowserSession();
    return true;
  } catch {
    return false;
  }
}
