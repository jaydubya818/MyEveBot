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
    // Only the authority schema is needed here. Later engineering migrations
    // qualify separately and include public-schema-specific dependencies.
    await runMigrations({
      query: async (sql, params) => (await client.query(sql, params)).rows,
      transaction: async statements => {
        await client.query("BEGIN");
        try { for (const s of statements) await client.query(s.sql, s.params); await client.query("COMMIT"); }
        catch (error) { await client.query("ROLLBACK"); throw error; }
      },
    }, (await loadMigrations()).filter(m => m.name < "0036" || m.name === "0076_completed_chat_tasks.sql"), () => {});
    await client.query(`INSERT INTO agents(id,owner_id,slug,name,role,instructions,max_runtime_seconds,max_steps,max_estimated_cost_usd)
      VALUES('agent','owner','agent','Agent','Test','Test',600,30,1.25)`);
    // Exercise the canonical initializer used by ownerChatRun, rather than
    // extracting a retired inline query from the source with a regular expression.
    for (const candidate of ["task_readme", "unused-run"]) {
      const initialized = await client.query("SELECT owner_chat_run('owner','session','agent',$1,true,true) AS id", [candidate]);
      assert.equal(initialized.rows[0].id, "task_readme");
    }
    const { rows } = await client.query(`SELECT max_duration_seconds,
      extract(epoch FROM deadline_at-started_at)::integer AS elapsed,
      max_model_steps, max_estimated_cost_usd::float8 AS budget,
      s.session_id, s.role FROM task_runs r JOIN task_run_sessions s ON s.task_id=r.id`);
    assert.deepEqual(rows, [{ max_duration_seconds: 600, elapsed: 600,
      max_model_steps: 30, budget: 1.25, session_id: "session", role: "orchestrator" }]);
    // A completed standalone owner task must not poison its conversation.
    await client.query(`UPDATE task_runs SET status='completed',
      completed_at=now(),result_summary='Read the README' WHERE id='task_readme'`);
    const recover = (id, fresh = true) => client.query(
      "SELECT owner_chat_run('owner','session','agent',$1,$2,false) AS id", [id, fresh]);
    await assert.rejects(() => recover('action_run_retry', false), /RUN_NOT_EXECUTABLE/);
    assert.equal((await recover('action_run_followup')).rows[0].id, 'action_run_followup');
    assert.equal((await recover('action_run_duplicate')).rows[0].id, 'action_run_followup');
    assert.deepEqual((await client.query(`SELECT task_id,is_current FROM task_run_sessions
      WHERE session_id='session' ORDER BY is_current`)).rows,
      [{task_id:'task_readme',is_current:false},{task_id:'action_run_followup',is_current:true}]);
    // Replay still resolves the old task, and none of its state is revived.
    assert.equal((await client.query("SELECT status FROM task_runs WHERE id='task_readme'")).rows[0].status, 'completed');
    await client.query("DELETE FROM task_run_sessions WHERE task_id='action_run_followup'");
    await client.query("UPDATE task_run_sessions SET is_current=true WHERE task_id='task_readme'");
    for (const mutation of [
      "status='failed'", "completed_at=NULL", "result_summary=NULL",
      "model_steps=max_model_steps", "estimated_cost_usd=max_estimated_cost_usd",
      "role_id='external-role'", "parent_task_id='task_readme'", "source_task_id='task_readme'",
    ]) {
      await client.query('BEGIN');
      try {
        await client.query(`UPDATE task_runs SET ${mutation} WHERE id='task_readme'`);
        await assert.rejects(() => recover('action_run_denied'), /RUN_RECOVERY_REQUIRES_OWNER_REVIEW/);
      } finally { await client.query('ROLLBACK'); }
    }

  } finally {
    await client.query("SET search_path TO public");
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});
