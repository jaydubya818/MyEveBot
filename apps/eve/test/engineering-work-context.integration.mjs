import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { Client, Pool } from "pg";

import { requireSelectedWorkContext } from "../agent/hooks/engineering-work-context.ts";
import { loadMigrations, runMigrations } from "../scripts/migration-runner.ts";

const adminUrl = new URL(process.env.ENGINEERING_TEST_ADMIN_URL ?? "postgresql://postgres@127.0.0.1:55468/postgres");
assert.equal(adminUrl.hostname, "127.0.0.1");
assert.equal(adminUrl.port, "55468");
assert.equal(adminUrl.pathname, "/postgres");

const admin = new Client({ connectionString: adminUrl.href });
await admin.connect();
const databaseName = `work_context_test_${randomBytes(8).toString("hex")}`;
let pool;
try {
  await admin.query(`CREATE DATABASE ${databaseName}`);
  adminUrl.pathname = `/${databaseName}`;
  pool = new Pool({ connectionString: adminUrl.href });
  const migrationClient = await pool.connect();
  const migrationDatabase = {
    query: async (sql, params) => (await migrationClient.query(sql, params)).rows,
    transaction: async (statements) => {
      await migrationClient.query("BEGIN");
      try {
        for (const statement of statements) await migrationClient.query(statement.sql, statement.params);
        await migrationClient.query("COMMIT");
      } catch (error) {
        await migrationClient.query("ROLLBACK");
        throw error;
      }
    },
  };
  try {
    await runMigrations(migrationDatabase, (await loadMigrations()).filter((migration) => migration.name < "0043"), () => {});
  } finally {
    migrationClient.release();
  }
  const database = { query: async (sql, params) => (await pool.query(sql, params)).rows };

  const ownerId = "context-owner";
  const agentId = "context-sofie";
  const threadId = "context-thread";
  const sessionId = "context-session";
  const turnId = "context-turn";
  const runId = `agent_run_${sessionId}_${turnId}`;
  const workId = randomUUID();
  const auth = (selected = false) => ({
    authenticator: "myeve-web-session", principalId: ownerId, principalType: "user",
    attributes: { owner: "true", webThreadId: threadId, ...(selected ? { myeveEngineeringWorkId: workId } : {}) },
  });
  const ctx = {
    channel: { kind: "http" },
    session: { id: sessionId, turn: { id: turnId }, auth: { current: auth(true), initiator: auth() } },
  };

  await database.query(`INSERT INTO agents(id,owner_id,name,slug,role,instructions,is_primary)
    VALUES($1,$2,'Sofie','sofie','Engineer','Handle current Work.',true)`, [agentId, ownerId]);
  await database.query(`INSERT INTO web_chat_threads(id,owner_id,title,updated_at,chat,agent_id)
    VALUES($1,$2,'Work',1,'{}'::jsonb,$3)`, [threadId, ownerId, agentId]);
  await database.query(`INSERT INTO engineering_work(id,scope_id,scope_kind,created_by,title,objective,repository,
    max_cost_usd,max_duration_seconds,idempotency_key,request_hash)
    VALUES($1,$2,'personal',$2,'Parser','Reject invalid quantities','fixture/parser',1,120,$3,'fixture')`,
  [workId, ownerId, randomUUID()]);
  await database.query(`INSERT INTO agent_runs(id,session_id,owner_id,agent_id,thread_id,executor_kind)
    VALUES($1,$2,$3,$4,$5,'primary-agent')`, [runId, sessionId, ownerId, agentId, threadId]);

  await assert.rejects(requireSelectedWorkContext(ctx, database), /could not be verified/);
  await database.query(`INSERT INTO context_assemblies(id,owner_id,agent_id,session_id,agent_run_id,thread_id,
    source_refs,estimated_tokens) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,100)`,
  ["context-1", ownerId, agentId, sessionId, runId, threadId,
    JSON.stringify([`engineering-work:${workId}`, `engineering-work:${workId}:v1`])]);
  await requireSelectedWorkContext(ctx, database);

  await database.query(`UPDATE engineering_work SET version=2 WHERE id=$1`, [workId]);
  await assert.rejects(requireSelectedWorkContext(ctx, database), /could not be verified/);

  await database.query(`UPDATE engineering_work SET version=1 WHERE id=$1`, [workId]);
  await database.query(`UPDATE agent_runs SET executor_kind='persistent-agent' WHERE id=$1`, [runId]);
  await assert.rejects(requireSelectedWorkContext(ctx, database), /could not be verified/);
} finally {
  await pool?.end();
  adminUrl.pathname = "/postgres";
  await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  await admin.end();
}
