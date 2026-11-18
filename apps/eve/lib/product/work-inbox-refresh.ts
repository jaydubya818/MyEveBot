/**
 * Refresh state for the Work inbox. The inbox polls; one slow or failed poll must not replace Work that was already shown with an error.
 * - a successful refresh always wins;
 * - a failed refresh keeps the last good view and only marks it stale;
 * - the blocking error is shown only when there is nothing to show yet;
 * - an ended session (401) is reported as such, never as "could not be refreshed".
 */
export type InboxRefreshState<T> = { data: T | null; error: null | "failed" | "signed-out"; stale: boolean };
export type InboxRefreshOutcome<T> = { ok: true; data: T } | { ok: false; status?: number };
export const initialInboxRefresh = <T>(): InboxRefreshState<T> => ({ data: null, error: null, stale: false });
/** The inbox read fans out per Work item and can take several seconds on a cold function; allow for that before calling a poll failed. */
export const INBOX_REFRESH_TIMEOUT_MS = 30_000;

export function nextInboxRefresh<T>(previous: InboxRefreshState<T>, outcome: InboxRefreshOutcome<T>): InboxRefreshState<T> {
  if (outcome.ok) return { data: outcome.data, error: null, stale: false };
  if (outcome.status === 401) return { data: null, error: "signed-out", stale: false };
  if (previous.data !== null) return { data: previous.data, error: null, stale: true };
  return { data: null, error: "failed", stale: false };
}
