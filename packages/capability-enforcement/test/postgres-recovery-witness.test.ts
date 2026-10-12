import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID,generateKeyPairSync } from 'node:crypto';
import {capabilityConfiguration} from '../../../apps/eve/lib/capability-control/runtime.ts';
import {externalAlphaLimits} from '../../../apps/eve/lib/external-alpha/policy.ts';
import {digest} from '../../../apps/eve/lib/engineering/contract.ts';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { CapabilityStore } from '../../../apps/eve/lib/capability-control/store.ts';
import { advanceRecoveryWitness, assertRecoveryHead, closeRecoveryWitnessDatabases, configuredRecoveryWitness, initializeRecoveryWitness, recoveryHead } from '../src/recovery-witness.ts';
import type { PostgresRecoveryWitness } from '../src/postgres-recovery-witness.ts';

const endpoint = new URL(process.env.CAPABILITY_WITNESS_TEST_DATABASE_URL ?? 'postgresql://127.0.0.1:55855/postgres');
if (endpoint.hostname !== '127.0.0.1' || endpoint.pathname !== '/postgres' || endpoint.password || Number(endpoint.port) < 1024) throw Error('Disposable loopback PostgreSQL required');
const suffix = randomUUID().replaceAll('-', '').slice(0, 12), appName = `witness_app_${suffix}`, witnessName = `witness_store_${suffix}`, restoreName = `witness_restore_${suffix}`;
const appRole = `witness_app_role_${suffix}`, witnessRole = `witness_role_${suffix}`;
const url = (database: string, role?: string) => { const value = new URL(endpoint); value.pathname = '/' + database; if (role) value.username = role; return value.toString(); };
const admin = new pg.Pool({ connectionString: endpoint.toString() });
let app: pg.Pool, witnessAdmin: pg.Pool, runtime: pg.Pool, restored: pg.Pool | undefined, temporary: string;
const scope = { organizationId: 'organization', installationId: 'isolated', ownerId: 'owner' };
const witness: PostgresRecoveryWitness = { kind: 'postgres', databaseUrl: url(witnessName, witnessRole), epoch: 'qualification-epoch', enrollmentId: 'isolated-enrollment', qualificationDigest: 'a'.repeat(64), installationDigest: 'b'.repeat(64) };
const bin = process.env.CAPABILITY_TEST_POSTGRES_BIN ?? '/opt/homebrew/opt/postgresql@17/bin';
const run = promisify(execFile);
const store = () => new CapabilityStore(runtime, { id: scope.installationId, environment: 'qualification' }, { ownerId: scope.ownerId, source: 'settings' }, undefined, witness);
const command = (revision: number) => ({ requestId: randomUUID(), expectedRevision: revision, capabilityId: 'missioncontrol', operation: 'revoke' });
before(async () => {
  temporary = await mkdtemp(join(tmpdir(), 'witness-qualified-'));
  await admin.query(`CREATE DATABASE ${appName}`); await admin.query(`CREATE DATABASE ${witnessName}`);
  await admin.query(`CREATE ROLE ${appRole} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
  await admin.query(`CREATE ROLE ${witnessRole} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
  app = new pg.Pool({ connectionString: url(appName) }); witnessAdmin = new pg.Pool({ connectionString: url(witnessName) });
  for (const file of ['migration.sql', 'enforcement.sql', 'decisions.sql', 'ordering.sql', 'lifecycle.sql'])
    await app.query(await readFile(new URL(`../../../docs/capability-control/${file}`, import.meta.url), 'utf8'));
  await app.query(`GRANT USAGE ON SCHEMA capability_control TO ${appRole}`);
  await app.query(`GRANT SELECT ON ALL TABLES IN SCHEMA capability_control TO ${appRole}`);
  await app.query(`GRANT INSERT,UPDATE ON capability_control.owner_state,capability_control.policy_changes,capability_control.policy_deliveries TO ${appRole}`);
  await app.query(`GRANT INSERT ON capability_control.commands,capability_control.audit,capability_control.control_requests TO ${appRole}`);
  await app.query(`GRANT EXECUTE ON FUNCTION capability_control.lock_admission_policy(text,text,text) TO ${appRole}`);
  await app.query("INSERT INTO capability_control.installations VALUES('isolated','organization','qualification',true)");
  await app.query("INSERT INTO capability_control.owner_state(installation_id,owner_id) VALUES('isolated','owner')");
  await app.query("INSERT INTO capability_control.recovery_enrollments VALUES('isolated','owner',$1)", [witness.epoch]);
  await witnessAdmin.query(await readFile(new URL('../../../docs/capability-control/independent-witness.sql', import.meta.url), 'utf8'));
  await witnessAdmin.query(`GRANT USAGE ON SCHEMA capability_witness TO ${witnessRole}`);
  await witnessAdmin.query(`GRANT EXECUTE ON FUNCTION capability_witness.read_head(text,text,text,text,text,text,text),capability_witness.advance_head(text,text,text,text,text,text,text,bigint,text,bigint,text) TO ${witnessRole}`);
  const head = await recoveryHead(app, scope, witness);
  // Privileged fixture enrollment is deliberately outside all runtime code.
  await witnessAdmin.query("INSERT INTO capability_witness.enrollments VALUES($1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp()+interval '1 hour')", [witness.enrollmentId, scope.organizationId, scope.installationId, scope.ownerId, witness.epoch, witnessRole, witness.qualificationDigest, witness.installationDigest]);
  await witnessAdmin.query('INSERT INTO capability_witness.heads VALUES($1,$2,$3,$4,$5,$6)', [witness.enrollmentId, scope.organizationId, scope.installationId, scope.ownerId, head.revision, head.digest]);
  runtime = new pg.Pool({ connectionString: url(appName, appRole) });
});
after(async () => {
  await closeRecoveryWitnessDatabases(); await runtime?.end(); await restored?.end(); await app?.end(); await witnessAdmin?.end();
  for (const name of [restoreName, appName, witnessName]) await admin.query(`DROP DATABASE IF EXISTS ${name}`);
  await admin.query(`DROP ROLE IF EXISTS ${appRole}`); await admin.query(`DROP ROLE IF EXISTS ${witnessRole}`); await admin.end();
  if (temporary) await rm(temporary, { recursive: true });
});

test('configuration requires independent database, immutable enrollment evidence and authenticated TLS outside loopback', () => {
  const env = { MYEVE_CAPABILITY_DATABASE_URL: url(appName), MYEVE_CAPABILITY_RECOVERY_EPOCH: witness.epoch,
    MYEVE_CAPABILITY_RECOVERY_WITNESS_DATABASE_URL: witness.databaseUrl, MYEVE_CAPABILITY_RECOVERY_WITNESS_ENROLLMENT_ID: witness.enrollmentId,
    MYEVE_CAPABILITY_RECOVERY_WITNESS_QUALIFICATION_DIGEST: witness.qualificationDigest, MYEVE_CAPABILITY_RECOVERY_WITNESS_INSTALLATION_DIGEST: witness.installationDigest };
  assert.deepEqual(configuredRecoveryWitness(env), witness);
  for (const patch of [{ MYEVE_CAPABILITY_RECOVERY_WITNESS_DATABASE_URL: url(appName, witnessRole) }, { MYEVE_CAPABILITY_RECOVERY_WITNESS_QUALIFICATION_DIGEST: '' }, { MYEVE_CAPABILITY_RECOVERY_WITNESS_DIRECTORY: '/tmp' }, { MYEVE_CAPABILITY_RECOVERY_WITNESS_DATABASE_URL: 'postgresql://witness.example/test' }, { MYEVE_CAPABILITY_RECOVERY_WITNESS_DATABASE_URL: witness.databaseUrl + '?host=other' }])
    assert.throws(() => configuredRecoveryWitness({ ...env, ...patch }), /CONFIGURATION/);
});

test('independent witness requires exact owner, installation, organization, epoch and qualified enrollment', async () => {
  const head = await recoveryHead(app, scope, witness);
  await assertRecoveryHead(witness, head);
  for (const patch of [{ ownerId: 'other' }, { installationId: 'other' }, { organizationId: 'other' }, { epoch: 'old' }])
    await assert.rejects(assertRecoveryHead(witness, { ...head, ...patch }), /UNAVAILABLE|QUARANTINED/);
  await assert.rejects(assertRecoveryHead({ ...witness, qualificationDigest: 'b'.repeat(64) }, head), /UNAVAILABLE/);
  await assert.rejects(initializeRecoveryWitness(witness, head), /PRIVILEGED_ENROLLMENT_REQUIRED/);
});

test('restricted runtime cannot seed, reset, truncate, rewrite or bypass its witness enrollment', async () => {
  const client = new pg.Pool({ connectionString: witness.databaseUrl });
  try {
    for (const sql of ["UPDATE capability_witness.heads SET revision=1", 'DELETE FROM capability_witness.heads', 'TRUNCATE capability_witness.heads', "INSERT INTO capability_witness.enrollments VALUES('x','x','x','x','x',current_user,repeat('a',64),repeat('b',64),now())", "UPDATE capability_witness.enrollments SET epoch='reset'"])
      await assert.rejects(client.query(sql), /permission denied/);
    await assert.rejects(witnessAdmin.query("UPDATE capability_witness.enrollments SET epoch='reset'"), /ENROLLMENT_IMMUTABLE/);
    await assert.rejects(witnessAdmin.query('TRUNCATE capability_witness.heads'), /ENROLLMENT_IMMUTABLE/);
    const head = await recoveryHead(app, scope, witness);
    await assert.rejects(assertRecoveryHead({ ...witness, databaseUrl: url(witnessName) }, head), /UNAVAILABLE/); // overprivileged role fails closed
  } finally { await client.end(); }
});

test('revocation survives controller restart and actual application restore with an old in-memory head', async () => {
  const oldHead = await recoveryHead(app, scope, witness);
  const dump = temporary + '/before-revoke.sql';
  await run(bin + '/pg_dump', ['--dbname', url(appName), '--schema=capability_control', '--no-owner', '-f', dump]);
  assert.equal((await store().command(command(1))).revision, 2);
  await closeRecoveryWitnessDatabases();
  assert.equal((await store().inspect()).revision, 2);
  await assert.rejects(assertRecoveryHead(witness, oldHead), /QUARANTINED/);
  await admin.query(`CREATE DATABASE ${restoreName}`);
  await run(bin + '/psql', ['--dbname', url(restoreName), '-v', 'ON_ERROR_STOP=1', '-f', dump]);
  restored = new pg.Pool({ connectionString: url(restoreName, appRole) });
  const stale = new CapabilityStore(restored, store().installation, store().actor, undefined, witness);
  await assert.rejects(stale.inspect(), /QUARANTINED/);
  await assert.rejects(stale.command(command(1)), /QUARANTINED/);
  assert.equal((await store().inspect()).capabilities.find(item => item.id === 'missioncontrol')?.control, 'REVOKE_REQUESTED');
});

test('crash after witness CAS and before app commit quarantines rather than resetting authority', async () => {
  const interrupted = new CapabilityStore({ connect: async () => {
    const connection = await runtime.connect();
    return { release: () => connection.release(), query: async (sql: string, values?: unknown[]) => {
      if (sql === 'COMMIT') throw Error('SYNTHETIC_COMMIT_INTERRUPTION');
      return connection.query(sql, values);
    } };
  } }, store().installation, store().actor, undefined, witness);
  await assert.rejects(interrupted.command(command(2)), /COMMIT_INTERRUPTION/);
  assert.equal((await app.query("SELECT revision FROM capability_control.owner_state WHERE owner_id='owner'")).rows[0].revision, 2);
  await assert.rejects(store().inspect(), /QUARANTINED/);
});

test('CAS has exactly one concurrent winner and never accepts rollback or a conflicting retry', async () => {
  const current = (await witnessAdmin.query('SELECT revision,digest FROM capability_witness.heads')).rows[0];
  const before = { schema: 'capability-control.recovery-head.v1' as const, ...scope, epoch: witness.epoch, revision: Number(current.revision), digest: current.digest };
  const first = { ...before, revision: before.revision + 1, digest: 'c'.repeat(64) };
  const second = { ...first, digest: 'd'.repeat(64) };
  const results = await Promise.allSettled([advanceRecoveryWitness(witness, before, first), advanceRecoveryWitness(witness, before, second)]);
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  await assert.rejects(advanceRecoveryWitness(witness, first, before), /NON_MONOTONIC/);
  await assert.rejects(advanceRecoveryWitness(witness, before, second), /QUARANTINED/);
  const saved = (await witnessAdmin.query('SELECT revision,digest FROM capability_witness.heads')).rows[0];
  const exact = { ...before, revision: Number(saved.revision), digest: saved.digest };
  await advanceRecoveryWitness(witness, exact, exact); // read-only exact retry, never reinitialization
});

test('expired enrollment and missing independent store never fall back to an old local head', async () => {
  const expired = { schema: 'capability-control.recovery-head.v1' as const, ...scope, ownerId: 'expired-owner', epoch: witness.epoch, revision: 1, digest: 'e'.repeat(64) };
  await witnessAdmin.query("INSERT INTO capability_witness.enrollments VALUES($1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp()-interval '1 second')", [witness.enrollmentId, scope.organizationId, scope.installationId, expired.ownerId, witness.epoch, witnessRole, witness.qualificationDigest, witness.installationDigest]);
  await witnessAdmin.query('INSERT INTO capability_witness.heads VALUES($1,$2,$3,$4,$5,$6)', [witness.enrollmentId, scope.organizationId, scope.installationId, expired.ownerId, expired.revision, expired.digest]);
  await assert.rejects(assertRecoveryHead(witness, expired), /UNAVAILABLE/);
  await assert.rejects(assertRecoveryHead({ ...witness, databaseUrl: url('witness_missing_' + suffix, witnessRole) }, expired), /UNAVAILABLE/);
});

test('NOINHERIT membership cannot hide an alternate role able to rewrite the witness', async () => {
  const inheritedRole = 'witness_writer_' + suffix;
  await admin.query(`CREATE ROLE ${inheritedRole} NOLOGIN`);
  try {
    await witnessAdmin.query(`GRANT UPDATE ON capability_witness.heads TO ${inheritedRole}`);
    await admin.query(`GRANT ${inheritedRole} TO ${witnessRole}`);
    const head = await recoveryHead(app, scope, witness);
    await assert.rejects(assertRecoveryHead(witness, head), /UNAVAILABLE/);
  } finally {
    await admin.query(`REVOKE ${inheritedRole} FROM ${witnessRole}`);
    await witnessAdmin.query(`DROP OWNED BY ${inheritedRole}`);
    await admin.query(`DROP ROLE ${inheritedRole}`);
  }
});


test('restricted runtime rejects predefined server roles and replication privileges', async () => {
  const head = await recoveryHead(app, scope, witness);
  for (const privilegedRole of ['pg_execute_server_program', 'pg_write_server_files', 'pg_read_server_files']) {
    await admin.query(`GRANT ${privilegedRole} TO ${witnessRole}`);
    try {
      // No server program or file operation is attempted: membership itself denies custody.
      await assert.rejects(assertRecoveryHead(witness, head), /UNAVAILABLE/);
    } finally { await admin.query(`REVOKE ${privilegedRole} FROM ${witnessRole}`); }
  }
  await admin.query(`ALTER ROLE ${witnessRole} REPLICATION`);
  try { await assert.rejects(assertRecoveryHead(witness, head), /UNAVAILABLE/); }
  finally { await admin.query(`ALTER ROLE ${witnessRole} NOREPLICATION`); }
});

test('CAS requires a durable commit even when the restricted login defaults to asynchronous commit', async () => {
  await admin.query(`ALTER ROLE ${witnessRole} SET synchronous_commit=off`);
  await closeRecoveryWitnessDatabases();
  const client = new pg.Pool({ connectionString: witness.databaseUrl });
  try {
    assert.equal((await client.query('SHOW synchronous_commit')).rows[0].synchronous_commit, 'off');
    const saved = (await witnessAdmin.query("SELECT revision,digest FROM capability_witness.heads WHERE owner_id='owner'")).rows[0];
    const previous = { schema: 'capability-control.recovery-head.v1' as const, ...scope, epoch: witness.epoch, revision: Number(saved.revision), digest: saved.digest };
    const next = { ...previous, revision: previous.revision + 1, digest: 'f'.repeat(64) };
    await assert.rejects(client.query('SELECT capability_witness.advance_head($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
      [witness.enrollmentId, scope.organizationId, scope.installationId, scope.ownerId, witness.epoch, witness.qualificationDigest, witness.installationDigest,
        previous.revision, previous.digest, next.revision, next.digest]), /DURABLE_COMMIT_REQUIRED/);
    await advanceRecoveryWitness(witness, previous, next);
    await closeRecoveryWitnessDatabases();
    await assertRecoveryHead(witness, next);
  } finally {
    await client.end();
    await admin.query(`ALTER ROLE ${witnessRole} RESET synchronous_commit`);
    await closeRecoveryWitnessDatabases();
  }
});


test('hosted guard derives the exact binding checked by every independent policy read and command',async()=>{
 const policy={version:1,kind:'TWO_EXTERNAL_OWNERS_V1',cohortId:randomUUID(),slot:'1',ownerId:randomUUID(),projectId:'prj_hostedFixture',
  clientId:'external-alpha-'+'a'.repeat(32),repository:'fixture/myeve-alpha-workspace-01',baseSha:'a'.repeat(40),treeSha:'b'.repeat(40),
  workspacePolicy:'ISOLATED_WORKSPACE_V1',dayBoundary:'UTC_MIDNIGHT',model:'openai/gpt-5.4-mini',provider:'vercel-ai-gateway/openai',
  sourceDigest:'c'.repeat(64),factoryVersion:'d'.repeat(64),limits:{...externalAlphaLimits},publication:false,automaticRepair:false,fallback:false};
 const origin='https://hosted.example.test',installationId='hosted-fixture';
 const installationDigest=digest({schema:'myeve-hosted-capability-installation/v1',installationId,origin,ownerId:policy.ownerId,projectId:policy.projectId,
  policyDigest:digest(policy),sourceDigest:policy.sourceDigest,factoryVersion:policy.factoryVersion,mode:'APPROVED_NONPRODUCTION'});
 const w={...witness,enrollmentId:'hosted-enrollment',epoch:'hosted-epoch',installationDigest};
 const env={NODE_ENV:'production' as const,VERCEL:'1',VERCEL_ENV:'production',VERCEL_PROJECT_ID:policy.projectId,EVE_PROJECT_NAME:'myeve-alpha-tester-1',
  MYEVE_OWNER_ID:policy.ownerId,MYEVE_EXTERNAL_ALPHA_POLICY:JSON.stringify(policy),MYEVE_EXTERNAL_ALPHA_POLICY_SHA256:digest(policy),
  MYEVE_EXTERNAL_ALPHA_AUTHORITY_SIGNING_KEY:generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'}).toString(),
  MYEVE_MISSIONCONTROL_MODE:'APPROVED_NONPRODUCTION',MYEVE_CAPABILITY_CONTROL_ENABLED:'true',MYEVE_CAPABILITY_INSTALLATION_ID:installationId,
  MYEVE_CAPABILITY_ORIGIN:origin,MYEVE_CAPABILITY_ENVIRONMENT:'qualification',MYEVE_CAPABILITY_DATABASE_URL:url(appName,appRole),
  MYEVE_CAPABILITY_RECOVERY_EPOCH:w.epoch,MYEVE_CAPABILITY_RECOVERY_WITNESS_DATABASE_URL:w.databaseUrl,
  MYEVE_CAPABILITY_RECOVERY_WITNESS_ENROLLMENT_ID:w.enrollmentId,MYEVE_CAPABILITY_RECOVERY_WITNESS_INSTALLATION_DIGEST:installationDigest,
  MYEVE_CAPABILITY_RECOVERY_WITNESS_QUALIFICATION_DIGEST:w.qualificationDigest};
 const config=capabilityConfiguration(env),hostedScope={ownerId:policy.ownerId,organizationId:'organization',installationId};
 const current=()=>new CapabilityStore(runtime,config,{ownerId:policy.ownerId,source:'settings'},undefined,configuredRecoveryWitness(env));
 await app.query("INSERT INTO capability_control.installations VALUES($1,'organization','qualification',true)",[installationId]);
 await app.query('INSERT INTO capability_control.owner_state(installation_id,owner_id) VALUES($1,$2)',[installationId,policy.ownerId]);
 await app.query('INSERT INTO capability_control.recovery_enrollments VALUES($1,$2,$3)',[installationId,policy.ownerId,w.epoch]);
 await assert.rejects(current().inspect(),/WITNESS_UNAVAILABLE/);
 const head=await recoveryHead(app,hostedScope,w);
 await witnessAdmin.query("INSERT INTO capability_witness.enrollments VALUES($1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp()+interval '1 hour')",[w.enrollmentId,hostedScope.organizationId,installationId,policy.ownerId,w.epoch,witnessRole,w.qualificationDigest,w.installationDigest]);
 await witnessAdmin.query('INSERT INTO capability_witness.heads VALUES($1,$2,$3,$4,$5,$6)',[w.enrollmentId,hostedScope.organizationId,installationId,policy.ownerId,head.revision,head.digest]);
 assert.equal((await current().inspect()).revision,1);
 assert.equal((await current().command(command(1))).revision,2);
 await app.query('UPDATE capability_control.owner_state SET revision=1 WHERE installation_id=$1 AND owner_id=$2',[installationId,policy.ownerId]);
 await assert.rejects(current().inspect(),/QUARANTINED/);
 await assert.rejects(current().command(command(1)),/QUARANTINED/);
});
