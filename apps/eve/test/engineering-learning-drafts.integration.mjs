import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { Client, Pool } from "pg";

import { loadMigrations, runMigrations } from "../scripts/migration-runner.ts";
import { EngineeringLearningDraftStore } from "../lib/engineering/learning-drafts.ts";
import { WorkStore } from "../lib/engineering/store.ts";

const url = new URL(process.env.ENGINEERING_TEST_ADMIN_URL ?? "postgresql://postgres@127.0.0.1:55468/postgres");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "55468");
assert.equal(url.pathname, "/postgres");
const admin = new Client({ connectionString: url.href });
await admin.connect();
const databaseName = `learning_draft_test_${randomBytes(8).toString("hex")}`;
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
  const ownerId = "learning-owner";
  const principal = { scopeId: ownerId, scopeKind: "personal", actorId: ownerId };
  const store = new WorkStore(principal, database);
  const { work } = await store.create({
    title: "Parser correction", objective: "Reject fractional quantities", repository: "fixture/parser",
    criteria: [{ id: randomUUID(), statement: "Fractions are rejected", method: "test" }],
    maxCostUsd: 1, maxDurationSeconds: 120, idempotencyKey: randomUUID(),
  });
  const now = Date.now();
  const observedAt = new Date(now - 20_000).toISOString();
  const feedback = {
    feedbackId: randomUUID(), workId: work.id, workVersion: work.version,
    scope: { kind: "personal", id: ownerId }, ownerId, agentId: "sofie",
    repository: work.repository, workShape: "localized bug",
    source: { kind: "OWNER_CORRECTION", sourceRef: `owner-review:${randomUUID()}`,
      actorId: ownerId, observedAt },
    summary: "The first candidate missed fractions.",
    evidence: [{ sourceRef: `check:${randomUUID()}`, contentHash: `sha256:${"a".repeat(64)}`, observedAt }],
    supervision: { interventions: 1, cost: { status: "UNKNOWN", reason: "Human time was not measured." } },
    recordedAt: new Date(now - 10_000).toISOString(),
  };
  const proposal = { candidateId: randomUUID(), subject: "QUALITY_CHECK",
    recommendation: "Check fractions before presenting the next parser candidate.",
    rationale: "The owner correction identified an omitted edge case.",
    createdAt: new Date(now - 5_000).toISOString() };

  const drafts = new EngineeringLearningDraftStore(store);
  const first = await drafts.stage(feedback, proposal);
  assert.equal(first.status, "DRAFT_UNVERIFIED");
  assert.equal(first.trust, "ADVISORY_ONLY");
  assert.equal(first.candidate.sourceWorkVersion, work.version);
  assert.equal((await drafts.stage(feedback, proposal)).candidate.contentHash, first.candidate.contentHash);

  // A reconstructed store can read the same draft, while another owner or an
  // organization cannot read or stage it.
  const restarted = new EngineeringLearningDraftStore(new WorkStore(principal, database));
  assert.equal((await restarted.list(work.id))[0].candidate.candidateId, proposal.candidateId);
  await assert.rejects(new EngineeringLearningDraftStore(new WorkStore(
    { ...principal, scopeId: "other-owner", actorId: "other-owner" }, database,
  )).list(work.id), /not found/);
  await assert.rejects(new EngineeringLearningDraftStore(new WorkStore(
    { ...principal, scopeKind: "organization" }, database,
  )).list(work.id), /personal Work owner/);
  await assert.rejects(drafts.stage({ ...feedback, repository: "other/repo" },
    { ...proposal, candidateId: randomUUID() }), /current owner-scoped Work revision/);
  await assert.rejects(drafts.stage({ ...feedback, feedbackId: randomUUID() },
    { ...proposal, recommendation: "A different candidate." }), /changed/);

  await store.change(work.id, { operation: "revise", expectedVersion: work.version,
    criteria: [{ ...work.criteria[0], statement: "Fractions and negatives are rejected" }] });
  await assert.rejects(drafts.stage({ ...feedback, feedbackId: randomUUID() },
    { ...proposal, candidateId: randomUUID() }), /current owner-scoped Work revision/);
  assert.equal((await drafts.list(work.id)).length, 1); // history survives Work revision

  await assert.rejects(pool.query(
    "UPDATE engineering_learning_drafts SET status='QUALIFIED' WHERE id=$1", [proposal.candidateId],
  ), /check constraint/);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM engineering_learning_drafts")).rows[0].n, 1);
  console.log("M6 draft store: durable owner scope, Work revision, idempotency, no promotion or authority passed");
} finally {
  await pool?.end();
  url.pathname = "/postgres";
  await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  await admin.end();
}
