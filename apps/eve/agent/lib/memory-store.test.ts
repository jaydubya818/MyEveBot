import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: vi.fn(), query: vi.fn() }));
vi.mock("./receipts-db.ts", () => ({ db: mocks.db }));

import { memoryStore } from "./memory-store";

describe("owner Memory deletion verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPERMEMORY_API_KEY = "test-key";
    mocks.db.mockReturnValue({ query: mocks.query });
    mocks.query.mockImplementation(async (sql: string) => sql.includes("SELECT provider,provider_id") ? [{ provider: "supermemory", provider_id: "remote_1" }] : []);
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

function memoryRow(input: {
  id: string; ownerId: string; scopeType: string; scopeId: string; content: string;
  provider?: string; providerId?: string | null;
}) {
  return {
    id: input.id, owner_id: input.ownerId, scope_type: input.scopeType, scope_id: input.scopeId,
    content: input.content, provider: input.provider ?? "supermemory", provider_id: input.providerId ?? null,
    permanent: false, confidence: 1, source_type: "explicit", source_id: null,
    updated_at: "2026-09-25T12:00:00.000Z", last_confirmed_at: "2026-09-25T12:00:00.000Z",
    status: "active",
  };
}

describe("durable Memory during semantic provider failure", () => {
  const context = { ownerId: "memory-outage-owner", agentId: "agent_researcher" };
  const ownerScope = { type: "owner" as const, id: context.ownerId };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPERMEMORY_API_KEY = "test-key";
    process.env.MYEVE_OWNER_ID = context.ownerId;
    mocks.db.mockReturnValue({ query: mocks.query });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SUPERMEMORY_API_KEY;
    delete process.env.MYEVE_OWNER_ID;
  });

  it("reads existing local memory and saves new explicit memory without completing unreadable legacy import", async () => {
    const existing = memoryRow({ id: "memory_existing", ownerId: context.ownerId, scopeType: "owner", scopeId: context.ownerId, content: "Prefer concise summaries", providerId: "remote_existing" });
    const foreign = memoryRow({ id: "memory_foreign", ownerId: "other-owner", scopeType: "owner", scopeId: "other-owner", content: "Prefer private notes", providerId: "remote_foreign" });
    let saved: ReturnType<typeof memoryRow> | null = null;
    mocks.query.mockImplementation(async (sql: string, args: unknown[]) => {
      if (sql.includes("FROM memory_scope_migrations")) return [];
      if (sql.includes("INSERT INTO memory_scope_migrations")) throw new Error("Unreadable remote list must not complete migration");
      if (sql.includes("INSERT INTO memory_records")) {
        saved = memoryRow({ id: String(args[0]), ownerId: String(args[1]), scopeType: String(args[2]), scopeId: String(args[3]), content: String(args[4]), provider: "local" });
        return [saved];
      }
      if (sql.includes("SELECT * FROM memory_records")) return [existing, foreign, ...(saved ? [saved] : [])];
      return [];
    });
    const fetch = vi.fn(async (_url: unknown) => new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetch);

    const listed = await memoryStore.list(context);
    expect(listed.map((entry) => entry.id)).toEqual(["memory_existing"]);
    expect(listed[0]).toMatchObject({ syncState: "synced", retrievalSource: "local", degraded: true });
    const found = await memoryStore.search("concise", context);
    expect(found.map((entry) => entry.id)).toEqual(["memory_existing"]);
    expect(found[0]).toMatchObject({ retrievalSource: "local_fallback", degraded: true });
    const added = await memoryStore.add("Use concise issue summaries", { context, scope: ownerScope });
    expect(added).toMatchObject({ content: "Use concise issue summaries", syncState: "local_only", degraded: true });
    expect(fetch.mock.calls.every(([url]) => String(url).endsWith("/v4/memories/list"))).toBe(true);
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO memory_scope_migrations"))).toBe(false);
    const searchCall = mocks.query.mock.calls.find(([sql]) => String(sql).includes("strpos(lower(content),term)"));
    expect(searchCall?.[0]).toContain("owner_id=$1");
    expect(searchCall?.[0]).toContain("visible.type=memory_records.scope_type");
    expect(searchCall?.[1]?.slice(0, 3)).toEqual([context.ownerId, ["owner", "agent"], [context.ownerId, context.agentId]]);
  });

  it("returns local memory when the provider hangs instead of waiting past Context Assembly's memory window", async () => {
    const existing = memoryRow({ id: "memory_hung_provider", ownerId: context.ownerId, scopeType: "owner", scopeId: context.ownerId, content: "Keep the local record", providerId: "remote_hung" });
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM memory_scope_migrations")) return [];
      if (sql.includes("SELECT * FROM memory_records")) return [existing];
      return [];
    });
    vi.stubGlobal("fetch", vi.fn((_url: unknown, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new Error("request aborted")), { once: true });
    })));

    const started = Date.now();
    const found = await memoryStore.search("local record", context);
    expect(found[0]).toMatchObject({ id: existing.id, retrievalSource: "local_fallback", degraded: true });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("treats empty successful provider list and search responses as degraded local reads", async () => {
    const existing = memoryRow({ id: "memory_empty_response", ownerId: context.ownerId, scopeType: "owner", scopeId: context.ownerId, content: "Keep this local", providerId: "remote_empty" });
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM memory_scope_migrations")) return [];
      if (sql.includes("INSERT INTO memory_scope_migrations")) throw new Error("An unreadable provider must not complete migration");
      if (sql.includes("SELECT * FROM memory_records")) return [existing];
      return [];
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));

    expect((await memoryStore.list(context))[0]).toMatchObject({ id: existing.id, degraded: true });
    expect((await memoryStore.search("local", context))[0]).toMatchObject({ id: existing.id, retrievalSource: "local_fallback", degraded: true });
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO memory_scope_migrations"))).toBe(false);
  });

  it("treats an empty successful provider write as uncertain while preserving the local record", async () => {
    let row: ReturnType<typeof memoryRow> | null = null;
    mocks.query.mockImplementation(async (sql: string, args: unknown[]) => {
      if (sql.includes("FROM memory_scope_migrations")) return [{ owner_id: context.ownerId }];
      if (sql.includes("INSERT INTO memory_records")) {
        row = memoryRow({ id: String(args[0]), ownerId: String(args[1]), scopeType: String(args[2]), scopeId: String(args[3]), content: String(args[4]), provider: "local" });
        return [row];
      }
      if (sql.includes("provider='supermemory_unknown'")) { row = { ...row!, provider: "supermemory_unknown" }; return [{id: row.id}]; }
      if (sql.includes("SELECT * FROM memory_records")) return row ? [row] : [];
      return [];
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));

    const saved = await memoryStore.add("Preserve this explicit memory", { context, scope: ownerScope });
    expect(saved).toMatchObject({ syncState: "remote_unknown", degraded: true });
    expect((await memoryStore.list(context))[0]).toMatchObject({ id: saved.id, syncState: "remote_unknown" });
  });

  it("keeps new memory local-only if the provider key disappears after legacy import", async () => {
    const importedOwner = "memory-key-removed-owner";
    const importedContext = { ownerId: importedOwner, agentId: context.agentId };
    let saved: ReturnType<typeof memoryRow> | null = null;
    mocks.query.mockImplementation(async (sql: string, args: unknown[]) => {
      if (sql.includes("FROM memory_scope_migrations")) return [{ owner_id: importedOwner }];
      if (sql.includes("INSERT INTO memory_records")) {
        saved = memoryRow({ id: String(args[0]), ownerId: importedOwner, scopeType: "owner", scopeId: importedOwner, content: String(args[4]), provider: "local" });
        return [saved];
      }
      return [];
    });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await memoryStore.list(importedContext);
    delete process.env.SUPERMEMORY_API_KEY;
    const result = await memoryStore.add("Keep this local decision editable", {
      context: importedContext, scope: { type: "owner", id: importedOwner },
    });

    expect(result).toMatchObject({ syncState: "local_only", degraded: true });
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("provider='supermemory_unknown'"))).toBe(false);
  });

  it("uses recovered semantic results while retaining local-only recall and scope isolation", async () => {
    const remote = memoryRow({ id: "memory_remote", ownerId: context.ownerId, scopeType: "owner", scopeId: context.ownerId, content: "Alpha deployment policy", providerId: "remote_alpha" });
    const local = memoryRow({ id: "memory_local", ownerId: context.ownerId, scopeType: "agent", scopeId: context.agentId, content: "Alpha test checklist", provider: "local" });
    const otherAgent = memoryRow({ id: "memory_other_agent", ownerId: context.ownerId, scopeType: "agent", scopeId: "agent_private", content: "Alpha private notes", providerId: "remote_private" });
    const otherOwner = memoryRow({ id: "memory_other_owner", ownerId: "other-owner", scopeType: "owner", scopeId: "other-owner", content: "Alpha owner notes", providerId: "remote_other" });
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM memory_scope_migrations")) return [{ owner_id: context.ownerId }];
      if (sql.includes("SELECT * FROM memory_records")) return [remote, local, otherAgent, otherOwner];
      return [];
    });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ results: [{ documentId: "remote_alpha", content: remote.content, similarity: 0.9 }] })));

    const found = await memoryStore.search("alpha", context);
    expect(found.map((entry) => entry.id).sort()).toEqual(["memory_local", "memory_remote"]);
    expect(found.find((entry) => entry.id === "memory_remote")).toMatchObject({ retrievalSource: "semantic", syncState: "synced", degraded: false });
    expect(found.find((entry) => entry.id === "memory_local")).toMatchObject({ retrievalSource: "local_fallback", syncState: "local_only", degraded: true });
    expect((await memoryStore.list(context)).map((entry) => entry.id).sort()).toEqual(["memory_local", "memory_remote"]);
  });

  it("keeps an ambiguous remote write readable but blocks deletion and correction until reconciled", async () => {
    let row: ReturnType<typeof memoryRow> | null = null;
    mocks.query.mockImplementation(async (sql: string, args: unknown[]) => {
      if (sql.includes("FROM memory_scope_migrations")) return [{ owner_id: context.ownerId }];
      if (sql.includes("INSERT INTO memory_records")) {
        row = memoryRow({ id: String(args[0]), ownerId: String(args[1]), scopeType: String(args[2]), scopeId: String(args[3]), content: String(args[4]), provider: "local" });
        return [row];
      }
      if (sql.includes("provider='supermemory_unknown'")) { row = { ...row!, provider: "supermemory_unknown" }; return [{id: row.id}]; }
      if (sql.includes("SELECT * FROM memory_records") || sql.includes("SELECT provider,provider_id")) return row ? [row] : [];
      return [];
    });
    const fetch = vi.fn(async () => { throw new Error("connection lost after request"); });
    vi.stubGlobal("fetch", fetch);

    const saved = await memoryStore.add("Remember the release decision", { context, scope: ownerScope });
    expect(saved).toMatchObject({ syncState: "remote_unknown", degraded: true });
    expect((await memoryStore.list(context))[0]).toMatchObject({ id: saved.id, syncState: "remote_unknown" });
    const deletion = await memoryStore.deleteForOwnerDetailed(context.ownerId, saved.id);
    expect(deletion).toEqual({ found: true, deleted: false, remoteDeleted: false, remoteDeletionVerified: false });
    await expect(memoryStore.correctForOwner(context.ownerId, saved.id, "Corrected decision")).rejects.toThrow(/remote state is unknown/);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("status='deleted'"))).toBe(false);
  });

  it("never queries or uploads a different owner's private memory to the deployment container", async () => {
    const otherContext = { ownerId: "other-container-owner", agentId: "agent_private" };
    mocks.query.mockImplementation(async (sql: string, args: unknown[]) => {
      if (sql.includes("INSERT INTO memory_records")) return [memoryRow({ id: String(args[0]), ownerId: otherContext.ownerId, scopeType: "owner", scopeId: otherContext.ownerId, content: String(args[4]), provider: "local" })];
      return [];
    });
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const result = await memoryStore.add("Private to the other owner", { context: otherContext, scope: { type: "owner", id: otherContext.ownerId } });
    await memoryStore.search("Private", otherContext);
    expect(result.syncState).toBe("local_only"); expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects secret-shaped content before persistence or provider calls", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(memoryStore.add("api_key=fixture-secret", { context, scope: ownerScope })).rejects.toThrow(/Secret/);
    expect(mocks.query).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it("corrects local-only memory atomically without contacting the semantic provider", async () => {
    const current = memoryRow({ id: "memory_local_original", ownerId: context.ownerId, scopeType: "owner", scopeId: context.ownerId, content: "Outdated decision", provider: "local" });
    let retired = false;
    mocks.query.mockImplementation(async (sql: string, args: unknown[]) => {
      if (sql.includes("SELECT * FROM memory_records") && !sql.includes("WITH retired")) return retired ? [] : [current];
      if (sql.includes("WITH retired AS")) {
        retired = true;
        return [memoryRow({ id: String(args[2]), ownerId: context.ownerId, scopeType: "owner", scopeId: context.ownerId, content: String(args[3]), provider: "local" })];
      }
      return [];
    });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await memoryStore.correctForOwner(context.ownerId, current.id, "Current decision");
    expect(result).toMatchObject({ status: "completed", replacement: { content: "Current decision", syncState: "local_only" }, remoteDeletionVerified: true });
    expect(retired).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    const mutation = mocks.query.mock.calls.find(([sql]) => String(sql).includes("WITH retired AS"));
    expect(mutation?.[0]).toContain("UPDATE memory_records SET status='archived'");
    expect(mutation?.[0]).toContain("INSERT INTO memory_records");
  });
});
