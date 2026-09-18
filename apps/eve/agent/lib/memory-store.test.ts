import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: vi.fn(), query: vi.fn() }));
vi.mock("./receipts-db.ts", () => ({ db: mocks.db }));

import { memoryStore } from "./memory-store";

describe("owner Memory deletion verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPERMEMORY_API_KEY = "test-key";
    mocks.db.mockReturnValue({ query: mocks.query });
    mocks.query.mockImplementation(async (sql: string) => sql.includes("SELECT provider_id") ? [{ provider_id: "remote_1" }] : []);
  });
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.SUPERMEMORY_API_KEY; });

  it("updates canonical metadata only after a provider read proves absence", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ forgotten: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response("not found", { status: 404 }));
    vi.stubGlobal("fetch", fetch);

    const result = await memoryStore.deleteForOwnerDetailed("owner-a", "memory_1");
    expect(result).toEqual({ found: true, deleted: true, remoteDeleted: true, remoteDeletionVerified: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]?.[0]).toBe("https://api.supermemory.ai/v3/memories/remote_1");
    expect(mocks.query.mock.calls.some((call) => String(call[0]).includes("status='deleted'"))).toBe(true);
  });

  it("keeps canonical Memory active when remote absence cannot be verified", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({ forgotten: true }), { status: 200 })));
    const result = await memoryStore.deleteForOwnerDetailed("owner-a", "memory_1");
    expect(result).toEqual({ found: true, deleted: false, remoteDeleted: true, remoteDeletionVerified: false });
    expect(mocks.query.mock.calls.some((call) => String(call[0]).includes("status='deleted'"))).toBe(false);
  });
});
