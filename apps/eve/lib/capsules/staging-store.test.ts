import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { CapsuleStagingStore } from "./staging-store";
import { fixtureCandidates, freshDestination } from "./fixtures";
import { canonicalJson, exportCapsule, exportPreview } from "./format";
import { prepareImport, previewImport } from "./import";

const { Pool } = createRequire(import.meta.url)("pg");
// Opt in only to the disposable local cluster. Never read DATABASE_URL.
const enabled = Boolean(process.env.CAPSULE_TEST_PG_SOCKET);
const pool = enabled ? new Pool({ host: process.env.CAPSULE_TEST_PG_SOCKET, port: 55439, database: "postgres", max: 5 }) : null;
function store(owner = "capsule-design-partner") {
  return new CapsuleStagingStore(owner, async (sql, params) => (await pool.query(sql, params)).rows, async statements => {
    const client = await pool.connect();
    try { await client.query("BEGIN ISOLATION LEVEL READ COMMITTED"); const results = []; for (const s of statements) results.push((await client.query(s.sql, s.params)).rows); await client.query("COMMIT"); return results; }
    catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  });
}
function batch() {
  const candidates = fixtureCandidates(); const selectedIds = candidates.map(c => c.item.id); const ownerRef = candidates[0].policy.ownerRef;
  const raw = canonicalJson(exportCapsule({ candidates, selectedIds, ownerRef, eveRef: "sofie-a", reviewedDigest: exportPreview(candidates, selectedIds, ownerRef).reviewDigest }));
  const dest = freshDestination(); const preview = previewImport(raw, dest);
  return prepareImport(raw, dest, preview.reviewDigest, preview.items.map(row => ({ id: row.item.id, choice: "include" })));
}
describe.skipIf(!enabled)("Existing PostgreSQL staging integration (isolated cluster)", () => {
  beforeAll(async () => {
    for (const file of ["0016_owner_data_operations.sql", "0018_owner_knowledge_control.sql"]) await pool.query(readFileSync(new URL(`../../migrations/${file}`, import.meta.url), "utf8"));
    await pool.query("TRUNCATE owner_data_operations");
  });
  afterAll(async () => { await pool.end(); });
  it("atomically saves a review, survives a reconnect and rejects cross-owner reads/deletes", async () => {
    const s = store(); const input = batch(); const saved = await s.commit(input);
    expect(saved.count).toBe(9); expect(saved.duplicate).toBe(false);
    const again = await store().commit(input); expect(again.duplicate).toBe(true);
    expect((await store().list())[0].records).toEqual(input.records);
    expect(await store("other-owner").list()).toEqual([]);
    expect(await store("other-owner").remove(saved.id)).toBe(false);
    expect(await s.remove(saved.id)).toBe(true);
  });
  it("serializes simultaneous duplicate submissions into one complete review", async () => {
    const input = batch(); const result = await Promise.all([store().commit(input), store().commit(input), store().commit(input)]);
    expect(result.filter(r => !r.duplicate)).toHaveLength(1);
    expect((await store().list()).filter(r => r.id === input.id)).toHaveLength(1);
  });
  it("expires private staging and prunes it on the next save", async () => {
    const input = batch(); await store().commit(input);
    await pool.query("UPDATE owner_data_operations SET created_at=now()-interval '31 days' WHERE id=$1", [input.id]);
    expect((await store().list()).some(r => r.id === input.id)).toBe(false);
    await store().commit(batch());
    expect((await pool.query("SELECT id FROM owner_data_operations WHERE id=$1", [input.id])).rows).toHaveLength(0);
  });
  it("caps concurrent staging at 100 reviews", async () => {
    await pool.query("TRUNCATE owner_data_operations");
    await pool.query(`INSERT INTO owner_data_operations (id,owner_id,operation_type,status,record_count,metadata) SELECT 'seed-'||n,'capsule-design-partner','restore_planned','completed',0,'{"namespace":"memory-capsule-staging-v1","records":[]}'::jsonb FROM generate_series(1,99) n`);
    const result = await Promise.allSettled([store().commit(batch()), store().commit(batch()), store().commit(batch())]);
    expect(result.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await store().list()).toHaveLength(100);
  });
});
