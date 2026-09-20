import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Client } from "pg";

test("owner action setup binds an integer runtime and creates one session", {
  skip: !process.env.ACTION_CONTEXT_TEST_DATABASE_URL,
}, async () => {
  const client = new Client({ connectionString: process.env.ACTION_CONTEXT_TEST_DATABASE_URL });
  await client.connect();
  try {
    // Temporary tables shadow real tables and disappear on disconnect.
    await client.query(`CREATE TEMP TABLE task_runs (
      id text PRIMARY KEY, owner_id text, kind text, title text, agent_id text,
      status text, max_duration_seconds integer, max_specialists integer,
      max_model_steps integer, max_retries_per_specialist integer,
      max_estimated_cost_usd numeric(10,4), started_at timestamptz, deadline_at timestamptz
    )`);
    await client.query(`CREATE TEMP TABLE task_run_sessions (
      task_id text, session_id text UNIQUE, role text
    )`);
    const source = await readFile(new URL("../agent/lib/action-context.ts", import.meta.url), "utf8");
    const query = source.match(/db\(\)\.query\(`(WITH run AS \([\s\S]*?)`,\[runId/)[1];
    const parameters = ["run", "owner", "agent", 600, 30, 1.25, "session"];
    await client.query(query, parameters);
    await client.query(query, parameters);
    const { rows } = await client.query(`SELECT max_duration_seconds,
      extract(epoch FROM deadline_at-started_at)::integer AS elapsed,
      max_model_steps, max_estimated_cost_usd::float8 AS budget,
      s.session_id, s.role FROM task_runs r JOIN task_run_sessions s ON s.task_id=r.id`);
    assert.deepEqual(rows, [{ max_duration_seconds: 600, elapsed: 600,
      max_model_steps: 30, budget: 1.25, session_id: "session", role: "orchestrator" }]);
  } finally {
    await client.end();
  }
});
