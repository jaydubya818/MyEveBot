// Canonical authorization of the qualified LOCAL V4 MyFactory request through the REAL Work, MissionControl and capability tables.
// Consumers under test are the production ones: requestOwnerFactoryAdmission (MC + Relay proof), issueFactorySourcePermit (via the launcher's
// ownerFactoryCapabilityConfig), FactoryRelayLeaseClient and FactoryCapabilityClient. Only external HTTP responses (MissionControl, Relay, the
// loopback Factory) are synthetic and signed. No paid call, no custody, no deployment.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { capabilityRegistry } from '@mission-control/capability-control';
import { Env, connection, files } from '../external-alpha/work-test-fixture.ts';
import { alphaTasksTupleSha256 } from '../external-alpha/work-tuple.ts';
import { permitFixture } from './permit-test-fixture.ts';
import { permitDigest } from './execution-permit.ts';
import { capabilityPairDigest } from './installed-client.ts';
import { relayLeaseEnrollmentDigest } from './relay-lease-client.ts';
import { prepareOwnerFactoryOrigin } from './owner-factory-binding.ts';
import { requestOwnerFactoryAdmission, type MissionControlAdmissionProof } from './admit-execution.ts';
import { WorkStore, type WorkDatabase } from '../engineering/store.ts';
import { digest } from '../engineering/contract.ts';
import { factoryExecutionConfigurationHash } from '../engineering/factory-configuration-hash.ts';
import { prepareAuthenticatedFactoryInput } from '../engineering/factory-authenticated-result.ts';
import { factoryRelayLeaseEnrollmentDigest } from '../engineering/factory-relay-lease-client.ts';
import { FactoryCapabilityClient } from '../engineering/factory-capability-client.ts';
import { ownerFactoryCapabilityConfig } from '../qualification/custody-assembly.ts';
import { admissionActionDigest, parsePolicyMessage, policyMessageHash, signPolicyMessage, verifyPolicyMessage }
  from '../../../../packages/capability-enforcement/src/ordering-wire.ts';

const REPOSITORY_PATH = '/synthetic/qdev/factory-repository';
const BASE = '1'.repeat(40);
const AGENT = 'agt_fixtureagent';
const jwk = (key: ReturnType<typeof generateKeyPairSync>['publicKey' | 'privateKey']) => (key as any).export({ format: 'jwk' }) as JsonWebKey;

describe.skipIf(!connection)('local V4 MyFactory request: canonical Work/MissionControl/capability authorization', () => {
  let env: Env, database: WorkDatabase, role: string, fixture: ReturnType<typeof permitFixture>;
  const mcReceiver = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const factoryReceiver = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const source = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const relay = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const sourceKey = { keyId: 'fixture-source', jwk: jwk(source.privateKey) };
  const relayKey = { keyId: 'fixture-relay', jwk: jwk(relay.privateKey) };

  beforeEach(async () => {
    env = await Env.create();
    role = 'mc_runtime_' + env.name.slice(8);
    database = { ...env.db, atomic: async action => {
      const client = await env.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE ' + role);
        const result = await action({ query: async (sql, values) => (await client.query(sql, values)).rows });
        await client.query('COMMIT'); return result;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    } };
    database.query = async (sql, values) => database.atomic!(async tx => {
      await tx.query("SELECT set_config('myeve.missioncontrol_owner',$1,true)", [env.owner]);
      return tx.query(sql, values);
    });
    const work = await env.seedWork();
    fixture = permitFixture({ ownerId: env.owner, workId: work.id, workVersion: work.version, workGeneration: work.generation,
      tupleSha256: alphaTasksTupleSha256, maxCostMicrousd: 1300000, maxDurationSeconds: 180 });
    const e = fixture.enrollment;
    await env.pool.query('INSERT INTO missioncontrol_owner_enrollments(owner_id,installation_id,revision,document) VALUES($1,$2,$3,$4)', [env.owner, e.installationId, e.revision, e]);
    for (const name of ['migration', 'enforcement', 'decisions', 'ordering', 'lifecycle'])
      await env.pool.query(await readFile(new URL('../../../../docs/capability-control/' + name + '.sql', import.meta.url), 'utf8'));
    await env.pool.query(`CREATE ROLE ${role} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
    await env.pool.query(`GRANT USAGE ON SCHEMA public,capability_control TO ${role}`);
    await env.pool.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public,capability_control TO ${role}`);
    await env.pool.query(`GRANT UPDATE ON engineering_work TO ${role}`);
    await env.pool.query(`GRANT INSERT ON missioncontrol_owner_work_origins TO ${role}`);
    await env.pool.query(`GRANT INSERT ON capability_control.policy_decisions TO ${role}`);
    await env.pool.query(`GRANT EXECUTE ON FUNCTION capability_control.lock_admission_policy(text,text,text),missioncontrol_capability_snapshot(text,text,text,text),missioncontrol_enrollment_document(text) TO ${role}`);
    const ids = capabilityRegistry.capabilities.map(item => item.id);
    const facts = Object.fromEntries(capabilityRegistry.capabilities.map(item => [item.id, { supported: true, deployed: true, entitled: true,
      administrator: 'ALLOW', setup: Object.fromEntries(item.setupRequirements.map(key => [key, true])),
      qualification: Object.fromEntries(item.qualificationRequirements.map(key => [key, 'QUALIFIED'])), lifecycle: 'ACTIVE' }]));
    await env.pool.query("INSERT INTO capability_control.installations VALUES($1,'fixture-organization','qualification',true)", [e.installationId]);
    await env.pool.query("INSERT INTO capability_control.platform_owner_bindings VALUES($1,'fixture-organization',$2,'fixture-binding',1,'fixture-auth','fixture-admin','fixture-member','fixture-installation','fixture-audit','ACTIVE',clock_timestamp()+interval '1 hour')", [e.installationId, env.owner]);
    await env.pool.query('INSERT INTO capability_control.owner_state(installation_id,owner_id,preferences) VALUES($1,$2,$3)', [e.installationId, env.owner, Object.fromEntries(ids.map(id => [id, 'ENABLED']))]);
    await env.pool.query("INSERT INTO capability_control.evidence VALUES($1,'fixture-organization',$2,$3,$4,clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour','fixture-evidence')", [e.installationId, env.owner, capabilityRegistry.version, facts]);
    await env.pool.query("INSERT INTO capability_control.relay_agent_evidence VALUES($1,$2,'fixture-organization',$4,1,$3,'ACTIVE',clock_timestamp()+interval '1 hour','fixture-agent-record')", [e.installationId, env.owner, JSON.stringify(ids), AGENT]);
    // Two pinned receivers: MissionControl (enterprise.fleet) and the loopback MyFactory (myfactory). One acknowledged policy revision names both.
    const destinations = [
      { backend_id: 'fixture-mc', incarnation: 'fixture-incarnation', enrollment_version: 1, key_id: 'fixture-mc-key', public_jwk: jwk(mcReceiver.publicKey) },
      { backend_id: 'fixture-factory', incarnation: 'fixture-incarnation', enrollment_version: 1, key_id: 'fixture-factory-key', public_jwk: jwk(factoryReceiver.publicKey) },
    ];
    for (const d of destinations)
      await env.pool.query('INSERT INTO capability_control.policy_destinations VALUES($1,$2,$3,$4,$5,$6,$7)', [e.installationId, env.owner, d.backend_id, d.incarnation, d.enrollment_version, d.key_id, d.public_jwk]);
    await env.pool.query("INSERT INTO capability_control.policy_changes(installation_id,owner_id,revision,policy_id,organization_id,capability_id,operation,destinations,status) VALUES($1,$2,1,'fixture-policy','fixture-organization','enterprise.fleet','enable',$3,'ACKNOWLEDGED')", [e.installationId, env.owner, JSON.stringify(destinations)]);
  }, 60000);
  afterEach(async () => {
    vi.unstubAllGlobals(); vi.unstubAllEnvs();
    await env?.close();
    if (role) { const client = await import('pg').then(pg => new pg.default.Pool({ connectionString: connection }));
      try { await client.query('DROP ROLE IF EXISTS ' + role); } finally { await client.end(); } }
  });

  /** Owner Work origin, the persisted local V4 prepare request, the MC enrollment pins, and the synthetic external services. */
  async function context() {
    const work = await env.store.get(fixture.document.work.id);
    const e = fixture.enrollment;
    const sourceDigest = '1'.repeat(64), configurationDigest = '2'.repeat(64), factoryVersion = digest({ sourceDigest, configurationDigest });
    const config: any = { engineering: { ownerId: env.owner, agentId: AGENT, profile: { repository: work.repository, allowedPaths: files } },
      routing: { intent: 'PRODUCE' }, commands: ['node --test'],
      connection: { origin: 'http://127.0.0.1:41999', token: '3'.repeat(64), factoryId: 'qdev-local-v4', sourceDigest, configurationDigest, factoryVersion,
        repositoryPath: REPOSITORY_PATH, keys: [{ factoryId: 'qdev-local-v4', keyId: 'k', publicKey: 'p', activeFrom: new Date(0).toISOString(), notAfter: new Date(Date.now() + 3600000).toISOString() }],
        qualification: { scopeId: env.owner, profileHash: '', evidenceRef: 'synthetic', qualifiedAt: new Date(Date.now() - 1000).toISOString(),
          expiresAt: new Date(Date.now() + 600000).toISOString(), mode: 'LOCAL_FIXTURE', spendEnforced: true } } };
    config.connection.qualification.profileHash = digest(config.engineering.profile);
    e.revision++; fixture.document.enrollmentRevision++;
    e.factoryVersion = fixture.document.admission.factoryVersion = factoryVersion;
    e.ownerFactoryAdapter = { factoryId: config.connection.factoryId, sourceDigest, configurationDigest,
      configurationHash: factoryExecutionConfigurationHash(config), profileHash: config.connection.qualification.profileHash, repository: work.repository, agentId: AGENT };
    const mcRelay = { schema: 'mc-relay-lease-enrollment/v1', ownerId: env.owner, installationId: e.installationId, connectionId: e.connectionId,
      enrollmentRevision: e.revision, origin: 'https://relay.example.test', activeFrom: Date.now() - 1000, expiresAt: Date.now() + 600000,
      accountId: 'acct_fixtureaccount', agentId: AGENT, runtimeClientId: 'rtc_fixtureruntime', taskId: 'tsk_fixturetask', workloadId: 'wkl_fixtureworkload',
      audience: 'fixture-audience', capability: { name: 'resource.lease.execute', version: '1.0' }, resource: { type: 'target', ids: ['synthetic'] }, parameters: {},
      relayKey: { keyId: 'fixture-relay', jwk: pub(relay) } };
    e.relayLeaseEnrollmentSha256 = relayLeaseEnrollmentDigest(mcRelay);
    await env.pool.query('UPDATE missioncontrol_owner_enrollments SET revision=$2,document=$3 WHERE owner_id=$1', [env.owner, e.revision, e]);
    const workStore = new WorkStore({ scopeId: env.owner, scopeKind: 'personal', actorId: env.owner }, database);
    const origin = await prepareOwnerFactoryOrigin(workStore, work, config, { proposalId: 'owner-proposal', workOrderId: fixture.document.workOrderId,
      expectedWorkOrderRevisionId: fixture.document.workOrderRevisionId, expectedPlanDigest: fixture.document.planDigest });
    fixture.document.work.tupleSha256 = origin.tupleSha256;

    // The persisted local V4 prepare request (what LiveFactoryAdapter would send) under the owner's MYFACTORY routing decision.
    const deadline = new Date(Date.now() + 600000).toISOString();
    const binding = prepareAuthenticatedFactoryInput({ factoryId: config.connection.factoryId, agentId: AGENT, workId: work.id, workVersion: 1, workGeneration: 1, criteriaVersion: 1,
      factoryVersion, sourceDigest, configurationDigest, inputCommit: BASE, requestId: randomUUID(), requestDigest: '3'.repeat(64), workOrderId: randomUUID(), runId: randomUUID(), attemptNumber: 1 });
    const request = { requestId: binding.requestId, workId: work.id, workGeneration: 1, repository: work.repository, deadline, maxSpendUsd: 1.3,
      input: { title: work.title, description: work.objective, kind: 'feature', repositoryPath: REPOSITORY_PATH, baseRef: BASE, acceptanceCriteria: ['c'],
        reproductionCommand: null, expectedFailureText: null, checkCommands: ['node --test'], allowedPaths: files, workerProfile: 'mac' } };
    await env.pool.query(`INSERT INTO engineering_factory_requests(id,scope_id,scope_kind,work_id,actor_id,agent_id,factory_id,operation_id,binding)
      VALUES($1,$2,'personal',$3,$2,$6,$5,$4,$7)`, [randomUUID(), env.owner, work.id, binding.operationId, binding.factoryId, AGENT, binding]);
    await env.pool.query(`INSERT INTO engineering_routing_decisions(id,scope_id,scope_kind,work_id,work_version,selected_route,reason,source,profile,
      eligible_routes,rejected_routes,constraints,provider_id,provider_version,actor_id,admission_authority_snapshot,factory_preparation)
      VALUES($1,$2,'personal',$3,1,'MYFACTORY','synthetic','POLICY','{}','[]','[]','[]',$6,$4,$2,'{}',$5)`,
      [randomUUID(), env.owner, work.id, factoryVersion, { configurationHash: factoryExecutionConfigurationHash(config), request }, binding.factoryId]);

    const runtime = { NODE_ENV: 'test' as const, MYEVE_OWNER_ID: env.owner, MYEVE_MISSIONCONTROL_MODE: 'APPROVED_NONPRODUCTION', MYEVE_MISSIONCONTROL_URL: e.issuer,
      MYEVE_MISSIONCONTROL_AUDIENCE: e.audience, MYEVE_MISSIONCONTROL_CONNECTION_ID: e.connectionId, MYEVE_MISSIONCONTROL_INSTALLATION_ID: e.installationId,
      MYEVE_MISSIONCONTROL_SECRET: 'synthetic-connection-secret-32-characters', MYEVE_CAPABILITY_CONTROL_ENABLED: 'true', MYEVE_CAPABILITY_ENVIRONMENT: 'qualification',
      MYEVE_CAPABILITY_INSTALLATION_ID: e.installationId, MYEVE_MISSIONCONTROL_CAPABILITY_BACKEND_ID: 'fixture-mc', MYEVE_MISSIONCONTROL_CAPABILITY_AGENT_ID: AGENT,
      MYEVE_CAPABILITY_PROPAGATION_JSON: JSON.stringify({ signer: sourceKey }),
      MYEVE_MISSIONCONTROL_RELAY_RUNTIME_CREDENTIAL: 'synthetic-runtime-credential', MYEVE_MISSIONCONTROL_RELAY_WORKLOAD_TOKEN: 'synthetic-workload-token',
      MYEVE_MISSIONCONTROL_RELAY_LEASE_JSON: JSON.stringify(mcRelay) };
    const factoryRelay = { ...mcRelay, schema: 'factory-relay-lease-enrollment/v1', taskId: 'tsk_factorytask', workloadId: 'wkl_factoryworkload' };

    const calls: string[] = [];
    const permits: { myeve?: any; relay?: any } = {};
    const challenges: any[] = [];
    const send: typeof fetch = async (input, init) => {
      const url = String(input), body = JSON.parse(String(init?.body));
      if (url === 'https://relay.example.test/api/v2/runtime/capability-leases/prepare') {
        calls.push('relay-prepare');
        return Response.json({ decision: { decisionId: 'dec_fixturedecision', expiresAt: new Date(Date.now() + 60000).toISOString(), outcome: 'ALLOW', reasonCodes: [], obligations: {}, matchedRuleIds: [] }, approvalRequest: null });
      }
      if (url === 'https://relay.example.test/api/v2/runtime/capability-leases') {
        calls.push('relay');
        const proof = await verifyPolicyMessage(body.remoteAdmission, { keyId: sourceKey.keyId, jwk: jwk(source.publicKey) });
        if (proof.kind !== 'PERMIT') throw Error('expected permit');
        expect(body.action.parameters.capabilityAdmissionDigest).toBe(await policyMessageHash(proof));
        return Response.json({ leaseId: 'lse_fixturelease', token: 'synthetic-token', expiresAt: new Date(proof.expiresAt).toISOString(), maxCalls: 1, onlineRequired: true,
          remotePermit: await signPolicyMessage({ ...proof, authority: 'relay', referenceId: 'lse_fixturelease', version: 2, policyId: 'relay-policy', agentRevision: 7,
            sourcePermitHash: await policyMessageHash(proof) }, relayKey) });
      }
      if (url.startsWith('http://127.0.0.1:41999/api/capability-admission/')) {
        const path = url.slice('http://127.0.0.1:41999/api/capability-admission/'.length);
        calls.push('factory:' + path);
        if (path === 'readback') return new Response(null, { status: 404 });
        const requested = body.request;
        if (path === 'challenge') {
          // A Factory that signs a challenge for WHATEVER request it was handed (including a tampered one): the authority must still refuse.
          const action = await admissionActionDigest({ workId: requested.workId, missionId: fixture.document.missionId, generation: requested.workGeneration,
            nativeSnapshot: { factoryId: config.connection.factoryId, factoryVersion, sourceDigest, configurationDigest, backendId: 'fixture-factory', incarnation: 'fixture-incarnation', enrollmentVersion: 1 },
            args: requested });
          const signed = await signPolicyMessage(parsePolicyMessage({ kind: 'CHALLENGE', authority: 'myeve', ownerId: env.owner, organizationId: 'fixture-organization',
            installationId: e.installationId, backendId: 'fixture-factory', incarnation: 'fixture-incarnation', enrollmentVersion: 1, version: 1, policyId: 'fixture-policy',
            referenceId: randomUUID(), capabilityId: 'myfactory', registryVersion: capabilityRegistry.version, agentId: AGENT, workId: requested.workId,
            missionId: fixture.document.missionId, workGeneration: requested.workGeneration, actionDigest: action, budgetMicros: Math.ceil(requested.maxSpendUsd * 1e6),
            issuedAt: Date.now() - 500, expiresAt: Date.now() + 28000 }), { keyId: 'fixture-factory-key', jwk: jwk(factoryReceiver.privateKey) });
          challenges.push(signed);
          return Response.json(signed);
        }
        // prepare: the loopback Factory verifies both signed permits before it would accept anything.
        const myeve = await verifyPolicyMessage(body.capabilityPermits.myeve, { keyId: sourceKey.keyId, jwk: jwk(source.publicKey) });
        const relayed = await verifyPolicyMessage(body.capabilityPermits.relay, { keyId: relayKey.keyId, jwk: jwk(relay.publicKey) });
        permits.myeve = myeve; permits.relay = relayed;
        return Response.json({ accepted: true, sourcePermitHash: await policyMessageHash(myeve) });
      }
      if (body?.path === 'sofieExecutionPermits:readApproved') {
        calls.push('mc:readApproved');
        const packet = body.args[0], payload = JSON.parse(packet.payloadJson);
        const challenge = parsePolicyMessage({ kind: 'CHALLENGE', authority: 'myeve', ownerId: env.owner, organizationId: 'fixture-organization', installationId: e.installationId,
          backendId: 'fixture-mc', incarnation: 'fixture-incarnation', enrollmentVersion: 1, version: 1, policyId: 'fixture-policy', referenceId: randomUUID(),
          capabilityId: 'enterprise.fleet', registryVersion: capabilityRegistry.version, agentId: AGENT, workId: fixture.document.work.id, missionId: fixture.document.missionId,
          workGeneration: 1, budgetMicros: 1300000, issuedAt: Date.now() - 500, expiresAt: Date.now() + 28000,
          actionDigest: await admissionActionDigest({ workId: fixture.document.work.id, missionId: fixture.document.missionId, generation: 1,
            nativeSnapshot: { permitSha256: permitDigest(fixture.document) }, args: { operation: 'enterprise.authorizeAdmission', permitId: fixture.document.permitId,
              challenge: payload.challenge, commandId: payload.admissionCommandId } }) });
        return Response.json({ status: 'success', value: { permit: fixture.signPermit(),
          capabilityChallenge: await signPolicyMessage(challenge, { keyId: 'fixture-mc-key', jwk: jwk(mcReceiver.privateKey) }) } });
      }
      expect(body.path).toBe('sofieExecutionPermits:authorizeAdmission');
      calls.push('mc:authorize');
      const packet = body.args[0], payload = JSON.parse(packet.payloadJson);
      return Response.json({ status: 'success', value: fixture.signReceipt({ ...fixture.receiptDocument(), commandId: packet.envelope.commandId, challenge: payload.challenge,
        policyPairSha256: capabilityPairDigest(payload.capabilityPermits), issuedAt: Date.now(), expiresAt: Date.now() + 9000 }) });
    };

    const admit = (store = workStore, current = work) => requestOwnerFactoryAdmission(store, current, config, runtime, send);
    const capability = () => ownerFactoryCapabilityConfig({ store: workStore, runtimeConfig: async () => config, clientId: 'qdev-client', backendId: 'fixture-factory',
      missionId: fixture.document.missionId, signer: sourceKey,
      relay: { enrollment: factoryRelay, enrollmentSha256: factoryRelayLeaseEnrollmentDigest(factoryRelay), revision: e.revision,
        credential: 'synthetic-runtime-credential', workloadIdentityToken: 'synthetic-workload-token' }, send });
    const client = async () => new FactoryCapabilityClient(await capability(), send);
    const tamper = (change: (value: any) => void) => { const value = structuredClone(request) as any; change(value); return value; };
    return { work, workStore, config, request, calls, permits, challenges, admit, capability, client, tamper, send, e };
  }
  function pub(pair: ReturnType<typeof generateKeyPairSync>) { const key = jwk(pair.publicKey) as any; return { kty: key.kty, crv: key.crv, x: key.x, y: key.y }; }
  const policyDecisions = (backend: string) => env.pool.query('SELECT count(*)::int AS n FROM capability_control.policy_decisions WHERE backend_id=$1', ['ordered:' + backend]).then((r: any) => r.rows[0].n as number);

  it('issues the local V4 source permit and Relay reference from the real MC proof, then the Factory verifies both for the exact request', async () => {
    const x = await context();
    const proof = await x.admit();
    expect(proof).toMatchObject({ permit: { document: { work: { id: x.work.id } } }, tupleSha256: fixture.document.work.tupleSha256 });
    expect(x.calls).toEqual(['mc:readApproved', 'relay-prepare', 'relay', 'mc:authorize']);
    expect(await policyDecisions('fixture-mc')).toBe(1);
    const prepared = await (await x.client()).prepare(x.request, proof);
    expect(prepared).toMatchObject({ accepted: true });
    expect(x.calls.slice(4)).toEqual(['factory:readback', 'factory:challenge', 'relay-prepare', 'relay', 'factory:prepare']);
    expect(x.permits.myeve).toMatchObject({ kind: 'PERMIT', authority: 'myeve', capabilityId: 'myfactory', backendId: 'fixture-factory', workId: x.work.id,
      missionId: fixture.document.missionId, sourcePermitHash: 'SELF', budgetMicros: 1300000 });
    expect(x.permits.relay).toMatchObject({ kind: 'PERMIT', authority: 'relay', capabilityId: 'myfactory', workId: x.work.id, sourcePermitHash: await policyMessageHash(x.permits.myeve) });
    expect(await policyDecisions('fixture-factory')).toBe(1);
    // Idempotent for a lost response: the same signed challenge returns the same retained permit and writes no second decision.
    const retained = await (await x.capability()).sourcePermit(x.challenges[0], x.request, proof);
    expect(await (await x.capability()).sourcePermit(x.challenges[0], x.request, proof)).toEqual(retained);
    expect(await policyDecisions('fixture-factory')).toBe(1);
  }, 120000);

  it('refuses a different request, base commit, repository path or profile even when the Factory signs a challenge for it', async () => {
    const x = await context();
    const proof = await x.admit();
    const client = await x.client();
    for (const change of [
      (value: any) => { value.input.baseRef = '9'.repeat(40); },
      (value: any) => { value.input.repositoryPath = '/synthetic/qdev/other-repository'; },
      (value: any) => { value.input.workerProfile = 'container'; },
      (value: any) => { value.input.allowedPaths = [...value.input.allowedPaths, 'src/extra.ts']; },
      (value: any) => { value.input.checkCommands = ['true']; },
      (value: any) => { value.maxSpendUsd = 2; },
      (value: any) => { value.requestId = randomUUID(); },
    ]) await expect(client.prepare(x.tamper(change), proof)).rejects.toThrow('FACTORY_SOURCE_PREPARATION');
    expect(x.calls).not.toContain('factory:prepare');
    expect(await policyDecisions('fixture-factory')).toBe(0);
    // A base that matches the persisted request is still the only one authorized.
    await expect(client.prepare(x.request, proof)).resolves.toMatchObject({ accepted: true });
  }, 120000);

  it('refuses a different Work, generation or a changed Work version', async () => {
    const x = await context();
    const proof = await x.admit();
    const client = await x.client();
    await expect(client.prepare(x.tamper(value => { value.workGeneration = 2; }), proof)).rejects.toThrow('FACTORY_SOURCE_PREPARATION');
    await expect(client.prepare(x.tamper(value => { value.workId = randomUUID(); }), proof)).rejects.toThrow('Work was not found');
    expect(await policyDecisions('fixture-factory')).toBe(0);
    // The Work changes after approval: both the canonical MC admission and the Factory source authority refuse (origin/tuple no longer matches).
    await env.pool.query("UPDATE engineering_work SET version=version+1 WHERE id=$1", [x.work.id]);
    await expect(client.prepare(x.request, proof)).rejects.toThrow(/FACTORY_SOURCE_BINDING|FACTORY_SOURCE_PREPARATION/);
    await expect(x.admit(x.workStore, await x.workStore.get(x.work.id))).rejects.toThrow(/MISSIONCONTROL_EXECUTION_WORK_CHANGED|MISSIONCONTROL_OWNER_FACTORY_BINDING_DENIED/);
    expect(await policyDecisions('fixture-factory')).toBe(0);
    expect(x.calls).not.toContain('factory:prepare');
  }, 120000);

  it('refuses a missing, forged, foreign-version or wrong-factory MissionControl proof', async () => {
    const x = await context();
    const proof = await x.admit() as MissionControlAdmissionProof;
    const client = await x.client();
    await expect(client.prepare(x.request, null)).rejects.toThrow('FACTORY_SOURCE_BINDING');
    const forged = structuredClone(proof) as any;
    forged.permit.document.work.version = 99;
    await expect(client.prepare(x.request, forged)).rejects.toThrow('MISSIONCONTROL_PERMIT_DENIED');
    const resigned = structuredClone(proof) as any;
    resigned.permit.signature = Buffer.alloc(64, 1).toString('base64url');
    await expect(client.prepare(x.request, resigned)).rejects.toThrow('MISSIONCONTROL_PERMIT_DENIED');
    const other = structuredClone(proof) as any;
    other.permit.document.admission.factoryVersion = 'f'.repeat(64);
    await expect(client.prepare(x.request, other)).rejects.toThrow('MISSIONCONTROL_PERMIT_DENIED');
    expect(await policyDecisions('fixture-factory')).toBe(0);
    expect(x.calls).not.toContain('factory:prepare');
  }, 120000);

  it('refuses while the MyFactory policy is disabled, paused or revoked, and when the owner has not enabled it', async () => {
    const x = await context();
    const proof = await x.admit() as MissionControlAdmissionProof;
    const client = await x.client();
    await env.pool.query("UPDATE capability_control.owner_state SET controls=jsonb_build_object('myfactory','PAUSE_REQUESTED') WHERE owner_id=$1", [env.owner]);
    await expect(client.prepare(x.request, proof)).rejects.toThrow('CONTROL_PENDING');
    await env.pool.query("UPDATE capability_control.owner_state SET controls=jsonb_build_object('myfactory','REVOKE_REQUESTED') WHERE owner_id=$1", [env.owner]);
    await expect(client.prepare(x.request, proof)).rejects.toThrow('CONTROL_PENDING');
    await env.pool.query("UPDATE capability_control.owner_state SET controls='{}'::jsonb,preferences=jsonb_set(preferences,'{myfactory}','\"DISABLED\"') WHERE owner_id=$1", [env.owner]);
    await expect(client.prepare(x.request, proof)).rejects.toThrow('POLICY_BLOCKED:myfactory');
    expect(await policyDecisions('fixture-factory')).toBe(0);
    expect(x.calls).not.toContain('factory:prepare');
    // A paused MissionControl capability also stops a fresh canonical admission (the proof source), without touching the retained refusal evidence.
    await env.pool.query("UPDATE capability_control.owner_state SET preferences=jsonb_set(preferences,'{myfactory}','\"ENABLED\"'),controls=jsonb_build_object('enterprise.fleet','PAUSE_REQUESTED') WHERE owner_id=$1", [env.owner]);
    await expect(x.admit()).rejects.toThrow('CONTROL_PENDING');
  }, 120000);
});
