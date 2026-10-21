/** Local actual-service composition. Synthetic identities and FakeFactory only. */
import assert from 'node:assert/strict';
import { measureFixturePreparation } from './fixture-timing.mjs';
import { requireLocalPostgres } from './local-database.mjs';
import { finishQualification, bounded } from './cleanup.mjs';
import { fork, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { generateKeyPairSync, createHash, randomUUID, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { FakeFactory } from '../../apps/eve/lib/external-alpha/factory-test-fixture.ts';
import { readExternalAlphaWork } from '../../apps/eve/lib/external-alpha/work-readback.ts';
import { publicKeyId } from '../../apps/eve/lib/external-alpha/work-authority.ts';
import { externalAlphaFactoryAction, createExternalAlphaWorkController } from '../../apps/eve/lib/external-alpha/work-action.ts';
import { externalAlphaFactoryPinSha256 } from '../../apps/eve/lib/external-alpha/work-config.ts';
import { alphaTasksTupleSha256 } from '../../apps/eve/lib/external-alpha/work-tuple.ts';
import { WorkStore } from '../../apps/eve/lib/engineering/store.ts';
import { digest } from '../../apps/eve/lib/engineering/contract.ts';
import { MissionControlBindings } from '../../apps/eve/lib/missioncontrol/permit-store.ts';
import { relayLeaseEnrollmentDigest } from '../../apps/eve/lib/missioncontrol/relay-lease-client.ts';
import { prepareMissionControlExecution } from '../../apps/eve/lib/missioncontrol/prepare-execution.ts';
import { pollMissionControlControls } from '../../apps/eve/lib/missioncontrol/control-runtime.ts';
import { InstalledMissionControlClient, installedMissionControlConfig } from '../../apps/eve/lib/missioncontrol/installed-client.ts';
import { capabilityRegistry } from '@mission-control/capability-control';
import { signPolicyMessage, verifyPolicyMessage, policyMessageHash } from '../../packages/capability-enforcement/src/ordering-wire.ts';
const mcRoot = process.env.COMPOSED_MC_ROOT!, relayRoot = process.env.COMPOSED_RELAY_ROOT!, output = process.env.COMPOSED_REPORT!;
process.env.MYEVE_EXTERNAL_ALPHA_TEST_DATABASE = requireLocalPostgres(process.env.MYEVE_EXTERNAL_ALPHA_TEST_DATABASE);
// The fixture captures its URL at import time; load it after normalization so
// MyEve and the Relay child receive the same validated connection string.
const { Env, files } = await import('../../apps/eve/lib/external-alpha/work-test-fixture.ts');
if (!mcRoot || !relayRoot || !output)
    throw Error('Explicit disposable sources and database required');
const report: any = { scope: 'LOCAL_REAL_CONVEX_POSTGRES_SYNTHETIC_IDENTITIES_FAKEFACTORY', status: 'RUNNING', source: { myeve: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), missioncontrol: execFileSync('git', ['-C', mcRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), relay: execFileSync('git', ['-C', relayRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() }, checks: [], installedAuthentication: 'NOT_RUN', factoryExecution: 'FakeFactory', paidOperations: 0, productionIntegration: 'NOT_RUN', externalAlphaImpact: 'NONE' };
for (const root of [resolve('.'), mcRoot, relayRoot])
    if (execFileSync('git', ['-C', root, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim())
        throw Error('Tracked source changes cannot qualify an exact commit');
report.trackedSourcesClean = true;
report.harnessDigests = Object.fromEntries(await Promise.all(['journey.mts', 'relay-fixture.mts', 'cleanup.mjs', 'local-database.mjs', 'fixture-timing.mjs'].map(async (file) => [file, createHash('sha256').update(await readFile(resolve('scripts/composed-admission', file))).digest('hex')])));
const journeyStartedAt = performance.now();
const nativeFetch = globalThis.fetch;
let env: any, mc: any, child: any, receiverServer: any, role: string | undefined;
let childCompletion: Promise<{
    code: number | null;
    signal: string | null;
}> | undefined;
let rpc: (operation: string, args?: any) => Promise<any>;
const note = (name: string) => { report.checks.push(name); console.log('PASS ' + name); };
try {
    const { startFixtureDatabase } = await import(pathToFileURL(mcRoot + '/scripts/enterprise-compatibility/database.mjs').href);
    mc = await measureFixturePreparation(report, () => startFixtureDatabase(mcRoot, { installedPermits: true }));
    env = await Env.create();
    const work = await env.seedWork();
    const now = Date.now(), hash = 'a'.repeat(64), signing = generateKeyPairSync('ed25519');
    const keyId = createHash('sha256').update(signing.publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
    const enrollment: any = { schema: 'mc-owner-enrollment/v1', environment: 'APPROVED_NONPRODUCTION', installationId: 'composed-installation', revision: 1, ownerId: env.owner, ownerSubject: 'fixture-owner', missionControlOwnerId: 'placeholder', tenantId: 'placeholder', projectId: 'placeholder', connectionId: 'placeholder', issuer: 'https://mc.example.test', audience: 'https://myeve.example.test', clerkIssuer: 'https://fixture.example.test', clerkAudience: 'convex', clerkAuthorizedParty: 'https://mc.example.test', activeFrom: now - 1000, expiresAt: now + 600000, revokedAt: null, factoryVersion: env.policy.factoryVersion, executionContractSha256: hash, capabilityPolicySha256: hash, maxCostMicrousd: 1300000, maxDurationSeconds: 180, permitKeys: [{ keyId, publicKey: signing.publicKey.export({ type: 'spki', format: 'pem' }).toString(), activeFrom: now - 1000, notAfter: now + 600000, revokedAt: null }] };
    const s = await mc.owner.mutation('installedPermitFixture:setup', { seed: mc.seed, enrollment });
    const e = s.enrollment;
    const secret = randomBytes(32).toString('hex');
    mc.setEnvironment('MC_SOFIE_INSTALLED_ORIGINS', JSON.stringify({ environment: 'APPROVED_NONPRODUCTION', issuer: e.issuer, audience: e.audience }));
    mc.setEnvironment('MC_SOFIE_CONNECTION_SECRETS', JSON.stringify({ [s.connectionId]: { keyId: 'fixture-service', secret } }));
    mc.setEnvironment('MC_SOFIE_PERMIT_SIGNING_KEYS', JSON.stringify({ [keyId]: signing.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() }));
    const key = async (keyId: string) => { const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']); return { keyId, jwk: await crypto.subtle.exportKey('jwk', pair.privateKey) }; };
    const source = await key('composed-myeve'), relay = await key('composed-relay'), receiver = await key('composed-mc');
    child = fork(resolve('scripts/composed-admission/relay-fixture.mts'), [], { cwd: relayRoot, execArgv: ['--import', resolve('node_modules/tsx/dist/loader.mjs')], env: { ...process.env, TSX_TSCONFIG_PATH: relayRoot + '/tsconfig.json', RELAY_TEST_DATABASE_URL: process.env.MYEVE_EXTERNAL_ALPHA_TEST_DATABASE }, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    childCompletion = new Promise(accept => child.once('exit', (code: number | null, signal: string | null) => accept({ code, signal })));
    const ready = await new Promise<any>((accept, reject) => { const timer = setTimeout(() => reject(Error('Relay fixture startup timeout')), 30000); child.once('message', (m: any) => { clearTimeout(timer); accept(m.ready); }); child.once('exit', (code: any) => { clearTimeout(timer); reject(Error('Relay fixture startup exit ' + code)); }); });
    let sequence = 0;
    const pending = new Map();
    child.on('message', (m: any) => {
        const p = pending.get(m.id);
        if (p) {
            clearTimeout(p.timer);
            pending.delete(m.id);
            m.error ? p.reject(Error(m.error)) : p.resolve(m.result);
        }
    });
    rpc = (operation, args = {}) => new Promise((accept, reject) => { const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); reject(Error('Relay fixture RPC timeout: ' + operation)); }, 15000); pending.set(id, { resolve: accept, reject, timer }); child.send({ id, operation, ...args }); });
    const identity = { ownerId: e.ownerId, organizationId: ready.accountId, installationId: e.installationId, backendId: 'missioncontrol', incarnation: 'composed-incarnation', enrollmentVersion: 1 };
    const binding = { ...identity, tenantId: s.tenantId, projectId: s.projectId, ownerMemberId: s.memberId, agentId: ready.agentId, registryVersion: capabilityRegistry.version, sourceKeys: { myeve: source, relay }, acknowledgmentKey: receiver };
    for (const [name, value] of Object.entries({ MC_CAPABILITY_ENVIRONMENT: 'qualification', MC_CAPABILITY_INSTALLATION_ID: e.installationId, MC_CAPABILITY_BINDINGS_JSON: JSON.stringify([binding]), MC_CAPABILITY_RECEIVER_RECOVERY_STATE: 'ACTIVE', MC_CAPABILITY_RECEIVER_EPOCH: identity.incarnation }))
        mc.setEnvironment(name, value);
    receiverServer = createServer(async (req, res) => {
        try {
            let body = '';
            for await (const chunk of req)
                body += chunk;
            const { envelope } = JSON.parse(body), value = await verifyPolicyMessage(envelope, JSON.parse(envelope.message).authority === 'myeve' ? source : relay);
            if (value.kind !== 'FENCE')
                throw Error('Fence required');
            const { kind, capabilityId, operation, controls, ...common } = value;
            const acknowledgment = await signPolicyMessage({ ...common, kind: 'FENCE_ACK', fenceHash: await policyMessageHash(value) }, receiver);
            await mc.owner.mutation('capabilityPolicy:receiveFence', { envelope, acknowledgment });
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(acknowledgment));
        }
        catch (error) {
            res.writeHead(500);
            res.end(String(error));
        }
    });
    await new Promise<void>(accept => receiverServer.listen(0, '127.0.0.1', accept));
    await rpc('configure', { config: { signer: relay, destinations: [{ ...identity, accountId: ready.accountId, agentId: ready.agentId, capabilityNames: { 'enterprise.fleet': ready.capabilityName }, endpoint: 'http://127.0.0.1:' + receiverServer.address().port + '/fence', sourceKey: source, backendKey: receiver }] } });
    const ownerFence = (version: number, operation: string) => signPolicyMessage({ ...identity, authority: 'myeve', kind: 'FENCE', version, policyId: 'owner-policy-' + version, capabilityId: 'missioncontrol', operation } as any, source);
    await rpc('fence', { envelope: await ownerFence(1, 'enable') });
    note('Relay authenticated outbox durably acknowledged by actual Convex receiver');
    for (const name of ['migration', 'enforcement', 'decisions', 'ordering', 'lifecycle'])
        await env.pool.query(await readFile(resolve('docs/capability-control/' + name + '.sql'), 'utf8'));
    role = 'mc_composed_' + env.name.slice(8);
    await env.pool.query(`CREATE ROLE ${role} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
    await env.pool.query(`GRANT USAGE ON SCHEMA public,capability_control TO ${role}`);
    await env.pool.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public,capability_control TO ${role}`);
    await env.pool.query(`GRANT UPDATE ON engineering_work,missioncontrol_control_attempts TO ${role}`);
    await env.pool.query(`GRANT INSERT ON missioncontrol_work_bindings,missioncontrol_execution_permits,missioncontrol_admission_receipts,missioncontrol_permit_controls,missioncontrol_factory_readbacks,missioncontrol_control_acknowledgments,missioncontrol_control_attempts,capability_control.policy_decisions TO ${role}`);
    await env.pool.query(`GRANT EXECUTE ON FUNCTION capability_control.lock_admission_policy(text,text,text),missioncontrol_capability_snapshot(text,text,text,text),missioncontrol_enrollment_document(text) TO ${role}`);
    env.db.atomic = async (action: any) => {
        const client = await env.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SET LOCAL ROLE ' + role);
            const result = await action({ query: async (sql: string, values: any) => (await client.query(sql, values)).rows });
            await client.query('COMMIT');
            return result;
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    };
    const ids = capabilityRegistry.capabilities.map(item => item.id), facts = Object.fromEntries(capabilityRegistry.capabilities.map(item => [item.id, { supported: true, deployed: true, entitled: true, administrator: 'ALLOW', setup: Object.fromEntries(item.setupRequirements.map(k => [k, true])), qualification: Object.fromEntries(item.qualificationRequirements.map(k => [k, 'QUALIFIED'])), lifecycle: 'ACTIVE' }]));
    await env.pool.query("INSERT INTO capability_control.installations VALUES($1,$2,'qualification',true)", [e.installationId, ready.accountId]);
    await env.pool.query('INSERT INTO capability_control.owner_state(installation_id,owner_id,preferences) VALUES($1,$2,$3)', [e.installationId, e.ownerId, Object.fromEntries(ids.map(id => [id, 'ENABLED']))]);
    await env.pool.query("INSERT INTO capability_control.evidence VALUES($1,$2,$3,$4,$5,clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour','fixture-evidence')", [e.installationId, ready.accountId, e.ownerId, capabilityRegistry.version, facts]);
    await env.pool.query("INSERT INTO capability_control.relay_agent_evidence VALUES($1,$2,$3,$4,1,$5,'ACTIVE',clock_timestamp()+interval '1 hour','fixture-agent-record')", [e.installationId, e.ownerId, ready.accountId, ready.agentId, JSON.stringify(ids)]);
    const destination = { backend_id: 'missioncontrol', incarnation: identity.incarnation, enrollment_version: 1, key_id: receiver.keyId, public_jwk: receiver.jwk };
    await env.pool.query('INSERT INTO capability_control.policy_destinations VALUES($1,$2,$3,$4,1,$5,$6)', [e.installationId, e.ownerId, identity.backendId, identity.incarnation, receiver.keyId, receiver.jwk]);
    await env.pool.query("INSERT INTO capability_control.policy_changes(installation_id,owner_id,revision,policy_id,organization_id,capability_id,operation,destinations,status) VALUES($1,$2,1,'owner-policy-1',$3,'enterprise.fleet','enable',$4,'ACKNOWLEDGED')", [e.installationId, e.ownerId, ready.accountId, JSON.stringify([destination])]);
    const factory = new FakeFactory({ myeveKeys: new Map([[env.signer.keyId, env.signer.publicKey]]), policy: env.policy, allowedFiles: files, now: Date.now }), config = env.workConfig([{ keyId: publicKeyId(factory.receiptKey.publicKey), publicKey: factory.receiptKey.publicKey.export({ type: 'spki', format: 'pem' }).toString() }]);
    const publicRelay = { kty: relay.jwk.kty, crv: relay.jwk.crv, x: relay.jwk.x, y: relay.jwk.y };
    e.revision = 2;
    const runtime: any = { NODE_ENV: 'test', VERCEL: '1', VERCEL_ENV: 'production', VERCEL_PROJECT_ID: env.policy.projectId, EVE_PROJECT_NAME: 'myeve-alpha-tester-1', MYEVE_OWNER_ID: e.ownerId, MYEVE_EXTERNAL_ALPHA_POLICY: JSON.stringify(env.policy), MYEVE_EXTERNAL_ALPHA_POLICY_SHA256: digest(env.policy), MYEVE_EXTERNAL_ALPHA_AUTHORITY_SIGNING_KEY: env.signer.privateKey?.export?.({ type: 'pkcs8', format: 'pem' }).toString() ?? signing.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), MYEVE_EXTERNAL_ALPHA_WORK_CONFIG: JSON.stringify(config), MYEVE_EXTERNAL_ALPHA_FACTORY_ORIGIN: config.factory.origin, MYEVE_EXTERNAL_ALPHA_FACTORY_PIN_SHA256: externalAlphaFactoryPinSha256(env.policy, config), MYEVE_MISSIONCONTROL_MODE: 'APPROVED_NONPRODUCTION', MYEVE_MISSIONCONTROL_URL: e.issuer, MYEVE_MISSIONCONTROL_AUDIENCE: e.audience, MYEVE_MISSIONCONTROL_CONNECTION_ID: e.connectionId, MYEVE_MISSIONCONTROL_INSTALLATION_ID: e.installationId, MYEVE_MISSIONCONTROL_SECRET: secret, MYEVE_CAPABILITY_CONTROL_ENABLED: 'true', MYEVE_CAPABILITY_ENVIRONMENT: 'qualification', MYEVE_CAPABILITY_INSTALLATION_ID: e.installationId, MYEVE_MISSIONCONTROL_CAPABILITY_BACKEND_ID: identity.backendId, MYEVE_MISSIONCONTROL_CAPABILITY_AGENT_ID: ready.agentId, MYEVE_CAPABILITY_PROPAGATION_JSON: JSON.stringify({ signer: source }), MYEVE_MISSIONCONTROL_RELAY_RUNTIME_CREDENTIAL: ready.credential, MYEVE_MISSIONCONTROL_RELAY_WORKLOAD_TOKEN: ready.workloadToken, MYEVE_MISSIONCONTROL_RELAY_LEASE_JSON: JSON.stringify({ schema: 'mc-relay-lease-enrollment/v1', ownerId: e.ownerId, installationId: e.installationId, connectionId: e.connectionId, enrollmentRevision: e.revision, origin: 'https://relay.example.test', activeFrom: Date.now() - 1000, expiresAt: Date.now() + 300000, accountId: ready.accountId, agentId: ready.agentId, runtimeClientId: ready.runtimeClientId, taskId: ready.taskId, workloadId: ready.workloadId, audience: 'composed-fixture', capability: { name: ready.capabilityName, version: '1.0' }, resource: { type: 'target', ids: ['synthetic'] }, parameters: {}, relayKey: { keyId: relay.keyId, jwk: publicRelay } }) };
    e.relayLeaseEnrollmentSha256 = relayLeaseEnrollmentDigest(JSON.parse(runtime.MYEVE_MISSIONCONTROL_RELAY_LEASE_JSON));
    const { relayLeaseEnrollmentSha256: _myeveMetadata, ...mcEnrollment } = e;
    await mc.owner.mutation('installedPermitFixture:patch', { id: s.connectionId, patch: { installedEnrollment: mcEnrollment } });
    await env.pool.query('INSERT INTO missioncontrol_owner_enrollments(owner_id,installation_id,revision,document) VALUES($1,$2,$3,$4)', [e.ownerId, e.installationId, e.revision, e]);
    const calls: string[] = [];
    globalThis.fetch = (async (url: any, options: any) => {
        const value = String(url);
        if (value.startsWith(e.issuer + '/')) {
            calls.push('MC ' + JSON.parse(options.body).path);
            const response = await nativeFetch('http://127.0.0.1:' + process.env.MC_COMPATIBILITY_PORT + value.slice(e.issuer.length), options);
            const body = await response.clone().json();
            if (body.status !== 'success')
                console.log('MC_DENIAL ' + JSON.stringify({ errorMessage: body.errorMessage, logLines: body.logLines }));
            return response;
        }
        if (value.startsWith('https://relay.example.test/')) {
            calls.push('Relay ' + new URL(value).pathname);
            return nativeFetch(ready.origin + new URL(value).pathname, options);
        }
        if (!new URL(value).hostname.match(/^(127\.0\.0\.1|localhost)$/))
            throw Error('External network forbidden in composed fixture');
        return nativeFetch(url, options);
    }) as typeof fetch;
    const workStore = new WorkStore({ scopeKind: 'personal', scopeId: e.ownerId, actorId: e.ownerId }, env.db), bindings = new MissionControlBindings(env.db, e.ownerId);
    const prepared = await prepareMissionControlExecution(workStore, { operation: 'enterprise.prepare_execution', proposalId: s.proposalId, workOrderId: s.workOrderId, expectedWorkOrderRevisionId: s.workOrderRevisionId, expectedPlanDigest: s.planDigest, idempotencyKey: 'composed-prepare', workId: work.id, expectedWorkVersion: 1, expectedWorkGeneration: 1 }, randomUUID(), runtime);
    assert.equal(prepared.status, 'OWNER_APPROVAL_REQUIRED');
    assert.equal(await env.count('external_alpha_cohort_admission'), 0);
    await assert.rejects(() => mc.other.mutation('sofieExecutionPermitState:approvePrepared', { projectId: s.projectId, requestId: prepared.requestId }));
    const approved = await mc.owner.mutation('sofieExecutionPermitState:approvePrepared', { projectId: s.projectId, requestId: prepared.requestId });
    note('actual MyEve preparation and exact-owner Convex approval; foreign owner denied');
    const input = { operation: 'start', expectedWorkVersion: 1, expectedWorkGeneration: 1 }, effect = { sessionId: randomUUID(), callId: randomUUID() }, dependencies = { database: env.db, factory, signer: env.signer, env: runtime };
    const started = await externalAlphaFactoryAction(workStore, work.id, input, effect, dependencies);
    assert.equal(started.state, 'STARTED');
    assert.equal(factory.posts, 1);
    assert.equal(await env.count('external_alpha_cohort_admission'), 1);
    const bound = await bindings.forWork(work.id);
    assert.equal(bound?.binding.missionId, s.missionId);
    assert.equal(bound?.binding.workOrderId, s.workOrderId);
    const leases = await rpc('leases');
    assert.equal(leases.length, 1);
    assert.equal(leases[0].callCount, 0);
    assert.equal(leases[0].maxCalls, 1);
    assert.equal((await externalAlphaFactoryAction(workStore, work.id, input, effect, dependencies)).state, 'ALREADY_CONSUMED');
    assert.equal(factory.posts, 1);
    note('actual Relay prepare/issue and MC receipt authorize exactly one MyEve admission and offline Factory dispatch');
    await rpc('fence', { envelope: await ownerFence(2, 'disable') });
    const client = new InstalledMissionControlClient(installedMissionControlConfig(e, e.ownerId, runtime));
    await assert.rejects(() => client.readApproved({ id: work.id, version: 1, generation: 1, tupleSha256: alphaTasksTupleSha256 }, { commandId: randomUUID(), admissionCommandId: randomUUID(), challenge: randomBytes(32).toString('hex') }));
    assert.equal((await env.svc.forWork(work.id))?.state, 'CONSUMED');
    assert.equal((await bindings.forWork(work.id))?.binding.missionId, s.missionId);
    assert.equal((await rpc('leases'))[0].status, 'ACTIVE');
    note('propagated disable rejects fresh MC admission while preserving admitted Work and Relay lease');
    await mc.owner.mutation('sofieExecutionPermitState:revoke', { projectId: s.projectId, permitId: approved.document.permitId });
    const controller = createExternalAlphaWorkController(workStore, dependencies);
    if (process.env.COMPOSED_UNKNOWN === '1') {
        factory.ops = [{ id: 'ambiguous-fixture-operation', phase: 'productive', state: 'unknown' }];
        await controller.reconcile(work.id, { work });
        assert.equal((await env.svc.forWork(work.id))?.state, 'UNKNOWN');
        assert.ok((await readExternalAlphaWork(workStore, work))!.accounting.unknownMicrousd > 0);
        note('signed synthetic UNKNOWN exposure persists in canonical accounting');
    }
    const outcome = await pollMissionControlControls(workStore, controller, runtime);
    assert.equal(outcome.failures.length, 0);
    assert.equal(outcome.outcomes[0].authority, 'FENCED');
    const retained = await mc.owner.query('sofieExecutionPermitState:inspect', { projectId: s.projectId, connectionId: s.connectionId });
    assert.equal(retained.permits[0].authority, 'FENCED');
    assert.equal(retained.permits[0].cleanup, outcome.outcomes[0].cleanup);
    if (process.env.COMPOSED_UNKNOWN === '1') {
        assert.equal(outcome.outcomes[0].cleanup, 'PENDING_BACKEND');
        assert.equal(factory.stops.length, 0);
        assert.ok((await readExternalAlphaWork(workStore, work))!.accounting.unknownMicrousd > 0);
        note('revoke fences authority without inventing resource stop or clearing UNKNOWN');
    }
    report.cleanup = outcome.outcomes[0].cleanup;
    note('signed revoke reaches canonical MyEve fence and exact backend acknowledgment preserves truthful cleanup');
    await mc.restart();
    assert.equal((await mc.owner.query('sofieExecutionPermitState:inspect', { projectId: s.projectId, connectionId: s.connectionId })).permits[0].authority, 'FENCED');
    note('Convex restart retains same Mission revocation and acknowledgment');
    const pg = await import('pg');
    await env.pool.end();
    const reconnect = new URL(process.env.MYEVE_EXTERNAL_ALPHA_TEST_DATABASE!);
    reconnect.pathname = '/' + env.name;
    env.pool = new pg.default.Pool({ connectionString: reconnect.toString() });
    assert.equal((await bindings.forWork(work.id))?.binding.missionId, s.missionId);
    if (process.env.COMPOSED_UNKNOWN === '1') {
        assert.ok((await readExternalAlphaWork(workStore, work))!.accounting.unknownMicrousd > 0);
        factory.ops = [{ id: 'ambiguous-fixture-operation', phase: 'productive', state: 'settled', actual: 100000 }];
        factory.state = 'CANCELLED';
        factory.quiescent = true;
        await controller.reconcile(work.id, { work });
        const recovered = await pollMissionControlControls(workStore, controller, runtime);
        assert.equal(recovered.failures.length, 0);
        assert.equal(recovered.outcomes[0].cleanup, 'PENDING_BACKEND');
        assert.ok((await readExternalAlphaWork(workStore, work))!.accounting.unknownMicrousd > 0);
        assert.equal((await env.svc.forWork(work.id))?.state, 'UNKNOWN');
        report.cleanupAfterLateFixtureReadback = 'PENDING_BACKEND';
        report.authoritativeAccountingReconciliation = 'NOT_RUN';
        note('late signed Factory readback cannot erase immutable UNKNOWN exposure after reconnect');
    }
    else
        assert.equal(report.cleanup, 'CONFIRMED');
    note('PostgreSQL reconnect preserves same-Mission bindings and accounting');
    report.identity = { ownerId: e.ownerId, installationId: e.installationId, missionId: s.missionId, workOrderId: s.workOrderId, workId: work.id, permitId: approved.document.permitId, factoryVersion: e.factoryVersion };
    report.calls = calls;
    report.status = 'PASS';
}
catch (error) {
    report.status = 'FAIL';
    report.error = String(error);
    throw error;
}
finally {
    globalThis.fetch = nativeFetch;
    const confirmed = await finishQualification(report, [
        ['relay-process-and-database', async () => {
                if (!child)
                    return;
                try {
                    if (!child.connected || !rpc!)
                        throw Error('Relay cleanup connection unavailable');
                    assert.equal(await rpc('close'), 'CLOSED');
                    const exit = await bounded(childCompletion!, 10000, 'Relay exit');
                    if (exit.code !== 0 || exit.signal)
                        throw Error('Relay cleanup exit unconfirmed');
                }
                catch (error) {
                    if (child.exitCode === null && child.signalCode === null)
                        child.kill('SIGTERM');
                    await bounded(childCompletion!, 10000, 'Relay fallback exit').catch(() => { });
                    throw error; // Even an exited process does not prove its database cleanup.
                }
            }],
        ['receiver-http', async () => { if (receiverServer)
                await new Promise<void>((accept, reject) => receiverServer.close((error: any) => error ? reject(error) : accept())); }],
        ['convex', async () => { await mc?.destroy(); }],
        ['myeve-postgres', async () => { await env?.close(); }],
        ['myeve-runtime-role', async () => {
                if (!role)
                    return;
                const pg = await import('pg'), pool = new pg.default.Pool({ connectionString: process.env.MYEVE_EXTERNAL_ALPHA_TEST_DATABASE });
                try {
                    await pool.query('DROP ROLE IF EXISTS ' + role);
                }
                finally {
                    await pool.end();
                }
            }],
    ]);
    if (!confirmed)
        process.exitCode = 1;
    report.journeyElapsedMs = Math.round(performance.now() - journeyStartedAt);
    await writeFile(output, JSON.stringify(report, null, 2) + '\n');
}
