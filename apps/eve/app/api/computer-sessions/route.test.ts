import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
}));

vi.mock("@/lib/computer-sessions", () => ({
  createComputerSession: mocks.create,
  listComputerSessions: mocks.list,
}));

vi.mock("@/lib/web-auth", () => ({
  requireWebAuth: vi.fn(() => null),
  webPrincipal: vi.fn(() => ({ id: "owner-a" })),
}));

import { GET, POST } from "./route";

describe("Computer session API errors", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgres://configured");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("does not expose database failures", async () => {
    mocks.list.mockRejectedValueOnce(new Error("driver failed for postgresql://admin:secret@db.internal/myeve"));
    const response = await GET(new Request("https://myeve.example/api/computer-sessions", { headers: { "x-request-id": "db-failure" } }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: { code: "computer_sessions_unavailable", message: "Computer sessions are temporarily unavailable.", requestId: "db-failure" } });
    expect(JSON.stringify(body)).not.toMatch(/postgres|admin|secret|db\.internal/i);
  });

  it("rejects malformed session input with a stable public error", async () => {
    const response = await POST(new Request("https://myeve.example/api/computer-sessions", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "malformed-session" },
      body: JSON.stringify({ agentId: 42, runtimeSessionId: null }),
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: { code: "invalid_computer_session", message: "agentId and runtimeSessionId are required.", requestId: "malformed-session" } });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
