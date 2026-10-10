import assert from 'node:assert/strict';
import { execFile as execCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import { CapabilityStore } from '../lib/capability-control/store.ts';
import { capabilityConfiguration, capabilityPrincipal, closeCapabilityDatabase } from '../lib/capability-control/runtime.ts';
import { createWebSessionToken } from '../lib/web-auth.ts';
import { capabilityToolOwner } from '../lib/capability-control/sofie.ts';
import { capabilityRegistry } from '@mission-control/capability-control';
import showCapabilities from '../agent/tools/show_capabilities.ts';
import changeCapability from '../agent/tools/change_capability.ts';

const execFile = promisify(execCallback);
const bin = process.env.CAPABILITY_TEST_POSTGRES_BIN ?? '/opt/homebrew/opt/postgresql@17/bin';
const directory = await mkdtemp(join(tmpdir(), 'capability-pg-'));
const socket = join(directory, 'socket'); await mkdir(socket);
const output = resolve('../../docs/capability-control/evidence'); await mkdir(output, { recursive: true });
const port = 55493;
const checks = [];
const check = async (name, action) => { await action(); checks.push(name); console.log(`PASS ${name}`); };
let started = false, admin, runtime;
try {
  await execFile(join(bin, 'initdb'), ['-D', join(directory, 'data'), '-U', 'capability_admin', '--auth-local=trust', '--auth-host=reject', '--no-locale', '-E', 'UTF8']);
  await execFile(join(bin, 'pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-k ${socket} -h '' -p ${port}`, '-w', 'start']); started = true;
  admin = new pg.Pool({ host: socket, port, user: 'capability_admin', database: 'postgres', max: 2 });
  const migration = await readFile('../../docs/capability-control/migration.sql', 'utf8');
  await admin.query('BEGIN'); await admin.query(migration); await admin.query('ROLLBACK');
  await check('migration rollback leaves no schema', async () => assert.equal((await admin.query("SELECT to_regnamespace('capability_control') AS schema")).rows[0].schema, null));
  await admin.query(migration);
  await admin.query('CREATE ROLE capability_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS');
  await admin.query('GRANT USAGE ON SCHEMA capability_control TO capability_runtime');
  await admin.query('GRANT SELECT ON ALL TABLES IN SCHEMA capability_control TO capability_runtime');
  await admin.query('GRANT INSERT,UPDATE ON capability_control.owner_state TO capability_runtime');
  await admin.query('GRANT INSERT ON capability_control.commands,capability_control.audit,capability_control.control_requests TO capability_runtime');
  await admin.query("INSERT INTO capability_control.installations(id,organization_id,environment) VALUES('qualification-1','organization-1','qualification'),('qualification-2','organization-2','qualification')");
  await admin.query(`INSERT INTO capability_control.platform_owner_bindings VALUES
    ('qualification-1','organization-1','synthetic-platform-owner','binding-1',1,'synthetic-auth','synthetic-admin','synthetic-membership','synthetic-installation','synthetic-audit','ACTIVE',clock_timestamp()+interval '1 hour')`);
  runtime = new pg.Pool({ host: socket, port, user: 'capability_runtime', database: 'postgres', max: 12 });
  const installation = { id: 'qualification-1', environment: 'qualification' };
  const owner = new CapabilityStore(runtime, installation, { ownerId: 'synthetic-platform-owner', source: 'settings' });
  const sofie = new CapabilityStore(runtime, installation, { ownerId: 'synthetic-platform-owner', source: 'sofie' });
  const ordinary = new CapabilityStore(runtime, installation, { ownerId: 'synthetic-ordinary-owner', source: 'settings' });
  const command = (revision, capabilityId, operation, extra = {}) => ({ requestId: randomUUID(), expectedRevision: revision, capabilityId, operation, ...extra });
  await check('synthetic platform defaults enable all 36 preferences without execution', async () => {
    const view = await owner.inspect(); assert.equal(view.platformOwner, true); assert.equal(view.capabilities.length, 36);
    assert.ok(view.capabilities.every(item => item.preference === 'ENABLED' && !item.admissionEligible && item.readiness === 'SETUP_REQUIRED'));
  });
  await check('organization reassignment invalidates an existing platform binding', async () => {
    await admin.query("UPDATE capability_control.installations SET organization_id='different-organization' WHERE id='qualification-1'");
    assert.equal((await owner.inspect()).platformOwner, false);
    await admin.query("UPDATE capability_control.installations SET organization_id='organization-1' WHERE id='qualification-1'");
  });
  await check('ordinary owner enterprise default is disabled', async () => assert.equal((await ordinary.inspect()).capabilities.find(item => item.id === 'missioncontrol').preference, 'DISABLED'));
  const disable = command(1, 'missioncontrol', 'disable');
  await check('16 concurrent duplicate commands commit one change and one audit event', async () => {
    const receipts = await Promise.all(Array.from({ length: 16 }, () => owner.command(disable)));
    assert.ok(receipts.every(item => item.revision === 2));
    assert.equal((await owner.inspect()).audit.length, 1);
  });
  await check('changed payload and stale revision fail with conflict', async () => {
    await assert.rejects(owner.command({ ...disable, operation: 'enable' }), /already used/);
    await assert.rejects(owner.command(command(1, 'memory', 'disable')), /another session/);
  });
  await check('Settings and Sofie share state; MissionControl changes preserve MyFactory and Native', async () => {
    const view = await sofie.inspect();
    assert.equal(view.capabilities.find(item => item.id === 'missioncontrol').preference, 'DISABLED');
    for (const id of ['myfactory', 'sofie.native']) assert.equal(view.capabilities.find(item => item.id === id).preference, 'ENABLED');
    await sofie.command(command(2, 'missioncontrol', 'enable'));
    assert.equal((await owner.inspect()).capabilities.find(item => item.id === 'missioncontrol').preference, 'ENABLED');
    assert.equal((await owner.inspect()).audit[0].source, 'sofie');
  });
  await check('owner and installation isolate identical request IDs', async () => {
    assert.equal((await ordinary.inspect()).audit.length, 0);
    await ordinary.command(disable);
    assert.equal((await ordinary.inspect()).revision, 2);
    const other = new CapabilityStore(runtime, { ...installation, id: 'qualification-2' }, { ownerId: 'synthetic-platform-owner', source: 'settings' });
    assert.equal((await other.inspect()).platformOwner, false); assert.equal((await other.inspect()).audit.length, 0);
    await other.command(disable); assert.equal((await other.inspect()).revision, 2);
  });
  await check('concurrent distinct commands at one revision have one winner', async () => {
    const results = await Promise.allSettled([owner.command(command(3, 'memory', 'disable')), owner.command(command(3, 'files', 'disable'))]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal((await owner.inspect()).revision, 4);
  });
  await check('budget changes persist without spending or grants', async () => {
    await owner.command(command(4, 'myfactory', 'set_budget', { limitMicros: 500000 }));
    const capability = (await owner.inspect()).capabilities.find(item => item.id === 'myfactory');
    assert.equal(capability.limitMicros, 500000); assert.equal(capability.admissionEligible, false);
  });
  await check('pause and revoke stay pending and cannot be cleared by enable', async () => {
    assert.equal((await owner.command(command(5, 'missioncontrol', 'pause'))).status, 'PENDING_BACKEND');
    assert.equal((await owner.command(command(6, 'missioncontrol', 'revoke'))).status, 'PENDING_BACKEND');
    await assert.rejects(owner.command(command(7, 'missioncontrol', 'enable')), /reconciled/);
    await assert.rejects(owner.command(command(7, 'missioncontrol', 'pause')), /revocation/);
    assert.equal((await owner.inspect()).capabilities.find(item => item.id === 'missioncontrol').control, 'REVOKE_REQUESTED');
    assert.equal((await admin.query("SELECT count(*) AS n FROM capability_control.control_requests WHERE owner_id='synthetic-platform-owner' AND status='PENDING_BACKEND'")).rows[0].n, '2');
  });
  await check('application role cannot forge platform bindings or policy evidence', async () => {
    for (const table of ['platform_owner_bindings', 'evidence', 'installations']) await assert.rejects(runtime.query(`DELETE FROM capability_control.${table}`), /permission denied/);
    await assert.rejects(new CapabilityStore(admin, installation, { ownerId: 'synthetic-platform-owner', source: 'settings' }).inspect(), /restricted runtime/);
  });
  await check('database RLS denies unscoped reads and cross-owner writes', async () => {
    assert.equal((await runtime.query('SELECT * FROM capability_control.owner_state')).rows.length, 0);
    const c = await runtime.connect();
    try {
      await c.query('BEGIN'); await c.query("SELECT set_config('myeve.capability_owner','synthetic-platform-owner',true),set_config('myeve.capability_installation','qualification-1',true)");
      await assert.rejects(c.query("INSERT INTO capability_control.owner_state(installation_id,owner_id) VALUES('qualification-1','forged-owner')"), /row-level security/);
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });
  await check('audit and idempotency history are immutable even to administrative DML', async () => {
    await assert.rejects(admin.query("UPDATE capability_control.audit SET operation='enable'"), /immutable/);
    await assert.rejects(admin.query('DELETE FROM capability_control.commands'), /immutable/);
  });
  await check('expired and revoked bindings remove platform defaults', async () => {
    await admin.query("UPDATE capability_control.platform_owner_bindings SET status='REVOKED'");
    assert.equal((await owner.inspect()).platformOwner, false);
    await admin.query("UPDATE capability_control.platform_owner_bindings SET status='ACTIVE',expires_at=clock_timestamp()-interval '1 second'");
    assert.equal((await owner.inspect()).platformOwner, false);
  });
  await check('Relay administrator denial and expired evidence remain unavailable', async () => {
    const facts = Object.fromEntries(capabilityRegistry.capabilities.map(item => [item.id, {
      supported: true, deployed: true, entitled: true, administrator: 'DENY', lifecycle: 'ACTIVE',
      setup: {}, qualification: {},
    }]));
    await admin.query("INSERT INTO capability_control.evidence VALUES('qualification-1','organization-1','synthetic-platform-owner','1',$1,clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour','synthetic-relay-policy')", [facts]);
    let view = await owner.inspect(); assert.equal(view.evidenceStatus, 'CURRENT'); assert.ok(view.capabilities.every(item => item.administrator === 'DENY' && !item.admissionEligible));
    await admin.query("UPDATE capability_control.evidence SET organization_id='different-organization'");
    assert.equal((await owner.inspect()).evidenceStatus, 'UNAVAILABLE');
    await admin.query("UPDATE capability_control.evidence SET organization_id='organization-1',expires_at=clock_timestamp()-interval '1 second'");
    view = await owner.inspect(); assert.equal(view.evidenceStatus, 'UNAVAILABLE'); assert.ok(view.capabilities.every(item => !item.admissionEligible));
  });
  await check('preferences and audit survive new pool connections', async () => {
    const pool = new pg.Pool({ host: socket, port, user: 'capability_runtime', database: 'postgres', max: 1 });
    try { const view = await new CapabilityStore(pool, installation, { ownerId: 'synthetic-platform-owner', source: 'settings' }).inspect(); assert.equal(view.revision, 7); assert.equal(view.audit.length, 6); }
    finally { await pool.end(); }
  });
  process.env.MYEVE_CAPABILITY_CONTROL_ENABLED = 'true';
  process.env.MYEVE_CAPABILITY_ORIGIN = 'http://localhost';
  process.env.MYEVE_CAPABILITY_INSTALLATION_ID = 'qualification-1';
  process.env.MYEVE_CAPABILITY_ENVIRONMENT = 'qualification';
  process.env.MYEVE_CAPABILITY_DATABASE_URL = `postgresql://capability_runtime@localhost/postgres?host=${encodeURIComponent(socket)}&port=${port}`;
  process.env.MYEVE_OWNER_ID = 'synthetic-platform-owner';
  process.env.MYEVE_ACCESS_PASSWORD = 'synthetic-qualification-password';
  process.env.MYEVE_SESSION_SECRET = 'synthetic-qualification-session-secret-000000';
  const token = createWebSessionToken();
  await check('HTTP identity requires a valid signature on localhost and enforces origin', async () => {
    await assert.rejects(capabilityPrincipal(new Request('http://localhost/api/capability-control')), /Sign in/);
    assert.equal(await capabilityPrincipal(new Request('http://localhost/api/capability-control', { headers: { cookie: `myeve_session=${token}` } })), 'synthetic-platform-owner');
    await assert.rejects(capabilityPrincipal(new Request('http://localhost/api/capability-control', { method: 'POST', headers: { cookie: `myeve_session=${token}`, origin: 'https://attacker.invalid' } })), /same-origin/);
  });
  await check('production and unconfigured environments fail closed', async () => {
    assert.throws(() => capabilityConfiguration({ ...process.env, VERCEL: '1' }), /isolated/);
    assert.throws(() => capabilityConfiguration({ ...process.env, MYEVE_CAPABILITY_ENVIRONMENT: 'production' }), /configured/);
    assert.throws(() => capabilityConfiguration({}), /isolated/);
  });
  await check('Sofie rejects guests, subagents, role-pack agents, and unknown owners', async () => {
    const session = { auth: { current: { principalId: 'synthetic-platform-owner', principalType: 'user', authenticator: 'myeve-web-session', issuer: 'myeve', attributes: { owner: 'true', myeveCapabilityOwner: 'signed-session' } } } };
    assert.equal(capabilityToolOwner({ session }), 'synthetic-platform-owner');
    for (const modified of [{ ...session, parent: {} }, { auth: { current: { ...session.auth.current, attributes: { owner: 'true', role: 'guest' } } } },
      { auth: { current: { ...session.auth.current, attributes: { owner: 'true', myeveRoleId: 'researcher' } } } },
      { auth: { current: { ...session.auth.current, principalId: 'unknown-owner' } } }]) assert.throws(() => capabilityToolOwner({ session: modified }), /direct authenticated/);
  });
  await check('real channel distinguishes signed owner sessions from local fallback and forged headers', async () => {
    const { ownerSession } = await import('../agent/channels/eve.ts');
    const authenticate = ownerSession();
    const unsigned = await authenticate(new Request('http://localhost/eve/v1/session', { method:'POST', headers:{origin:'http://localhost', 'x-myeve-capability-owner':'signed-session'} }));
    assert.equal(unsigned.attributes.myeveCapabilityOwner, undefined);
    assert.throws(()=>capabilityToolOwner({session:{auth:{current:unsigned}}}), /direct authenticated/);
    const signed = await authenticate(new Request('http://localhost/eve/v1/session', { method:'POST', headers:{origin:'http://localhost',cookie:`myeve_session=${token}`} }));
    assert.equal(capabilityToolOwner({session:{auth:{current:signed}}}), 'synthetic-platform-owner');
    const crossSite = await authenticate(new Request('http://localhost/eve/v1/session', { method:'POST', headers:{origin:'https://attacker.invalid',cookie:`myeve_session=${token}`} }));
    assert.equal(crossSite.attributes.myeveCapabilityOwner, undefined);
  });
  await check('registered Sofie handlers share durable state and always require mutation approval', async () => {
    const ctx = { session: { auth: { current: { principalId: 'synthetic-platform-owner', principalType: 'user', authenticator: 'myeve-web-session', issuer: 'myeve', attributes: { owner: 'true', myeveCapabilityOwner: 'signed-session' } } } } };
    assert.equal(await changeCapability.approval({}), 'user-approval');
    assert.equal(showCapabilities.availableInSubagents, false); assert.equal(changeCapability.availableInSubagents, false);
    const before = await showCapabilities.execute({}, ctx);
    const receipt = await changeCapability.execute(command(before.revision, 'myskills', 'disable'), ctx);
    assert.equal(receipt.status, 'SAVED');
    const after = await owner.inspect(); assert.equal(after.revision, before.revision+1);
    assert.equal(after.capabilities.find(item=>item.id === 'myskills').preference, 'DISABLED');
    assert.equal(after.audit[0].source, 'sofie');
  });
  const lock = JSON.parse(await readFile('../../packages/capability-control/source-lock.json', 'utf8'));
  await check('preserved MissionControl package matches every pinned file hash', async () => {
    for (const [file, expected] of Object.entries(lock.files)) assert.equal(createHash('sha256').update(await readFile(`../../packages/capability-control/${file}`)).digest('hex'), expected);
  });
  const { qualifyEnforcement } = await import('./qualify-capability-enforcement.mjs');
  await qualifyEnforcement({ admin, runtime, check });
  await writeFile(join(output, 'postgres.json'), JSON.stringify({ passed: checks.length, checks, realOwnerBinding: 'NOT_QUALIFIED', paidOperations: 0, productionIntegration: 'NOT_RUN' }, null, 2)+'\n');
  if (process.argv.includes('--browser')) {
    const { qualifyBrowser } = await import('./qualify-capability-browser.mjs');
    process.env.MYEVE_OWNER_ID = 'synthetic-browser-owner';
    await admin.query("INSERT INTO capability_control.platform_owner_bindings VALUES ('qualification-1','organization-1','synthetic-browser-owner','binding-browser',1,'synthetic-auth','synthetic-admin','synthetic-membership','synthetic-installation','synthetic-audit','ACTIVE',clock_timestamp()+interval '1 hour')");
    await qualifyBrowser({ token: createWebSessionToken(), output });
  }
} finally {
  await closeCapabilityDatabase();
  if (runtime) await runtime.end(); if (admin) await admin.end();
  if (started) await execFile(join(bin, 'pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop']);
  await rm(directory, { recursive: true, force: true });
}
