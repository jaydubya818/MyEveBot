import { afterEach, beforeEach, expect, it, vi } from "vitest";

const upsertThread = vi.hoisted(() => vi.fn());
const assertThreadOwner = vi.hoisted(() => vi.fn());
const getAgent = vi.hoisted(() => vi.fn());
vi.mock("./threads-db", async (importOriginal) => ({
  ...await importOriginal<typeof import("./threads-db")>(),
  assertThreadOwner,
  upsertThread,
}));
vi.mock("./agents", () => ({ getAgent }));

import { PUT } from "../app/api/threads/[id]/route";
import { ThreadOwnerConflictError } from "./threads-db";
import { createWebSessionToken } from "./web-auth";

beforeEach(() => {
  upsertThread.mockReset();
  assertThreadOwner.mockReset();
  getAgent.mockReset();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("MYEVE_ACCESS_PASSWORD", "local-test-password-only");
  vi.stubEnv("MYEVE_SESSION_SECRET", "test-only-secret-long-enough-for-owner-auth");
  vi.stubEnv("MYEVE_OWNER_ID", "current-owner");
  vi.stubEnv("DATABASE_URL", "postgres://fixture.invalid/local");
});
afterEach(() => vi.unstubAllEnvs());

function put(id: string, agentId?: string): Promise<Response> {
  const request = new Request(`https://app.test/api/threads/${id}`, {
    method: "PUT",
    headers: { cookie: `myeve_session=${createWebSessionToken()}`, "content-type": "application/json" },
    body: JSON.stringify({ title: "Chat", updatedAt: 1, ...(agentId ? { agentId } : {}), chat: { events: [] } }),
  });
  return PUT(request, { params: Promise.resolve({ id }) });
}

it("returns a specific conflict without changing owner authorization", async () => {
  upsertThread.mockRejectedValue(new ThreadOwnerConflictError());

  const response = await put("older");

  expect(response.status).toBe(409);
  expect((await response.json()).error.code).toBe("thread_owner_conflict");
  expect(upsertThread).toHaveBeenCalledWith("current-owner", "older", expect.anything(), { events: [] });
});

it("still saves a fresh thread for the authenticated owner", async () => {
  upsertThread.mockResolvedValue(undefined);

  const response = await put("new");

  expect(response.status).toBe(200);
  expect(upsertThread).toHaveBeenCalledWith("current-owner", "new", expect.anything(), { events: [] });
});

it("reports a foreign thread before validating its old Agent", async () => {
  getAgent.mockResolvedValue(null);
  assertThreadOwner.mockRejectedValue(new ThreadOwnerConflictError());

  const response = await put("older-agent", "legacy-agent");

  expect(response.status).toBe(409);
  expect((await response.json()).error.code).toBe("thread_owner_conflict");
  expect(assertThreadOwner).toHaveBeenCalledWith("current-owner", "older-agent");
  expect(upsertThread).not.toHaveBeenCalled();
});
