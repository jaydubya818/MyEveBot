import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { Client } from "pg";
const state = vi.hoisted(() => ({ client: null }));
vi.mock("./receipts-db.ts", () => ({ db: () => ({ query: async (sql, args) => (await state.client.query(sql, args)).rows }) }));
import remember from "../tools/remember.ts";
import { memoryStore } from "./memory-store.ts";
const database = process.env.ACTION_CONTEXT_TEST_DATABASE_URL;
const schema = `memory_gateway_${Date.now()}`;
let client;
beforeAll(async () => {
    if (!database)
        return;
    client = new Client({ connectionString: database });
    await client.connect();
    state.client = client;
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    const directory = new URL("../../migrations/", import.meta.url);
    for (const file of (await readdir(directory)).filter(file => file.endsWith(".sql")).sort()) {
        await client.query(await readFile(new URL(file, directory), "utf8"));
    }
    vi.stubEnv("SUPERMEMORY_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
        if (init?.method === "POST" && String(_url).endsWith("/v4/memories")) {
            return new Response(JSON.stringify({ documentId: "provider-memory" }), { status: 200 });
        }
        return new Response(JSON.stringify({ memoryEntries: [] }), { status: 200 });
    }));
}, 30000);
afterAll(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    if (client) {
        await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await client.end();
    }
});
it.skipIf(!database)("saves through the real gateway and PostgreSQL, verifies and deduplicates the call", async () => {
    const ownerId = "memory-test-owner";
    const ctx = { session: { id: "memory-test-session", auth: { current: {
                    principalId: ownerId, principalType: "user", attributes: { owner: "true" },
                } } }, callId: "memory-test-call", abortSignal: new AbortController().signal };
    const input = { memory: "A test memory", permanent: false, scope: "owner" };
    const result = await remember.execute(input, ctx);
    expect(result).toMatchObject({ status: "saved" });
    const replay = await remember.execute(input, ctx);
    expect(replay).toEqual(result);
    expect(await memoryStore.listForOwner(ownerId)).toHaveLength(1);
    expect((await client.query("SELECT status,attempt_count FROM action_requests")).rows).toEqual([{ status: "completed", attempt_count: 1 }]);
    const writes = vi.mocked(fetch).mock.calls.filter(([url, init]) => String(url).endsWith("/v4/memories") && init?.method === "POST");
    expect(writes).toHaveLength(1);
}, 30000);
