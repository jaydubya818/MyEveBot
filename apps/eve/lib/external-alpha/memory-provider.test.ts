import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: vi.fn(), query: vi.fn() }));
vi.mock("../../agent/lib/receipts-db.ts", () => ({ db: mocks.db }));

import { memoryStore } from "../../agent/lib/memory-store.ts";

const ownerId = "owner-alpha";
const row = {
  id: "m1", owner_id: ownerId, scope_type: "owner", scope_id: ownerId, content: "prefers short answers", provider: "local", provider_id: null,
  permanent: false, confidence: 1, source_type: "explicit", source_id: null, updated_at: "2026-10-01T00:00:00.000Z",
  last_confirmed_at: "2026-10-01T00:00:00.000Z", status: "active",
};

describe("Memory never sends owner data to the third-party provider under an external-alpha installation", () => {
  const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubEnv("SUPERMEMORY_API_KEY", "synthetic-key-present");
    vi.stubEnv("MYEVE_OWNER_ID", ownerId);
    mocks.db.mockReturnValue({ query: mocks.query });
    mocks.query.mockImplementation(async (sql: string) => (/^\s*(INSERT|SELECT|UPDATE)/i.test(sql) ? [row] : []));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("writes locally and makes no provider request even though a key is present", async () => {
    vi.stubEnv("EVE_PROJECT_NAME", "myeve-alpha-tester-1");
    const entry = await memoryStore.add("prefers short answers", { context: { ownerId, agentId: "agent_x" }, scope: { type: "owner", id: ownerId } });
    expect(entry).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
    await memoryStore.search("short", { ownerId, agentId: "agent_x" }).catch(() => undefined);
    await memoryStore.deleteForOwnerDetailed(ownerId, "m1").catch(() => undefined);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls.some((c) => /supermemory_unknown/.test(String(c[0])))).toBe(false);
  });

  it("control: outside an installation the same key does reach the provider", async () => {
    await memoryStore.add("prefers short answers", { context: { ownerId, agentId: "agent_x" }, scope: { type: "owner", id: ownerId } }).catch(() => undefined);
    expect(fetchSpy).toHaveBeenCalled();
  });
});
