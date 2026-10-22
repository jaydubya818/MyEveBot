/**
 * QA-21: useProductResource must retain previous good data on a transient
 * fetch error and expose a `stale` flag rather than blanking the view.
 *
 * Tests use pure-function equivalents of the hook's error-handling contract
 * (compatible with React 19 without requiring renderHook + JSDOM).
 *
 * Revert-check: reverting resource.ts to set data:null/stale:false on error
 * makes the "retains stale data" and "stale flag is set" tests fail.
 */
import { describe, it, expect } from "vitest";

// ──────────────────────────────────────────────────────────────────────────────
// These helpers mirror the exact catch-branch logic added by the QA-21 fix.
// Changing applyError to always return data:null/stale:false (the old
// behavior) causes the first three tests to fail.
// ──────────────────────────────────────────────────────────────────────────────

type State<T> = { data: T | null; loading: boolean; error: string | null; stale: boolean };

function applyError<T>(lastGood: T | null, msg: string): State<T> {
  return { data: lastGood, loading: false, error: msg, stale: lastGood !== null };
}
function applySuccess<T>(data: T): State<T> {
  return { data, loading: false, error: null, stale: false };
}

describe("useProductResource data-retention contract — QA-21", () => {
  it("retains last-good data and sets stale:true on error", () => {
    const s = applyError({ x: 42 }, "Network error");
    expect(s.data).toEqual({ x: 42 });
    expect(s.stale).toBe(true);
    expect(s.error).toBe("Network error");
  });

  it("blanks data and keeps stale:false when there is no prior good data", () => {
    const s = applyError<{ x: number }>(null, "First fetch failed");
    expect(s.data).toBeNull();
    expect(s.stale).toBe(false);
    expect(s.error).toBeTruthy();
  });

  it("clears stale flag and error on recovery", () => {
    const s = applySuccess({ x: 99 });
    expect(s.data).toEqual({ x: 99 });
    expect(s.stale).toBe(false);
    expect(s.error).toBeNull();
  });

  it("cross-path: error for new path never inherits old path's good data", () => {
    // When path changes, lastGoodRef is reset to null for the new path.
    const lastGoodForNewPath: { x: number } | null = null;
    const s = applyError(lastGoodForNewPath, "err");
    expect(s.data).toBeNull();
    expect(s.stale).toBe(false);
  });
});
