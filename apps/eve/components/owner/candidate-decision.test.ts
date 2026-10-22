/**
 * Regression test for QA-34.
 *
 * Tests the real fetchOwnerDecision() extracted from candidate-decision.tsx.
 * The fix checks response.ok BEFORE calling .json() so that HTML error pages
 * (e.g. Vercel 504) produce a readable status-based message rather than a
 * raw SyntaxError.
 *
 * Revert-check: reverting candidate-decision-fetch.ts to call .json() before
 * checking .ok causes the "HTML error page" test to reject with
 * "Unexpected token '<'" instead of "Request failed (504)".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchOwnerDecision } from "@/lib/candidate-decision-fetch";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => { vi.clearAllMocks(); });

describe("fetchOwnerDecision — QA-34", () => {
  it("returns parsed data on a 200 response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ bindingHash: "abc", decision: null }),
    });
    const result = await fetchOwnerDecision("work-1");
    expect((result as { bindingHash: string }).bindingHash).toBe("abc");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("work-1"),
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("throws the server error field when the response is a JSON error body", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "Internal error from server" }),
    });
    await expect(fetchOwnerDecision("work-2")).rejects.toThrow(
      "Internal error from server",
    );
  });

  it("throws a status-code message when the body is an HTML page (non-JSON)", async () => {
    // Simulates a Vercel 504 that returns an HTML body.
    // Before the fix, r.json() throws 'Unexpected token <...' which was surfaced raw.
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 504,
      json: async () => {
        throw new SyntaxError(
          "Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON",
        );
      },
    });
    let err: Error | undefined;
    try {
      await fetchOwnerDecision("work-3");
    } catch (e) {
      err = e instanceof Error ? e : new Error(String(e));
    }
    expect(err?.message).toBe("Request failed (504)");
    expect(err?.message).not.toMatch(/Unexpected token/);
  });

  it("uses the status fallback when non-OK body has no error field", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({}), // empty JSON, no .error field
    });
    await expect(fetchOwnerDecision("work-4")).rejects.toThrow(
      "Request failed (422)",
    );
  });
});
