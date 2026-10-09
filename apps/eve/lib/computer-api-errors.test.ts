import { afterEach, describe, expect, it, vi } from "vitest";

import { computerApiFailure } from "./computer-api-errors";

afterEach(() => vi.restoreAllMocks());

describe("Computer API failures", () => {
  it.each([
    ["database", new Error("connect ECONNREFUSED postgresql://admin:secret@db.internal:5432/myeve")],
    ["provider", new Error("provider https://desktop.internal/session/secret-token failed; api_key=provider-secret")],
  ])("returns a stable public error for %s failures", async (_kind, failure) => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = computerApiFailure(
      new Request("https://myeve.example/api/computer", { headers: { "x-request-id": "request-123" } }),
      failure,
      { context: "Computer request failed" },
    );
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: { code: "computer_unavailable", message: "The computer session is currently unavailable.", requestId: "request-123" } });
    expect(serialized).not.toMatch(/postgres|admin|secret|desktop\.internal|api_key/i);
    expect(logged).toHaveBeenCalledWith("Computer request failed", expect.objectContaining({ requestId: "request-123" }));
    expect(JSON.stringify(logged.mock.calls)).not.toContain("postgresql://admin:secret");
    expect(JSON.stringify(logged.mock.calls)).not.toContain("desktop.internal");
    expect(JSON.stringify(logged.mock.calls)).not.toContain("api_key=provider-secret");
  });
});
