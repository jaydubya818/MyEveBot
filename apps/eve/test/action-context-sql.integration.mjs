import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "pg";
import { loadMigrations, runMigrations } from "../scripts/migration-runner.ts";

test("owner action setup binds an integer runtime and creates one session", {
  skip: !process.env.ACTION_CONTEXT_TEST_DATABASE_URL,
}, async () => {
  const url = new URL(process.env.ACTION_CONTEXT_TEST_DATABASE_URL);
  assert(["localhost", "127.0.0.1"].includes(url.hostname), "Disposable local database required");
  const client = new Client({ connectionString: url.href });
  const schema = `action_context_${crypto.randomUUID().replaceAll("-", "")}`;
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await runMigrations({
      query: async (sql, params) => (await client.query(sql, params)).rows,
      transaction: async statements => {
        await client.query("BEGIN");
        try { for (const s of statements) await client.query(s.sql, s.params); await client.query("COMMIT"); }
        catch (error) { await client.query("ROLLBACK"); throw error; }
      },
    }, await loadMigrations(), () => {});
    await client.query(`INSERT INTO agents(id,owner_id,slug,name,role,instructions,max_runtime_seconds,max_steps,max_estimated_cost_usd)
      VALUES('agent','owner','agent','Agent','Test','Test',600,30,1.25)`);
    // Exercise the canonical initializer used by ownerChatRun, rather than
    // extracting a retired inline query from the source with a regular expression.
    for (const candidate of ["run", "unused-run"]) {
      const initialized = await client.query("SELECT owner_chat_run('owner','session','agent',$1,true,true) AS id", [candidate]);
      assert.equal(initialized.rows[0].id, "run");
    }
    const { rows } = await client.query(`SELECT max_duration_seconds,
      extract(epoch FROM deadline_at-started_at)::integer AS elapsed,
      max_model_steps, max_estimated_cost_usd::float8 AS budget,
      s.session_id, s.role FROM task_runs r JOIN task_run_sessions s ON s.task_id=r.id`);
    assert.deepEqual(rows, [{ max_duration_seconds: 600, elapsed: 600,
      max_model_steps: 30, budget: 1.25, session_id: "session", role: "orchestrator" }]);
  } finally {
    await client.query("SET search_path TO public");
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});
