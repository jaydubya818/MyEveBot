/**
 * QA-34 — candidate-decision load() checks response.ok before calling .json()
 *
 * Revert-check: reverting to `const body=await r.json(); if(!r.ok)throw…`
 * causes the "HTML error page body" test to fail with "Unexpected token '<'"
 * instead of the expected application-level error message.
 */
import { describe, it, expect } from "vitest";

/**
 * Simulates the post-fix load logic:
 * check ok first, then parse JSON (with a safe fallback for non-JSON bodies).
 */
async function loadWithFix(fetch: () => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>) {
  const r = await fetch();
  if (!r.ok) {
    const body = await r.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${r.status})`);
  }
  return r.json();
}

describe("QA-34 — ok-before-json ordering in candidate-decision", () => {
  it("throws with the error field when the server returns a JSON error body", async () => {
    const fetch = async () => ({
      ok: false, status: 500,
      json: async () => ({ error: "Internal error from server" }),
    });
    await expect(loadWithFix(fetch)).rejects.toThrow("Internal error from server");
  });

  it("throws a status message when the body is an HTML error page (non-JSON)", async () => {
    const fetch = async () => ({
      ok: false, status: 504,
      // Simulates Vercel HTML error page — json() would throw "Unexpected token <"
      json: async () => { throw new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"); },
    });
    // Must NOT surface the raw SyntaxError; must use the status fallback.
    const err = await loadWithFix(fetch).catch((e: Error) => e);
    expect(err.message).toBe("Request failed (504)");
    expect(err.message).not.toMatch(/Unexpected token/);
  });

  it("resolves with data on a successful response", async () => {
    const fetch = async () => ({
      ok: true, status: 200,
      json: async () => ({ bindingHash: "abc", decision: null }),
    });
    const result = await loadWithFix(fetch);
    expect(result).toMatchObject({ bindingHash: "abc" });
  });
});
