import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { Pool } from "pg";
import { routineConfigurationSchema } from "../lib/execution-types.ts";
import { admissionFixture } from "./admission-fixtures.mjs";
import { splitSqlStatements } from "../scripts/migration-sql.ts";

// Fixed loopback only. Never reads deployment environment or provider secrets.
const pool = new Pool({
  host: "127.0.0.1",
  port: 55441,
  database: "postgres",
  user: process.env.USER,
});
const client = await pool.connect(),
  schema = `routine_integration_upgrade_${Date.now()}`;
const directory = new URL("../migrations/", import.meta.url);
const apply = async (name) => {
  for (const statement of splitSqlStatements(
    await readFile(new URL(name, directory), "utf8"),
  ))
    await client.query(statement);
};
const database = {
  query: async (sql, params) => (await client.query(sql, params)).rows,
};
try {
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET search_path TO ${schema}`);
  const migrations = (await readdir(directory))
    .filter((n) => n.endsWith(".sql"))
    .sort();
  for (const name of migrations.filter((n) => n < "0027")) await apply(name);
  const config = routineConfigurationSchema.parse({
    instructions: "Review local goals",
    authority: { allowedCapabilities: ["tool.list_goals"] },
  });
  await client.query(
    `INSERT INTO agents(id,owner_id,slug,name,role,instructions,is_primary,status,max_steps,max_runtime_seconds,max_estimated_cost_usd) VALUES('ava','sarah','ava','Ava','Review','Review',true,'active',30,600,1)`,
  );
  await client.query(
    `INSERT INTO task_runs(id,owner_id,kind,title,agent_id,status,max_duration_seconds,max_specialists,max_model_steps,max_retries_per_specialist,max_estimated_cost_usd) VALUES('run','sarah','delegated_work','Preserve me','ava','running',600,0,30,0,1)`,
  );
  await client.query(
    `INSERT INTO execution_routines(id,owner_id,source_kind,source_id,name,agent_id,configuration) VALUES('routine','sarah','manual','legacy','Legacy goal review','ava',$1::jsonb)`,
    [JSON.stringify(config)],
  );
  await client.query(
    `INSERT INTO execution_routine_versions(owner_id,routine_id,version,configuration,changed_by) VALUES('sarah','routine',1,$1::jsonb,'sarah')`,
    [JSON.stringify(config)],
  );
  await client.query(
    `INSERT INTO execution_occurrences(id,owner_id,routine_id,routine_version,occurrence_key,scheduled_for,run_id) VALUES('occurrence','sarah','routine',1,'original-period',now(),'run')`,
  );
  await client.query(
    `INSERT INTO task_approval_decisions(id,task_id,owner_id,requested_by,prompt,action,action_class,binding_hash,risk,expires_at,status) VALUES('approval','run','sarah','ava','Review exact fixture','tool.send_email','send','exact-binding','high',now()+interval '1 hour','approved')`,
  );
  await client.query(
    `INSERT INTO action_requests(id,owner_id,run_id,action_key,executor,trigger,capability_id,action_class,target,parameter_hash,decision,authority_source,approval_id,status,provider_receipt,attempt_count) VALUES('action','sarah','run','send','{}','{}','tool.send_email','send','{}','exact-binding','REQUIRE_APPROVAL','local','approval','result_unknown','{"messageId":"safe-fixture-receipt"}',1)`,
  );
  await client.query(
    `INSERT INTO action_receipts(owner_id,action_id,attempt_number,event,details) VALUES('sarah','action',1,'result_unknown','{"messageId":"safe-fixture-receipt"}')`,
  );
  await client.query(
    `INSERT INTO persistent_browser_profiles(id,owner_id,agent_id) VALUES('profile','sarah','ava')`,
  );
  await client.query(
    `INSERT INTO persistent_browser_profile_grants(id,owner_id,profile_id,agent_id) VALUES('profile-grant','sarah','profile','ava')`,
  );
  await client.query(
    `INSERT INTO computer_sessions(id,owner_id,agent_id,runtime_session_id,status,expires_at) VALUES('computer','sarah','ava','fixture-runtime','ready',now()+interval '1 hour')`,
  );
  await client.query(
    `INSERT INTO computer_control_leases(computer_session_id,owner_id,agent_id,controller,claimed_by,expires_at) VALUES('computer','sarah','ava','OWNER','sarah',now()+interval '1 hour')`,
  );
  const selections = {
    agents: "SELECT * FROM agents",
    runs: "SELECT * FROM task_runs",
    approvals: "SELECT * FROM task_approval_decisions",
    actions:
      "SELECT id,owner_id,run_id,parameter_hash,approval_id,status,provider_receipt,attempt_count,recovery_token,recovery_result FROM action_requests",
    receipts: "SELECT * FROM action_receipts",
    routines: "SELECT * FROM execution_routines",
    versions: "SELECT * FROM execution_routine_versions",
    occurrences:
      "SELECT id,routine_id,routine_version,occurrence_key,run_id,status,attempt_count FROM execution_occurrences",
    profiles: "SELECT * FROM persistent_browser_profiles",
    grants: "SELECT * FROM persistent_browser_profile_grants",
    computers: "SELECT * FROM computer_sessions",
    control: "SELECT * FROM computer_control_leases",
  };
  const before = {};
  for (const [name, sql] of Object.entries(selections))
    before[name] = (await client.query(sql)).rows;
  await apply("0027_relay_federation.sql");
  await client.query(
    `INSERT INTO myeve_relay_grants(id,owner_id,document) VALUES('relay-grant','sarah','{"capability":"knowledge.query","agent":"external-fixture"}')`,
  );
  const relayBefore = (await client.query("SELECT * FROM myeve_relay_grants"))
    .rows;
  await apply("0028_routine_pending_send.sql");
  await client.query(
    `INSERT INTO routine_pending_sends(owner_id,run_id,action_id,request) VALUES('sarah','run','action','{"fixture":"saved-draft"}')`,
  );
  const pendingBefore = (
    await client.query("SELECT * FROM routine_pending_sends")
  ).rows;
  for (const name of migrations.filter((n) => n >= "0029")) await apply(name);
  for (const [name, sql] of Object.entries(selections))
    assert.deepEqual((await client.query(sql)).rows, before[name], name);
  assert.deepEqual(
    (await client.query("SELECT * FROM myeve_relay_grants")).rows,
    relayBefore,
  );
  assert.deepEqual(
    (await client.query("SELECT * FROM routine_pending_sends")).rows,
    pendingBefore,
  );
  assert.deepEqual(
    (
      await client.query(
        "SELECT admission,preflight FROM execution_occurrences",
      )
    ).rows,
    [{ admission: null, preflight: null }],
  );
  assert.equal(
    (await client.query("SELECT approval_generation FROM action_requests"))
      .rows[0].approval_generation,
    0,
  );
  const legacy = await admissionFixture(database, {
    executionEnabled: () => false,
  }).inspect("sarah", "routine");
  assert.equal(legacy.state, "NEEDS_APPROVAL");
  assert.equal(legacy.canRun, false);
  await client.query(
    `INSERT INTO execution_occurrences(id,owner_id,routine_id,routine_version,occurrence_key,scheduled_for,status) VALUES('blocked','sarah','routine',1,'blocked-period',now(),'blocked_precheck')`,
  );
  await assert.rejects(
    client.query(
      `UPDATE execution_occurrences SET status='pending' WHERE id='blocked'`,
    ),
    /execution_occurrences_run_required/,
  );
  const fk = (
    await client.query(
      `SELECT condeferrable,condeferred FROM pg_constraint WHERE conrelid='execution_occurrences'::regclass AND conname='execution_occurrences_owner_id_run_id_fkey'`,
    )
  ).rows[0];
  assert.deepEqual(fk, { condeferrable: true, condeferred: true });
  await assert.rejects(
    client.query(
      `INSERT INTO action_requests(id,owner_id,run_id,action_key,executor,trigger,capability_id,action_class,target,parameter_hash,decision,authority_source,status) VALUES('collision','sarah','run','different-key','{}','{}','tool.send_email','send','{}','exact-binding','ALLOW','local','planned')`,
    ),
    /action_requests_live_binding/,
  );
  console.log(
    "PASS: populated current-main 0026 -> 0030; 12 canonical state groups preserved; Federation grant and pending draft preserved; no authority backfill; nullable receipts, blocked-only null Run, deferred FK and unique live binding enforced",
  );
} finally {
  await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  client.release();
  await pool.end();
}
