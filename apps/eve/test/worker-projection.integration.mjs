import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { Client, Pool } from "pg";

import { loadMigrations, runMigrations } from "../scripts/migration-runner.ts";
import { makeContract } from "../lib/engineering/contract.ts";
import { ExecutionStore } from "../lib/engineering/execution-store.ts";
import { queueRun } from "../lib/engineering/execution.ts";
import { createCandidate } from "../lib/engineering/github.ts";
import { WorkStore } from "../lib/engineering/store.ts";
import { EngineeringWorkerProjectionStore } from "../lib/engineering/worker-projection.ts";
import { fixture } from "./engineering-fixtures.ts";

const url = new URL(process.env.ENGINEERING_TEST_ADMIN_URL ?? "postgresql://postgres@127.0.0.1:55479/postgres");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "55479");
assert.equal(url.pathname, "/postgres");
const admin = new Client({ connectionString: url.href });
await admin.connect();
const databaseName = `projection_test_${randomBytes(8).toString("hex")}`;
let pool;
try {
  await admin.query(`CREATE DATABASE ${databaseName}`);
  url.pathname = `/${databaseName}`;
  pool = new Pool({ connectionString: url.href });
  const migrationClient = await pool.connect();
  try {
    await runMigrations({
      query: async (sql, params) => (await migrationClient.query(sql, params)).rows,
      transaction: async statements => {
        await migrationClient.query("BEGIN");
        try {
          for (const statement of statements) await migrationClient.query(statement.sql, statement.params);
          await migrationClient.query("COMMIT");
        } catch (error) {
          await migrationClient.query("ROLLBACK");
          throw error;
        }
      },
    }, await loadMigrations());
  } finally {
    migrationClient.release();
  }

  const database = { query: async (sql, params) => (await pool.query(sql, params)).rows };
  const template = fixture();
  const principal = { scopeId: template.work.scopeId, scopeKind: "personal", actorId: template.work.scopeId };
  const store = new WorkStore(principal, database);
  const { work: prepared } = await store.create({
    title: template.work.title,
    objective: template.work.objective,
    repository: template.work.repository,
    criteria: template.work.criteria,
    maxCostUsd: 5,
    maxDurationSeconds: 1800,
    idempotencyKey: randomUUID(),
  });
  let projection = await new EngineeringWorkerProjectionStore(store, "sofie").get(prepared.id);
  assert.equal(projection.projection.status, "Paused");
  assert.equal(projection.projection.readiness.ready, false);
  assert.equal(projection.projection.latestResult, null);
  assert.equal(projection.projection.source.executionRef, null);
  assert.equal(projection.projection.authoritySummary.admitted, false);
  assert.equal(projection.projection.lastChange.kind, "created");

  const contract = makeContract(prepared, principal, template.profile,
    { number: 1, url: "https://github.com/fixture/golden/issues/1", body: prepared.objective },
    "a".repeat(40), "sofie");
  const executionStore = new ExecutionStore(store);
  await executionStore.admit(prepared, contract);
  const current = await store.get(prepared.id);
  const state = await executionStore.get(prepared.id);
  state.qualificationMode = "simulation";
  const run = queueRun(state, current, "qualification", contract.baseSha);
  const candidate = createCandidate(contract, run,
    { sha: contract.baseSha, files: { "quantity.mjs": "console.log(0);" } },
    { "quantity.mjs": "console.log(2);" });
  run.status = "candidate";
  run.candidate = candidate.sha;
  state.candidates.push(candidate);
  state.phase = "approval";
  // Use the database clock for ordering against SQL history (Docker/host clocks may differ).
  const resultAt = (await pool.query("SELECT clock_timestamp() AS at")).rows[0].at.toISOString();
  state.results.push({
    id: randomUUID(), version: 1, createdAt: resultAt, candidate: candidate.sha,
    summary: "Prior bounded result retained for review.", objective: current.objective,
    criteria: current.criteria, changes: candidate.changedPaths, why: current.objective,
    verification: [], github: { observedAt: new Date().toISOString(), authority: false,
      repository: current.repository, baseSha: contract.baseSha, head: null, pr: null, checks: [], reviews: [] },
    runs: [run], limitations: ["Simulation"], risks: [], interventions: [], reservedUsd: 0,
    costCoverage: "simulation", elapsedSeconds: 1,
  });
  await executionStore.save(current, state, "candidate_review");

  // Reconstruct the reader, as happens after a process or model-session restart.
  projection = await new EngineeringWorkerProjectionStore(new WorkStore(principal, database), "sofie").get(prepared.id);
  assert.equal(projection.projection.workVersion, 2);
  assert.equal(projection.projection.status, "Needs You");
  assert.equal(projection.projection.attention.kind, "publication");
  assert.equal(projection.projection.latestResult.summary, "Prior bounded result retained for review.");
  assert.equal(projection.projection.source.executionRef, `engineering-execution:${prepared.id}:r2`);
  assert.equal(projection.projection.qualificationMode, "simulation");
  assert.equal(projection.projection.workContract.coordinatingAgentId, "sofie");
  assert.equal(projection.projection.authoritySummary.generationCurrent, true);
  assert.equal(projection.projection.readiness.ready, false);
  assert.equal(projection.projection.lastChange.kind, "candidate_review");
  assert.equal((await new EngineeringWorkerProjectionStore(store, "sofie").list())[0].projection.workId, prepared.id);
  await assert.rejects(new EngineeringWorkerProjectionStore(store, "atlas").get(prepared.id), /different owner or Agent/);
  await assert.rejects(new EngineeringWorkerProjectionStore(
    new WorkStore({ ...principal, scopeId: "other-owner" }, database), "sofie",
  ).get(prepared.id), /not found/);

  // Owner takeover immediately fences the old approval prompt, even before a
  // worker has reconciled and saved a new execution revision.
  await store.change(prepared.id, { operation: "takeover", expectedVersion: 2 });
  projection = await new EngineeringWorkerProjectionStore(store, "sofie").get(prepared.id);
  assert.equal(projection.projection.status, "In your hands");
  assert.deepEqual(projection.projection.pendingDecisions, []);
  assert.equal(projection.projection.attention, null);
  assert.equal(projection.projection.lastChange.kind, "takeover");
  assert.equal(projection.projection.authoritySummary.generationCurrent, false);
  console.log("M1 projection: durable restart read, Work/Result/Needs You, owner and Agent scope, takeover fencing passed");
} finally {
  await pool?.end();
  url.pathname = "/postgres";
  await admin.query(`DROP DATABASE IF EXISTS ${databaseName}`);
  await admin.end();
}
