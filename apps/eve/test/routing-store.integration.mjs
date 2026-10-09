import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { Client, Pool } from "pg";
import { loadMigrations, runMigrations } from "../scripts/migration-runner.ts";
import { WorkStore } from "../lib/engineering/store.ts";
import { RoutingStore } from "../lib/engineering/routing-store.ts";

const url = new URL(process.env.ENGINEERING_TEST_ADMIN_URL ?? "postgresql://postgres@127.0.0.1:55468/postgres");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "55468");
assert.equal(url.pathname, "/postgres");
const admin = new Client({ connectionString: url.href });
await admin.connect();
const databaseName = `routing_test_${randomBytes(8).toString("hex")}`;
let pool;
try {
  await admin.query(`CREATE DATABASE ${databaseName}`);
  url.pathname = `/${databaseName}`;
  pool = new Pool({ connectionString: url.href });
  const client = await pool.connect();
  try {
    const database = {
      query: async (sql, params) => (await client.query(sql, params)).rows,
      transaction: async statements => {
        await client.query("BEGIN");
        try {
          for (const statement of statements) await client.query(statement.sql, statement.params);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      },
    };
    const migrations = await loadMigrations();
    assert(migrations.some(migration => migration.name === "0042_engineering_routing.sql"));
    await runMigrations(database, migrations);
    await runMigrations(database, migrations);
  } finally {
    client.release();
  }

  const adapter = { query: async (sql, params) => (await pool.query(sql, params)).rows };
  const principal = { scopeId: "route-owner", scopeKind: "personal", actorId: "owner" };
  const workStore = new WorkStore(principal, adapter);
  const routes = new RoutingStore(workStore);
  const { work } = await workStore.create({
    title: "Bounded issue",
    objective: "Fix a parser regression",
    repository: "fixture/parser",
    criteria: [{ id: randomUUID(), statement: "Regression test passes", method: "test" }],
    maxCostUsd: 1,
    maxDurationSeconds: 120,
    idempotencyKey: randomUUID(),
  });
  assert.deepEqual(await routes.snapshot(work.id), { decision: null, transitions: [], runs: [] });

  const proposal = {
    expectedWorkVersion: work.version,
    selectedRoute: "DEEP_AGENT",
    reason: "Exploratory parser diagnosis needs a bounded Sofie loop.",
    source: "RULE",
    profile: {
      profileVersion: 1,
      workShape: "exploratory",
      decomposition: "single issue",
      interaction: "low",
      parallelism: "none",
      verification: "deterministic",
      duration: "short",
      ambiguity: "medium",
      externalExpertise: "none",
      humanJudgment: "none",
      risk: "bounded",
    },
    eligibleRoutes: ["DEEP_AGENT", "HUMAN"],
    rejectedRoutes: [{ route: "MYFACTORY", reason: "The issue is not decomposed." }],
    constraints: ["No provider is admitted by this proposal."],
    providerId: "deep-agents-spike",
    providerVersion: "0.1",
  };
  const attempts = await Promise.allSettled([
    routes.recordProposal(work.id, proposal),
    routes.recordProposal(work.id, { ...proposal, reason: "Competing assessment" }),
  ]);
  assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(attempts.filter(result => result.status === "rejected").length, 1);
  const snapshot = await new RoutingStore(new WorkStore(principal, adapter)).snapshot(work.id);
  assert.equal(snapshot.decision.status, "PROPOSED");
  assert.equal(snapshot.decision.workVersion, 1);
  assert.equal(snapshot.decision.selectedRoute, "DEEP_AGENT");
  assert.deepEqual(snapshot.decision.profile, proposal.profile);
  assert.deepEqual(snapshot.decision.eligibleRoutes, proposal.eligibleRoutes);
  assert.equal(snapshot.decision.providerId, proposal.providerId);
  assert.equal(snapshot.transitions.length, 0);
  assert.equal(snapshot.runs.length, 0);
  assert.equal((await pool.query("SELECT count(*)::int n FROM engineering_routing_decisions")).rows[0].n, 1);

  const foreign = new RoutingStore(new WorkStore({ ...principal, scopeId: "other-owner" }, adapter));
  await assert.rejects(foreign.snapshot(work.id), /not found/);
  await assert.rejects(foreign.recordProposal(work.id, proposal), /not found/);
  await assert.rejects(routes.recordProposal(work.id, { ...proposal, selectedRoute: "FACTORY" }), /Invalid option/);
  await assert.rejects(routes.recordProposal(work.id, { ...proposal, source: "SOFIE" }), /Invalid option/);
  await assert.rejects(routes.recordProposal(work.id, { ...proposal, profile: { workShape: "exploratory" } }), /profileVersion/);
  await assert.rejects(routes.recordProposal(work.id, { ...proposal, eligibleRoutes: ["HUMAN"] }), /selected route must be eligible/i);

  const changed = await workStore.change(work.id, { operation: "pause", expectedVersion: 1 });
  assert.equal(changed.version, 2);
  assert.equal((await routes.snapshot(work.id)).decision.status, "STALE");
  await assert.rejects(routes.recordProposal(work.id, { ...proposal, expectedWorkVersion: 1 }), /changed/);
  const next = await routes.recordProposal(work.id, { ...proposal, expectedWorkVersion: 2, selectedRoute: "HUMAN", providerId: null, providerVersion: null });
  assert.equal(next.status, "PROPOSED");
  assert.equal((await routes.snapshot(work.id)).decision.id, next.id);

  await pool.query(
    `INSERT INTO engineering_route_transitions(id,scope_id,scope_kind,work_id,work_version,from_route,to_route,reason,trigger)
     VALUES($1,$2,$3,$4,$5,'DEEP_AGENT','HUMAN','Needs owner judgment','owner-review')`,
    [randomUUID(), principal.scopeId, principal.scopeKind, work.id, 2],
  );
  await pool.query(
    `INSERT INTO engineering_route_runs(id,scope_id,scope_kind,work_id,route,provider_id,provider_version,status)
     VALUES($1,$2,$3,$4,'DEEP_AGENT','deep-agents-spike','0.1','COMPLETED')`,
    [randomUUID(), principal.scopeId, principal.scopeKind, work.id],
  );
  const history = await routes.snapshot(work.id);
  assert.equal(history.transitions[0].trigger, "owner-review");
  assert.equal(history.runs[0].status, "COMPLETED");
  await assert.rejects(foreign.snapshot(work.id), /not found/);

  await pool.query("UPDATE engineering_route_runs SET status='BLOCKED' WHERE work_id=$1", [work.id]);
  const changedAgain = await workStore.change(work.id, { operation: "resume", expectedVersion: 2 });
  assert.equal(changedAgain.version, 3);
  await assert.rejects(routes.recordProposal(work.id, { ...proposal, expectedWorkVersion: 3 }), /writer state changed/);
  await pool.query("UPDATE engineering_route_runs SET status='COMPLETED' WHERE work_id=$1", [work.id]);
  await pool.query(
    `INSERT INTO engineering_execution(scope_id,scope_kind,work_id,revision,state)
     VALUES($1,$2,$3,1,$4::jsonb)`,
    [principal.scopeId, principal.scopeKind, work.id, JSON.stringify({ phase: "stopped", runs: [], effects: [] })],
  );
  const changedAfterExecution = await workStore.change(work.id, { operation: "pause", expectedVersion: 3 });
  assert.equal(changedAfterExecution.version, 4);
  await assert.rejects(routes.recordProposal(work.id, { ...proposal, expectedWorkVersion: 4 }), /writer state changed/);
  assert.equal((await routes.snapshot(work.id)).decision.status, "STALE");
  assert.equal((await pool.query("SELECT count(*)::int n FROM engineering_routing_decisions")).rows[0].n, 2);

  console.log("ER1 routing persistence: migration, scoped snapshot, CAS, stale status, legacy-writer denial passed");
} finally {
  if (pool) await pool.end();
  await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  await admin.end();
}
