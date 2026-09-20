import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { Pool } from "pg";
import { SqlComputerTemplateStore } from "../lib/computer-template-store.ts";
import { ComputerTemplateLifecycle } from "../lib/computer-template-lifecycle.ts";
import { ActionGateway, consumeActionAuthority } from "../lib/action-gateway.ts";
import { withPreparedComputer } from "../lib/computer-sandbox-backend.ts";

// No DATABASE_URL or environment-file loading. Only the disposable local fixture.
const pool = new Pool({ host: "127.0.0.1", port: 55442, user: "myeve_test", database: "postgres", max: 12 });
const schema = `template_qualification_${Date.now()}`;
const clients = [];
try {
  const client = await pool.connect(); clients.push(client);
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET search_path TO ${schema}`);
  const directory = new URL("../migrations/", import.meta.url);
  const migrations = (await readdir(directory)).filter(file => file.endsWith(".sql")).sort();
  for (const name of migrations.filter(name => name < "0031")) await client.query(await readFile(new URL(name, directory), "utf8"));
  await client.query("INSERT INTO agents(id,owner_id,slug,name,role,instructions,is_primary,status,max_steps,max_runtime_seconds,max_estimated_cost_usd) VALUES('ava','sarah','primary','Ava','Research','Research',true,'active',30,600,1)");
  await client.query(await readFile(new URL("0031_computer_template_lifecycle.sql", directory), "utf8"));
  assert.equal((await client.query("SELECT name FROM agents WHERE id='ava' AND owner_id='sarah'")).rows[0].name, "Ava");
  const database = { query: async (sql, params) => (await client.query(sql, params)).rows };
  const stores = [new SqlComputerTemplateStore(database)];
  for (let i = 1; i < 10; i++) {
    const connection = await pool.connect(); clients.push(connection); await connection.query(`SET search_path TO ${schema}`);
    stores.push(new SqlComputerTemplateStore({ query: async (sql, params) => (await connection.query(sql, params)).rows }));
  }
  const key = { scope: "preview-sarah", fingerprint: "fixture-v1", provider: "fake" };
  const resources = new Map(); let creates = 0;
  const provider = {
    id: "fake",
    async prepare(row) { creates++; await new Promise(resolve => setTimeout(resolve, 40)); resources.set(row.id, "snapshot"); return { templateId: "snapshot" }; },
    async inspect(row) { return resources.has(row.id) ? { state: "READY", fingerprint: row.fingerprint, templateId: "snapshot" } : { state: "MISSING" }; },
    async cleanup(row) { resources.delete(row.id); return true; },
    classify() { return "bootstrap"; },
  };
  const options = { prepareMs: 1000, waitMs: 2000, cleanupMs: 100, pollMs: 10, retryMs: 10 };
  const rows = await Promise.all(stores.map(store => new ComputerTemplateLifecycle(store, provider, options).ensure(key)));
  assert.equal(creates, 1); assert.equal(new Set(rows.map(row => row.id)).size, 1);
  assert.equal((await client.query("SELECT count(*) FROM computer_template_waiters")).rows[0].count, "0");
  const store = stores[0]; const row = rows[0];
  const token = await store.cleaning(row.id, "invalid_template"); assert.ok(token);
  await client.query("UPDATE computer_template_preparations SET deadline=now()-interval '1 second' WHERE id=$1", [row.id]);
  const newer = await store.cleaning(row.id, "invalid_template"); assert.ok(newer);
  await store.cleaned(row.id, token, true, Date.now());
  assert.equal((await store.current(key)).state, "CLEANING", "stale cleanup token cannot commit");
  await store.cleaned(row.id, newer, true, Date.now());
  const replacement = await store.claim(key, Date.now() + 1000); assert.ok(replacement);
  // Tombstone recovery does not conflict with a newer live preparation's unique key.
  await client.query("UPDATE computer_template_preparations SET deadline=now()-interval '1 second' WHERE id=$1", [row.id]);
  assert.ok(await store.cleaning(row.id, "timeout"));
  assert.equal((await store.current(key)).id, replacement.id);
  assert.equal(await store.ready(replacement.id, "cannot-publish-without-waiters"), false);
  assert.equal(await store.current({ ...key, scope: "production-sarah" }), null);
  await client.query(`INSERT INTO task_runs(id,owner_id,kind,title,agent_id,status,max_duration_seconds,max_specialists,
    max_model_steps,max_retries_per_specialist,max_estimated_cost_usd)
    VALUES('computer-run','sarah','delegated_work','Computer fixture','ava','running',600,0,30,0,1)`);
  const action = { ownerId: "sarah", runId: "computer-run", actionKey: "cold-computer", capabilityId: "computer.session.create", actionClass: "create",
    executor: { kind: "primary-agent", agentId: "ava" }, trigger: { kind: "owner_chat", id: "fixture" }, parameters: {} };
  const allow = { evaluate: async () => ({ decision: "ALLOW", source: "fixture", reason: "fixture" }) };
  const gateway = new ActionGateway(database, allow);
  let sessions = 0, preparations = 0, revoke = false;
  const qualifiedProvider = { ...provider, async prepare(row) {
    preparations++;
    const result = await provider.prepare(row);
    if (revoke) await client.query("UPDATE agents SET status='paused',updated_at=now() WHERE id='ava'");
    return result;
  } };
  const lifecycle = new ComputerTemplateLifecycle(store, qualifiedProvider, options);
  const adapter = {
    resolveTarget: async () => ({ provider: "sandbox", account: "sarah", resource: "fixture", environment: "isolated" }),
    async execute(parameters, authority) {
      await consumeActionAuthority(authority, parameters, "computer.session.create");
      const prepared = await lifecycle.ensure({ ...key, fingerprint: revoke ? "revoked" : "gateway" });
      const now = Date.now;
      try {
        Date.now = () => now() + 31_000; // Beyond normal action TTL; within the bounded Computer cold-start TTL.
        await withPreparedComputer(prepared, authority, parameters, async () => { sessions++; });
      } finally { Date.now = now; }
      await assert.rejects(withPreparedComputer(prepared, authority, parameters, async () => { sessions++; }), "one-use provider handle");
      return { id: "fixture-session" };
    },
    verify: async () => ({ verified: true, receipt: { fixture: true } }),
  };
  const denied = new ActionGateway(database, { evaluate: async () => ({ decision: "DENY", source: "fixture", reason: "unauthorized" }) });
  await assert.rejects(denied.execute({ ...action, actionKey: "denied" }, adapter)); assert.equal(preparations, 0);
  await client.query("UPDATE task_runs SET estimated_cost_usd=max_estimated_cost_usd WHERE id='computer-run'");
  await assert.rejects(gateway.execute({ ...action, actionKey: "budget-denied" }, adapter)); assert.equal(preparations, 0);
  await client.query("UPDATE task_runs SET estimated_cost_usd=0 WHERE id='computer-run'");
  await gateway.execute(action, adapter); assert.equal(preparations, 1); assert.equal(sessions, 1);
  await gateway.execute({ ...action, actionKey: "warm" }, adapter); assert.equal(preparations, 1); assert.equal(sessions, 2);
  revoke = true;
  await assert.rejects(gateway.execute({ ...action, actionKey: "revoked" }, adapter)); assert.equal(sessions, 2);
  console.log("PASS: actual Gateway + durable lifecycle: deny/budget before preparation; cold and warm; 31-second preparation authority window; provider handle replay denied; mid-preparation Agent revocation prevents session creation.");
  console.log("PASS: populated 0030→0031; ten database connections converge; waiter cleanup; stale cleanup fencing; tombstone coexistence; cancelled publish denied; environment isolation.");
} finally {
  if (clients[0]) await clients[0].query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  for (const client of clients) client.release();
  await pool.end();
}
