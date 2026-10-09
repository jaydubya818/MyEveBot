import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { Pool, Client } from "pg";
import { loadMigrations, runMigrations } from "../scripts/migration-runner.ts";
import { WorkStore } from "../lib/engineering/store.ts";

const url = new URL(
  process.env.ENGINEERING_TEST_ADMIN_URL ??
    "postgresql://postgres@127.0.0.1:55468/postgres",
);
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "55468");
assert.equal(url.pathname, "/postgres");
const admin = new Client({ connectionString: url.href });
await admin.connect();
const name = `engineering_test_${randomBytes(8).toString("hex")}`;
let pool, migrationClient;
try {
  await admin.query(`CREATE DATABASE ${name}`);
  url.pathname = `/${name}`;
  pool = new Pool({ connectionString: url.href, max: 5 });
  const client = await pool.connect();
  migrationClient = client;
  const migrations = await loadMigrations();
  const database = {
    query: async (sql, params) => (await client.query(sql, params)).rows,
    transaction: async (statements) => {
      await client.query("BEGIN");
      try {
        for (const s of statements) await client.query(s.sql, s.params);
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    },
  };
  const prefix = migrations.filter((m) => m.name < "0039");
  await runMigrations(database, prefix);
  const workMigration = migrations.find(
    (m) => m.name === "0039_engineering_work.sql",
  );
  assert.ok(workMigration);
  const failing = {
    ...workMigration,
    statements: [
      ...workMigration.statements,
      "SELECT intentionally_missing_engineering_function()",
    ],
  };
  await assert.rejects(runMigrations(database, [...prefix, failing]));
  assert.equal(
    (await client.query("SELECT to_regclass('engineering_work') AS name"))
      .rows[0].name,
    null,
  );
  await runMigrations(database, migrations);
  await runMigrations(database, migrations);
  assert.equal(
    (await client.query("SELECT count(*) AS count FROM app_settings")).rows[0]
      .count,
    "0",
  );
  client.release();
  migrationClient = null;
  const adapter = {
    query: async (sql, params) => (await pool.query(sql, params)).rows,
  };
  const principal = {
    scopeId: "owner-a",
    actorId: "actor-a",
    scopeKind: "personal",
  };
  const store = new WorkStore(principal, adapter);
  const input = {
    title: "Bounded parser fix",
    objective: "Reject negative quantities",
    repository: "fixture/parser",
    criteria: [
      {
        id: randomUUID(),
        statement: "Negative quantities are rejected",
        method: "test",
      },
    ],
    maxCostUsd: 1,
    maxDurationSeconds: 120,
    idempotencyKey: randomUUID(),
  };
  const created = await Promise.all([store.create(input), store.create(input)]);
  assert.equal(created.filter((x) => x.created).length, 1);
  assert.equal(created[0].work.id, created[1].work.id);
  const id = created[0].work.id;
  assert.equal((await store.events(id)).length, 1);
  await assert.rejects(
    store.create({ ...input, objective: "Different intent" }),
    /already belongs/,
  );
  for (const scope of [
    { ...principal, scopeId: "owner-b" },
    { ...principal, scopeKind: "organization" },
  ]) {
    const foreign = new WorkStore(scope, adapter);
    assert.equal((await foreign.list()).length, 0);
    await assert.rejects(foreign.get(id), /not found/);
    await assert.rejects(foreign.criteriaHistory(id), /not found/);
    await assert.rejects(
      foreign.change(id, { operation: "cancel", expectedVersion: 1 }),
      /not found/,
    );
  }
  const changes = await Promise.allSettled([
    store.change(id, { operation: "takeover", expectedVersion: 1 }),
    store.change(id, { operation: "resume", expectedVersion: 1 }),
  ]);
  assert.equal(changes.filter((x) => x.status === "fulfilled").length, 1);
  let current = await store.get(id);
  assert.equal(current.version, 2);
  current = await store.change(id, {
    operation: "revise",
    expectedVersion: 2,
    criteria: [
      {
        ...input.criteria[0],
        statement: "Reject zero and negative quantities",
      },
    ],
  });
  assert.equal(current.criteriaVersion, 2);
  const history = await store.criteriaHistory(id);
  assert.deepEqual(
    history.map((revision) => revision.version),
    [2, 1],
  );
  assert.equal(history[1].criteria[0].statement, input.criteria[0].statement);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int n FROM engineering_work_criteria WHERE work_id=$1",
        [id],
      )
    ).rows[0].n,
    2,
  );
  current = await store.change(id, {
    operation: "cancel",
    expectedVersion: current.version,
  });
  await assert.rejects(
    store.change(id, { operation: "resume", expectedVersion: current.version }),
    /Reopen/,
  );
  current = await store.change(id, {
    operation: "reopen",
    expectedVersion: current.version,
  });
  assert.equal(current.control, "paused");
  assert.equal(current.lifecycle, "active");
  assert.equal((await store.events(id)).length, current.version);
  console.log(
    "PASS: migration rollback/upgrade/rerun; concurrent idempotency; scope isolation; concurrent writer conflict; immutable criteria; cancel/reopen fencing; durable history.",
  );
} finally {
  migrationClient?.release();
  await pool?.end();
  await admin.query(`DROP DATABASE IF EXISTS ${name}`);
  await admin.end();
}
