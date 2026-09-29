import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { Client, Pool } from "pg";
import { loadMigrations, runMigrations } from "../scripts/migration-runner.ts";
import { RouteAdmissionService } from "../lib/engineering/route-admission.ts";
import { RoutingStore } from "../lib/engineering/routing-store.ts";
import { EngineeringWorkerProjectionStore } from "../lib/engineering/worker-projection.ts";
import { WorkStore } from "../lib/engineering/store.ts";

const url = new URL(process.env.ENGINEERING_TEST_ADMIN_URL ?? "postgresql://postgres@127.0.0.1:55479/postgres");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "55479");
assert.equal(url.pathname, "/postgres");
const admin = new Client({ connectionString: url.href });
await admin.connect();
const databaseName = `route_admission_${randomBytes(8).toString("hex")}`;
let pool;
try {
  await admin.query(`CREATE DATABASE ${databaseName}`);
  url.pathname = `/${databaseName}`;
  pool = new Pool({ connectionString: url.href });
  const migrationClient = await pool.connect();
  try {
    const database = {
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
    };
    const migrations = await loadMigrations();
    assert(migrations.some(migration => migration.name === "0043_engineering_route_admission.sql"));
    await runMigrations(database, migrations, () => {});
  } finally {
    migrationClient.release();
  }

  const adapter = { query: async (sql, params) => (await pool.query(sql, params)).rows };
  const principal = { scopeId: "route-owner", scopeKind: "personal", actorId: "route-owner" };
  const store = new WorkStore(principal, adapter);
  const routes = new RoutingStore(store);
  const profile = {
    profileVersion: 1, workShape: "bounded read", decomposition: "single step",
    interaction: "none", parallelism: "none", verification: "deterministic",
    duration: "short", ambiguity: "low", externalExpertise: "none",
    humanJudgment: "none", risk: "low",
  };
  const provider = { id: "qualified-direct", version: 1 };

  async function preparedWork(label) {
    const created = await store.create({
      title: label, objective: "Read the bounded repository fact.", repository: "fixture/parser",
      criteria: [{ id: randomUUID(), statement: "Fact is sourced", method: "test" }],
      maxCostUsd: 2, maxDurationSeconds: 120, idempotencyKey: randomUUID(),
    });
    const work = await store.change(created.work.id, { operation: "resume", expectedVersion: 1 });
    const proposal = await routes.recordProposal(work.id, {
      expectedWorkVersion: work.version, selectedRoute: "DIRECT",
      reason: "A bounded deterministic read fits direct tools.", source: "RULE", profile,
      eligibleRoutes: ["DIRECT", "HUMAN"], rejectedRoutes: [], constraints: [],
      providerId: provider.id, providerVersion: String(provider.version),
    });
    return { work, proposal };
  }

  function authorityFor(overrides = {}) {
    return { read: async work => {
      const now = Date.now();
      const scope = { kind: "personal", id: principal.scopeId };
      const qualification = {
        provider, scope, status: "QUALIFIED", health: "HEALTHY",
        evidenceRef: "qualification:direct-v1", observedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 60_000).toISOString(),
      };
      const contract = {
        contractVersion: 2, workId: work.id, workVersion: work.version,
        criteriaVersion: work.criteriaVersion, scope, humanOwnerId: principal.scopeId,
        coordinatingAgentId: "agent-sofie", objective: work.objective,
        criteria: work.criteria.map(item => ({ id: item.id, statement: item.statement, evidence: "deterministic" })),
        resourceRefs: [`repository:${work.repository}`], allowedOperations: ["workspace.read"],
        budgetUsd: 2, deadline: new Date(now + 60_000).toISOString(), policyVersion: 1,
        composition: { role: { id: "software-engineer", version: 1 }, capabilityPacks: [], mode: { id: "normal", version: 1 } },
        routingProfile: profile, routePolicy: { id: "personal-direct", version: 1 },
        definitionOfDone: ["A source-linked result is retained."], allowedRoutes: ["DIRECT"],
      };
      const context = {
        contractVersion: 2, workId: work.id, workVersion: work.version, scope,
        agentId: "agent-sofie", assembledAt: new Date(now).toISOString(),
        maxTokens: 500, estimatedTokens: 50, items: [],
      };
      const facts = {
        currentWorkVersion: work.version, currentCriteriaVersion: work.criteriaVersion,
        currentPolicyVersion: 1, workActive: true, scope, agentId: "agent-sofie",
        authority: "ALLOW", remainingBudgetUsd: 2, allowedRoutes: ["DIRECT"],
        allowedOperations: ["workspace.read"], allowedResourceRefs: [`repository:${work.repository}`],
        routePolicy: { id: "personal-direct", version: 1, allowedRoutes: ["DIRECT"],
          providers: { DIRECT: provider, DEEP_AGENT: null, EXECUTOR: null, MYFACTORY: null, RELAY: null } },
        qualifications: { DIRECT: qualification, DEEP_AGENT: null, EXECUTOR: null, MYFACTORY: null, RELAY: null },
        writerState: "NONE", factoryAdmission: "UNKNOWN", relayGrant: "UNKNOWN", peerPolicy: "UNKNOWN",
        observedAt: new Date(now).toISOString(),
      };
      return { contract: { ...contract, ...overrides.contract }, context: { ...context, ...overrides.context },
        facts: { ...facts, ...overrides.facts } };
    } };
  }

  function request(work, proposal) {
    return { decisionId: proposal.id, expectedWorkVersion: work.version,
      request: { route: "DIRECT", requiredOperations: ["workspace.read"], resourceRefs: [`repository:${work.repository}`] } };
  }

  const { work, proposal } = await preparedWork("Admit once");
  const admission = new RouteAdmissionService(store, authorityFor());
  const attempts = await Promise.allSettled([
    admission.admit(work.id, request(work, proposal)),
    admission.admit(work.id, request(work, proposal)),
  ]);
  assert.equal(attempts.filter(item => item.status === "fulfilled").length, 1);
  assert.equal(attempts.filter(item => item.status === "rejected").length, 1);
  const receipt = attempts.find(item => item.status === "fulfilled").value;
  assert.equal(receipt.workVersion, work.version);
  assert.equal(receipt.workGeneration, work.generation);
  assert.equal(receipt.status, "QUEUED");
  const snapshot = await routes.snapshot(work.id);
  assert.equal(snapshot.decision.status, "ADMITTED");
  assert.equal(snapshot.decision.admission.policyId, "personal-direct");
  assert.deepEqual(snapshot.decision.admission.request.requiredOperations, ["workspace.read"]);
  assert.match(snapshot.decision.admission.contextHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(snapshot.transitions.length, 1);
  assert.equal(snapshot.transitions[0].fromRoute, "HUMAN");
  assert.equal(snapshot.transitions[0].toRoute, "DIRECT");
  assert.equal(snapshot.transitions[0].decisionId, proposal.id);
  assert.equal(snapshot.runs.length, 1);
  assert.equal(snapshot.runs[0].status, "QUEUED");
  assert.equal(snapshot.runs[0].workGeneration, work.generation);
  const queuedProjection = (await new EngineeringWorkerProjectionStore(store).get(work.id)).projection;
  assert.equal(queuedProjection.status, "Queued");
  assert.equal(queuedProjection.authoritySummary.admitted, true);
  assert.equal(queuedProjection.authoritySummary.generationCurrent, true);
  assert.equal(queuedProjection.readiness.ready, false);
  assert.match(queuedProjection.nextStep, /no execution result exists yet/i);
  await assert.rejects(pool.query(
    `INSERT INTO engineering_route_runs(id,scope_id,scope_kind,work_id,route,status,provider_id,provider_version,decision_id,work_version,work_generation)
     SELECT $1,scope_id,scope_kind,work_id,route,status,provider_id,provider_version,decision_id,work_version,work_generation
     FROM engineering_route_runs WHERE scope_id=$2 AND scope_kind=$3 AND work_id=$4`,
    [randomUUID(), principal.scopeId, principal.scopeKind, work.id],
  ), error => error.code === "23505");
  const [admissionRow] = (await pool.query(
    `SELECT admission_context_snapshot,admission_authority_snapshot
     FROM engineering_routing_decisions WHERE id=$1`, [proposal.id],
  )).rows;
  assert.equal(admissionRow.admission_context_snapshot.workId, work.id);
  assert.equal(admissionRow.admission_authority_snapshot.facts.routePolicy.id, "personal-direct");
  const persisted = await new RoutingStore(new WorkStore(principal, adapter)).snapshot(work.id);
  assert.equal(persisted.decision.admission.authorityHash, snapshot.decision.admission.authorityHash);
  const foreign = new RouteAdmissionService(new WorkStore({ ...principal, scopeId: "other-owner", actorId: "other-owner" }, adapter), authorityFor());
  await assert.rejects(foreign.admit(work.id, request(work, proposal)), /not found/);
  const otherActor = new RouteAdmissionService(new WorkStore({ ...principal, actorId: "another-actor" }, adapter), authorityFor());
  await assert.rejects(otherActor.admit(work.id, request(work, proposal)), /owner authority/);
  const paused = await store.change(work.id, { operation: "pause", expectedVersion: work.version });
  assert.equal((await routes.snapshot(work.id)).decision.status, "STALE");
  const pausedProjection = (await new EngineeringWorkerProjectionStore(store).get(work.id)).projection;
  assert.equal(pausedProjection.status, "Paused");
  assert.equal(pausedProjection.authoritySummary.generationCurrent, false);
  await assert.rejects(routes.recordProposal(work.id, {
    expectedWorkVersion: paused.version, selectedRoute: "HUMAN", reason: "A writer remains queued.",
    source: "RECOVERY", profile, eligibleRoutes: ["HUMAN"], rejectedRoutes: [],
    constraints: [], providerId: null, providerVersion: null,
  }), /writer state changed/);

  const blocked = await preparedWork("Policy and provider denials");
  const blockedRequest = request(blocked.work, blocked.proposal);
  // A policy service outage or an incomplete snapshot must leave the proposal
  // untouched. Neither the UI nor an agent may fill the missing facts in.
  for (const unavailableAuthority of [
    { read: async () => { throw new Error("policy source unavailable"); } },
    { read: async () => undefined },
    { read: async () => ({ authority: "ALLOW" }) },
  ]) {
    await assert.rejects(new RouteAdmissionService(store, unavailableAuthority).admit(blocked.work.id, blockedRequest));
    const unchanged = await routes.snapshot(blocked.work.id);
    assert.equal(unchanged.decision.status, "PROPOSED");
    assert.equal(unchanged.transitions.length, 0);
    assert.equal(unchanged.runs.length, 0);
  }
  for (const overrides of [
    { facts: { remainingBudgetUsd: 0 } },
    { facts: { authority: "UNKNOWN" } },
    { facts: { qualifications: { DIRECT: { provider, scope: { kind: "personal", id: principal.scopeId },
      status: "QUALIFIED", health: "UNHEALTHY", evidenceRef: "qualification:direct-v1",
      observedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString() },
      DEEP_AGENT: null, EXECUTOR: null, MYFACTORY: null, RELAY: null } } },
    { contract: { objective: "Wrong objective" } },
  ]) {
    await assert.rejects(new RouteAdmissionService(store, authorityFor(overrides)).admit(blocked.work.id, blockedRequest));
    const unchanged = await routes.snapshot(blocked.work.id);
    assert.equal(unchanged.decision.status, "PROPOSED");
    assert.equal(unchanged.runs.length, 0);
  }

  const changed = await preparedWork("Version race");
  const changingAuthority = { read: async current => {
    const value = await authorityFor().read(current);
    await store.change(current.id, { operation: "pause", expectedVersion: current.version });
    return value;
  } };
  await assert.rejects(new RouteAdmissionService(store, changingAuthority).admit(changed.work.id, request(changed.work, changed.proposal)), /changed/);
  assert.equal((await routes.snapshot(changed.work.id)).decision.status, "STALE");
  assert.equal((await routes.snapshot(changed.work.id)).runs.length, 0);

  const competing = await preparedWork("Legacy writer");
  await pool.query(
    `INSERT INTO engineering_execution(scope_id,scope_kind,work_id,revision,state)
     VALUES($1,$2,$3,1,$4::jsonb)`,
    [principal.scopeId, principal.scopeKind, competing.work.id, JSON.stringify({ phase: "idle", runs: [], effects: [] })],
  );
  await assert.rejects(admission.admit(competing.work.id, request(competing.work, competing.proposal)), /writer state changed/);
  assert.equal((await routes.snapshot(competing.work.id)).decision.status, "PROPOSED");
  assert.equal((await routes.snapshot(competing.work.id)).runs.length, 0);

  console.log("Route admission: scoped policy/provider checks, concurrent CAS, durable receipt, version race and legacy writer denial passed");
} finally {
  if (pool) await pool.end();
  // Pool shutdown can resolve before PostgreSQL has removed its backend rows.
  // Wait for this disposable database to quiesce instead of killing connections.
  let quiescent = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await admin.query(
      "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1",
      [databaseName],
    );
    if (result.rows[0].count === 0) { quiescent = true; break; }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert(quiescent, "Disposable route-admission database did not quiesce");
  await admin.query(`DROP DATABASE IF EXISTS ${databaseName}`);
  await admin.end();
}
