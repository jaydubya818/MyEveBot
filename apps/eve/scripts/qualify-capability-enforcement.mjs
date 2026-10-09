import { issuePolicyDecision, policyChallengeMaterial, requireQualifiedRemoteAdmission } from '../../../packages/capability-enforcement/src/decisions.ts';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateKeyPairSync, sign, verify, randomUUID } from 'node:crypto';
import { capabilityRegistry } from '@mission-control/capability-control';
import { assertCapabilityAdmission, withCapabilityAdmission } from '@myeve/capability-enforcement';
import { CapabilityStore } from '../lib/capability-control/store.ts';
import { loadMigrations, runMigrations } from './migration-runner.ts';
import { RouteAdmissionService } from '../lib/engineering/route-admission.ts';
import { RoutingStore } from '../lib/engineering/routing-store.ts';
import { WorkStore } from '../lib/engineering/store.ts';
import { ExecutionStore } from '../lib/engineering/execution-store.ts';
import { admitCapabilityWork } from '../lib/capability-control/admission.ts';

export async function qualifyEnforcement({ admin, runtime, check }) {
  await admin.query(await readFile('../../docs/capability-control/enforcement.sql', 'utf8'));
  await admin.query(await readFile('../../docs/capability-control/decisions.sql', 'utf8'));
  await admin.query('GRANT SELECT,INSERT ON capability_control.policy_decisions TO capability_runtime');
  await admin.query('GRANT SELECT ON capability_control.relay_agent_evidence TO capability_runtime');
  await admin.query('GRANT EXECUTE ON FUNCTION capability_control.lock_admission_policy(text,text,text) TO capability_runtime');
  await admin.query('CREATE TABLE admission_fixture(id text PRIMARY KEY, evidence jsonb)');
  await admin.query('GRANT SELECT,INSERT ON admission_fixture TO capability_runtime');
  const scope = { ownerId: 'synthetic-enforcement-owner', organizationId: 'organization-1', installationId: 'qualification-1', environment: 'qualification', agentId: 'enforcement-agent' };
  const request = { capabilityId: 'myfactory', workId: 'synthetic-work', workGeneration: 1, budgetMicros: 100 };
  const store = new CapabilityStore(runtime, { id: scope.installationId, environment: scope.environment }, { ownerId: scope.ownerId, source: 'settings' });
  const facts = Object.fromEntries(capabilityRegistry.capabilities.map(item => [item.id, {
    supported: true, deployed: true, entitled: true, administrator: 'ALLOW', lifecycle: 'ACTIVE',
    setup: Object.fromEntries(item.setupRequirements.map(key => [key, true])),
    qualification: Object.fromEntries(item.qualificationRequirements.map(key => [key, 'QUALIFIED'])),
  }]));
  await admin.query(`INSERT INTO capability_control.platform_owner_bindings VALUES
    ('qualification-1','organization-1',$1,'enforcement-binding',1,'synthetic-auth','synthetic-admin','synthetic-membership','synthetic-installation','synthetic-audit','ACTIVE',clock_timestamp()+interval '1 hour')`, [scope.ownerId]);
  await admin.query(`INSERT INTO capability_control.evidence VALUES('qualification-1','organization-1',$1,'1',$2,clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour','synthetic-relay-organization-policy')`, [scope.ownerId, facts]);
  await admin.query(`INSERT INTO capability_control.relay_agent_evidence VALUES('qualification-1',$1,'organization-1',$2,1,$3,'ACTIVE',clock_timestamp()+interval '1 hour','synthetic-relay-agent-policy')`, [scope.ownerId, scope.agentId, JSON.stringify(capabilityRegistry.capabilities.map(item => item.id))]);
  async function transaction(action) {
    const client = await runtime.connect();
    try { await client.query('BEGIN'); const result = await action(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const admit = (changes = {}, scopeChanges = {}) => transaction(client => withCapabilityAdmission(client, { ...scope, ...scopeChanges }, { ...request, ...changes }, async evidence => {
    const id = randomUUID(); await client.query('INSERT INTO admission_fixture VALUES($1,$2)', [id, evidence]); return id;
  }));
  async function change(capabilityId, operation, extra = {}) {
    const view = await store.inspect();
    return store.command({ requestId: randomUUID(), expectedRevision: view.revision, capabilityId, operation, ...extra });
  }
  await check('enforcement admits qualified preferences only within one restricted transaction', async () => {
    const id = await admit(); const row = (await admin.query('SELECT evidence FROM admission_fixture WHERE id=$1', [id])).rows[0];
    assert.equal(row.evidence.policyRevision, 1); assert.equal(row.evidence.capabilityId, 'myfactory');
    await assert.rejects(assertCapabilityAdmission(runtime, scope, request));
    await assert.rejects(assertCapabilityAdmission(admin, scope, request), /RUNTIME_ROLE_UNQUALIFIED/);
  });
  const backendKeys = generateKeyPairSync('ed25519'), sourceKeys = generateKeyPairSync('ed25519');
  const decisionBinding = { scope, backendId: 'myfactory', keyId: 'synthetic-backend-key', publicKeyPem: backendKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString() };
  const decisionSigner = { keyId: 'synthetic-source-key', sign: async material => sign(null, Buffer.from(material), sourceKeys.privateKey).toString('base64url') };
  const challenge = { schema: 'myeve.policy-challenge.v1', requestId: randomUUID(), backendId: decisionBinding.backendId,
    installationId: scope.installationId, ownerId: scope.ownerId, organizationId: scope.organizationId, agentId: scope.agentId,
    keyId: decisionBinding.keyId, ...request, actionDigest: 'a'.repeat(64), nonce: randomUUID(), issuedAt: Date.now(), expiresAt: Date.now() + 30000 };
  const signChallenge = value => sign(null, Buffer.from(policyChallengeMaterial(value)), backendKeys.privateKey).toString('base64url');
  const issue = (value = challenge, signature = signChallenge(value)) => transaction(client => issuePolicyDecision(client, value, signature, decisionBinding, decisionSigner));
  await check('durable authenticated policy decisions deduplicate concurrent requests without creating execution authority', async () => {
    const decisions = await Promise.all([issue(), issue()]);
    assert.deepEqual(decisions[0], decisions[1]);
    assert.equal(decisions[0].payload.admissionEligible, false);
    assert.ok(verify(null, Buffer.from(decisions[0].hash), sourceKeys.publicKey, Buffer.from(decisions[0].signature, 'base64url')));
    assert.throws(() => requireQualifiedRemoteAdmission(decisions[0]), /ORDERING_UNQUALIFIED/);
    assert.equal((await admin.query('SELECT count(*) FROM capability_control.policy_decisions')).rows[0].count, '1');
    await assert.rejects(admin.query("UPDATE capability_control.policy_decisions SET fingerprint='tampered'"), /immutable/);
  });
  await check('policy references reject owner audience signature expiry and changed-payload replay', async () => {
    for (const changes of [{ ownerId: 'foreign' }, { organizationId: 'foreign' }, { installationId: 'foreign' }, { agentId: 'foreign' },
      { backendId: 'missioncontrol' }, { workGeneration: 2 }, { actionDigest: 'b'.repeat(64) }, { issuedAt: Date.now()+10000 }, { expiresAt: Date.now()-1 }])
      await assert.rejects(issue({ ...challenge, ...changes }));
    await assert.rejects(issue(challenge, 'invalid'), /SIGNATURE_INVALID/);
  });
  await check('decision replay rechecks expiry after waiting behind a concurrent owner lock', async () => {
    const short = { ...challenge, requestId: randomUUID(), nonce: randomUUID(), issuedAt: Date.now(), expiresAt: Date.now()+1000 };
    await issue(short);
    const holder=await admin.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT * FROM capability_control.owner_state WHERE installation_id=$1 AND owner_id=$2 FOR UPDATE',[scope.installationId,scope.ownerId]);
      const rejected=assert.rejects(issue(short),/DECISION_STALE|CHALLENGE_EXPIRED/);
      await holder.query('SELECT pg_sleep(1.2)');
      await holder.query('COMMIT');
      await rejected;
    } finally { await holder.query('ROLLBACK');holder.release(); }
  });
  await check('enforcement isolates owner organization installation and agent', async () => {
    for (const changes of [{ ownerId: 'other-owner' }, { organizationId: 'other-organization' }, { installationId: 'qualification-2' }, { agentId: 'other-agent' }, { environment: 'development' }]) await assert.rejects(admit({}, changes));
    await assert.rejects(runtime.query('DELETE FROM capability_control.relay_agent_evidence'), /permission denied/);
  });
  await check('disabled preference rejects new admission and keeps committed Work evidence', async () => {
    const before = (await admin.query('SELECT count(*) FROM admission_fixture')).rows[0].count;
    await change('myfactory', 'disable'); await assert.rejects(admit(), /POLICY_BLOCKED:myfactory/);
    await assert.rejects(issue(), /POLICY_BLOCKED:myfactory/);
    assert.equal((await admin.query('SELECT count(*) FROM admission_fixture')).rows[0].count, before);
    await change('myfactory', 'enable');
  });
  await check('disabling MissionControl preserves independent Factory and Native admission', async () => {
    await change('missioncontrol', 'disable');
    await assert.rejects(admit({ capabilityId: 'missioncontrol' }), /POLICY_BLOCKED/);
    await admit(); await admit({ capabilityId: 'sofie.native' });
  });
  await check('dependencies and bounded owner budgets constrain new admissions', async () => {
    await change('work', 'disable'); await assert.rejects(admit(), /POLICY_BLOCKED/); await change('work', 'enable');
    await change('myfactory', 'set_budget', { limitMicros: 100 });
    await admit(); await assert.rejects(admit({ budgetMicros: 101 }), /BUDGET_EXCEEDED/);
    await assert.rejects(admit({ expectedRevision: 1 }), /POLICY_REVISION_STALE/);
  });
  await check('Relay denial qualification and revocation cannot be overridden by enabled preferences', async () => {
    for (const field of ['administrator', 'qualification', 'lifecycle']) {
      const blocked = structuredClone(facts);
      if (field === 'administrator') blocked.myfactory.administrator = 'DENY';
      if (field === 'qualification') blocked.myfactory.qualification = {};
      if (field === 'lifecycle') blocked.myfactory.lifecycle = 'REVOKED';
      await admin.query('UPDATE capability_control.evidence SET facts=$2 WHERE owner_id=$1', [scope.ownerId, blocked]);
      await assert.rejects(admit(), /POLICY_BLOCKED/);
    }
    await admin.query('UPDATE capability_control.evidence SET facts=$2 WHERE owner_id=$1', [scope.ownerId, facts]);
    await admin.query("UPDATE capability_control.relay_agent_evidence SET status='REVOKED' WHERE owner_id=$1", [scope.ownerId]);
    await assert.rejects(admit(), /AGENT_POLICY_UNAVAILABLE/);
    await admin.query("UPDATE capability_control.relay_agent_evidence SET status='ACTIVE',capability_ids='[\"myfactory\"]' WHERE owner_id=$1", [scope.ownerId]);
    await assert.rejects(admit(), /AGENT_DENIED:work/);
    await admin.query('UPDATE capability_control.relay_agent_evidence SET capability_ids=$2 WHERE owner_id=$1', [scope.ownerId, JSON.stringify(capabilityRegistry.capabilities.map(item => item.id))]);
  });
  await check('policy expiry during backend admission rolls back the backend write', async () => {
    const before = (await admin.query('SELECT count(*) FROM admission_fixture')).rows[0].count;
    await admin.query("UPDATE capability_control.evidence SET expires_at=clock_timestamp()+interval '200 milliseconds' WHERE owner_id=$1", [scope.ownerId]);
    await assert.rejects(transaction(client => withCapabilityAdmission(client, scope, request, async evidence => {
      await client.query('INSERT INTO admission_fixture VALUES($1,$2)', [randomUUID(), evidence]);
      await client.query('SELECT pg_sleep(0.25)');
    })), /POLICY_EVIDENCE_STALE/);
    assert.equal((await admin.query('SELECT count(*) FROM admission_fixture')).rows[0].count, before);
    await admin.query("UPDATE capability_control.evidence SET expires_at=clock_timestamp()+interval '1 hour' WHERE owner_id=$1", [scope.ownerId]);
  });
  await check('concurrent disable waits for admission and denies every subsequent new admission', async () => {
    const client = await runtime.connect(); let pending;
    try {
      await client.query('BEGIN'); await assertCapabilityAdmission(client, scope, request);
      const revision = Number((await client.query('SELECT revision FROM capability_control.owner_state WHERE owner_id=$1', [scope.ownerId])).rows[0].revision);
      pending = store.command({ requestId: randomUUID(), expectedRevision: revision, capabilityId: 'myfactory', operation: 'disable' });
      await client.query('INSERT INTO admission_fixture VALUES($1,$2)', [randomUUID(), { revision }]);
      await client.query('COMMIT'); await pending;
      await assert.rejects(admit(), /POLICY_BLOCKED/);
    } finally { await client.query('ROLLBACK'); client.release(); }
    await change('myfactory', 'enable');
  });
  await qualifyWorkBoundaries({ admin, runtime, check, scope, change, transaction });
  await check('pending pause and revoke block new Work without fabricating a backend stop', async () => {
    await change('myfactory', 'pause'); await assert.rejects(admit(), /CONTROL_PENDING/);
    await change('myfactory', 'revoke'); await assert.rejects(admit(), /CONTROL_PENDING/);
    const view = await store.inspect(); assert.equal(view.activeWork.status, 'UNKNOWN');
    const rows = (await admin.query('SELECT status,backend_receipt FROM capability_control.control_requests WHERE owner_id=$1', [scope.ownerId])).rows;
    assert.ok(rows.every(row => row.status === 'PENDING_BACKEND' && row.backend_receipt === null));
  });
  await check('MyEve admission wrapper denies a pool or foreign principal before backend writes', async () => {
    let writes = 0;
    const work = { id: request.workId, scopeId: scope.ownerId, generation: 1 };
    const principal = { scopeId: scope.ownerId, actorId: scope.ownerId, scopeKind: 'personal' };
    await assert.rejects(admitCapabilityWork({ principal, database: { query() { writes++; } } }, work, 'myfactory', scope.agentId, 0, async () => { writes++; }), /Transactional/);
    await assert.rejects(admitCapabilityWork({ principal: { ...principal, actorId: 'foreign' }, database: {} }, work, 'myfactory', scope.agentId, 0, async () => { writes++; }), /owner authority/);
    assert.equal(writes, 0);
  });
}

async function qualifyWorkBoundaries({ admin, runtime, check, scope, change, transaction }) {
  const client = await admin.connect();
  try {
    await runMigrations({ query: async (sql, values) => (await client.query(sql, values)).rows,
      transaction: async statements => {
        await client.query('BEGIN');
        try { for (const s of statements) await client.query(s.sql, s.params); await client.query('COMMIT'); }
        catch (error) { await client.query('ROLLBACK'); throw error; }
      } }, await loadMigrations(), () => {});
  } finally { client.release(); }
  await admin.query('GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO capability_runtime');
  await admin.query('GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO capability_runtime');
  await admin.query('GRANT EXECUTE ON FUNCTION business_assert_effect(text,uuid,integer,integer,text,jsonb),business_lock_authority() TO capability_runtime');
  await admin.query("INSERT INTO agents(id,owner_id,name,slug,role,instructions,is_primary) VALUES($1,$2,'Synthetic','synthetic','Owner assistant','Qualification fixture',true)", [scope.agentId, scope.ownerId]);
  const adapter = { query: async (sql, values) => (await runtime.query(sql, values)).rows,
    atomic: action => transaction(client => action({ query: async (sql, values) => (await client.query(sql, values)).rows })) };
  const principal = { scopeId: scope.ownerId, actorId: scope.ownerId, scopeKind: 'personal' };
  const store = new WorkStore(principal, adapter);
  const routes = new RoutingStore(store);
  const admissionAgentId = scope.agentId;
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
        coordinatingAgentId: admissionAgentId, objective: work.objective,
        criteria: work.criteria.map(item => ({ id: item.id, statement: item.statement, evidence: "deterministic" })),
        resourceRefs: [`repository:${work.repository}`], allowedOperations: ["workspace.read"],
        budgetUsd: 2, deadline: new Date(now + 60_000).toISOString(), policyVersion: 1,
        composition: { role: { id: "software-engineer", version: 1 }, capabilityPacks: [], mode: { id: "normal", version: 1 } },
        routingProfile: profile, routePolicy: { id: "personal-direct", version: 1 },
        definitionOfDone: ["A source-linked result is retained."], allowedRoutes: ["DIRECT"],
      };
      const context = {
        contractVersion: 2, workId: work.id, workVersion: work.version, scope,
        agentId: admissionAgentId, assembledAt: new Date(now).toISOString(),
        maxTokens: 500, estimatedTokens: 50, items: [],
      };
      const facts = {
        currentWorkVersion: work.version, currentCriteriaVersion: work.criteriaVersion,
        currentPolicyVersion: 1, workActive: true, scope, agentId: admissionAgentId,
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


  await check('real routed Work admits once and retains exact capability evidence', async () => {
    const { work, proposal } = await preparedWork('Admit once with capability policy');
    const admission = new RouteAdmissionService(store, authorityFor());
    const attempts = await Promise.allSettled([admission.admit(work.id, request(work, proposal)), admission.admit(work.id, request(work, proposal))]);
    assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1, JSON.stringify(attempts.map(r => r.reason?.message)));
    const rows = (await admin.query('SELECT admission_authority_snapshot FROM engineering_routing_decisions WHERE id=$1', [proposal.id])).rows;
    assert.equal(rows[0].admission_authority_snapshot.capabilityEvidence.capabilityId, 'sofie.native');
    await change('sofie.native', 'disable');
    const blocked = await preparedWork('Denied new routed Work');
    await assert.rejects(admission.admit(blocked.work.id, request(blocked.work, blocked.proposal)), /POLICY_BLOCKED/);
    assert.equal((await admin.query('SELECT count(*) FROM engineering_route_runs WHERE work_id=$1', [blocked.work.id])).rows[0].count, '0');
    assert.equal((await admin.query('SELECT count(*) FROM engineering_route_runs WHERE work_id=$1', [work.id])).rows[0].count, '1');
    await change('sofie.native', 'enable');
  });
  await check('legacy execution cannot bypass capability disable', async () => {
    const { work } = await preparedWork('Denied legacy Work');
    await change('development-tools', 'disable');
    await assert.rejects(new ExecutionStore(store).admit(work, {
      executor: 'claude-code', coordinatingAgent: scope.agentId, budgetUsd: 0,
    }), /POLICY_BLOCKED/);
    assert.equal((await admin.query('SELECT count(*) FROM engineering_execution WHERE work_id=$1', [work.id])).rows[0].count, '0');
  });
}
