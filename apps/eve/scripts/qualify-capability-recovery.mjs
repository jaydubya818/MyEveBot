import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile as callback } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import { capabilityRegistry } from '@mission-control/capability-control';
import { CapabilityStore } from '../lib/capability-control/store.ts';
import { recoveryHead, initializeRecoveryWitness, assertRecoveryHead } from '../../../packages/capability-enforcement/src/recovery-witness.ts';
import { assertCapabilityAdmission } from '../../../packages/capability-enforcement/src/postgres.ts';

export async function qualifyRecovery({ admin, runtime, check, bin, socket, port, directory }) {
  const execFile = promisify(callback), ownerId = 'recovery-owner';
  const scope = { ownerId, organizationId: 'organization-1', installationId: 'qualification-1', environment: 'qualification', agentId: 'recovery-agent' };
  const witness = { directory: join(directory, 'independent-witness'), epoch: 'synthetic-host-epoch-1' };
  await mkdir(witness.directory, { mode: 0o700 });
  await admin.query('INSERT INTO capability_control.owner_state(installation_id,owner_id) VALUES($1,$2)', [scope.installationId, ownerId]);
  await admin.query("UPDATE capability_control.owner_state SET preferences='{" + '\"work\":\"ENABLED\"' + "}'::jsonb WHERE owner_id=$1", [ownerId]);
  const facts = Object.fromEntries(capabilityRegistry.capabilities.map(item => [item.id, { supported: true, deployed: true, entitled: true, administrator: 'ALLOW', lifecycle: 'ACTIVE', setup: Object.fromEntries(item.setupRequirements.map(key => [key,true])), qualification: Object.fromEntries(item.qualificationRequirements.map(key => [key,'QUALIFIED'])) }]));
  await admin.query("INSERT INTO capability_control.evidence VALUES($1,$2,$3,'1',$4,clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour','synthetic-recovery')", [scope.installationId, scope.organizationId, ownerId, facts]);
  await admin.query("INSERT INTO capability_control.relay_agent_evidence VALUES($1,$2,$3,$4,1,'[\"work\"]','ACTIVE',clock_timestamp()+interval '1 hour','synthetic')", [scope.installationId, ownerId, scope.organizationId, scope.agentId]);
  await admin.query('INSERT INTO capability_control.recovery_enrollments VALUES($1,$2,$3)', [scope.installationId, ownerId, witness.epoch]);
  await initializeRecoveryWitness(witness, await recoveryHead(admin, scope, witness));
  const store = new CapabilityStore(runtime, { id: scope.installationId, environment: 'qualification' }, { ownerId, source: 'settings' }, undefined, witness);
  const dump = join(directory, 'before-revoke.sql');
  await execFile(join(bin, 'pg_dump'), ['-h', socket, '-p', String(port), '-U', 'capability_admin', '-d', 'postgres', '--schema=capability_control', '--no-owner', '-f', dump]);
  const command = expectedRevision => ({ requestId: randomUUID(), expectedRevision, capabilityId: 'missioncontrol', operation: 'revoke' });
  await store.command(command(1));
  await check('controller restart preserves independent policy witness and revoked preferences', async () => {
    const restarted = new CapabilityStore(runtime, store.installation, store.actor, undefined, witness);
    assert.equal((await restarted.inspect()).revision, 2);
    assert.equal((await restarted.inspect()).capabilities.find(item => item.id === 'missioncontrol').preference, 'DISABLED');
  });
  const database = 'capability_restore_' + randomUUID().replaceAll('-', '');
  await admin.query(`CREATE DATABASE ${database}`);
  let restored;
  try {
    await execFile(join(bin, 'psql'), ['-h', socket, '-p', String(port), '-U', 'capability_admin', '-d', database, '-v', 'ON_ERROR_STOP=1', '-f', dump]);
    restored = new pg.Pool({ host: socket, port, user: 'capability_runtime', database, max: 2 });
    await check('real PostgreSQL restore cannot resurrect policy behind independently retained revoke witness', async () => {
      const restoredStore = new CapabilityStore(restored, store.installation, store.actor, undefined, witness);
      await assert.rejects(restoredStore.inspect(), /RECOVERY_QUARANTINED/);
      await assert.rejects(restoredStore.command(command(1)), /RECOVERY_QUARANTINED/);
      const oldDirectory = process.env.MYEVE_CAPABILITY_RECOVERY_WITNESS_DIRECTORY, oldEpoch = process.env.MYEVE_CAPABILITY_RECOVERY_EPOCH;
      process.env.MYEVE_CAPABILITY_RECOVERY_WITNESS_DIRECTORY = witness.directory;
      process.env.MYEVE_CAPABILITY_RECOVERY_EPOCH = witness.epoch;
      const connection = await restored.connect();
      try {
        await connection.query('BEGIN');
        await assert.rejects(assertCapabilityAdmission(connection, scope, { capabilityId: 'missioncontrol', workId: 'restored-work', workGeneration: 1, budgetMicros: 0 }), /RECOVERY_QUARANTINED/);
      } finally {
        await connection.query('ROLLBACK'); connection.release();
        if (oldDirectory === undefined) delete process.env.MYEVE_CAPABILITY_RECOVERY_WITNESS_DIRECTORY; else process.env.MYEVE_CAPABILITY_RECOVERY_WITNESS_DIRECTORY = oldDirectory;
        if (oldEpoch === undefined) delete process.env.MYEVE_CAPABILITY_RECOVERY_EPOCH; else process.env.MYEVE_CAPABILITY_RECOVERY_EPOCH = oldEpoch;
      }
    });
  } finally { await restored?.end(); await admin.query(`DROP DATABASE ${database}`); }
  await check('changed incarnation and missing external witness fail closed without automatic enrollment', async () => {
    const head = await recoveryHead(admin, scope, witness);
    await assert.rejects(assertRecoveryHead({ ...witness, epoch: 'other' }, { ...head, epoch: 'other' }), /QUARANTINED/);
    await assert.rejects(assertRecoveryHead(witness, { ...head, ownerId: 'unregistered-owner' }), /UNAVAILABLE/);
    await assert.rejects(initializeRecoveryWitness(witness, head), /EEXIST/);
  });
  await check('enrolled owner cannot bypass witness by removing both process settings', async () => {
    const noWitness = new CapabilityStore(runtime, store.installation, store.actor);
    await assert.rejects(noWitness.inspect(), /WITNESS_REQUIRED/);
    await assert.rejects(noWitness.command(command(2)), /WITNESS_REQUIRED/);
    const connection = await runtime.connect();
    try { await connection.query('BEGIN');
      await assert.rejects(assertCapabilityAdmission(connection, scope, { capabilityId: 'missioncontrol', workId: 'missing-witness', workGeneration: 1, budgetMicros: 0 }), /WITNESS_REQUIRED/);
    } finally { await connection.query('ROLLBACK'); connection.release(); }
  });
  await check('privileged policy input rollback is detected without an owner revision change', async () => {
    const before = await recoveryHead(admin, scope, witness);
    await admin.query("INSERT INTO capability_control.relay_agent_evidence VALUES($1,$2,$3,$4,1,'[]','ACTIVE',clock_timestamp()+interval '1 hour','synthetic')",
      [scope.installationId, ownerId, scope.organizationId, 'rollback-agent']);
    const changed = await recoveryHead(admin, scope, witness);
    assert.equal(changed.revision, before.revision);
    assert.notEqual(changed.digest, before.digest);
    await assert.rejects(store.inspect(), /QUARANTINED/);
    await admin.query('DELETE FROM capability_control.relay_agent_evidence WHERE owner_id=$1 AND agent_id=\'rollback-agent\'', [ownerId]);
    assert.equal((await store.inspect()).revision, before.revision);
  });
  await check('witness-enabled backend admission preserves SELECT-only policy role', async () => {
    await admin.query('CREATE ROLE recovery_receiver LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS');
    await admin.query('GRANT USAGE ON SCHEMA capability_control TO recovery_receiver');
    await admin.query('GRANT SELECT ON ALL TABLES IN SCHEMA capability_control TO recovery_receiver');
    await admin.query('GRANT EXECUTE ON FUNCTION capability_control.lock_admission_policy(text,text,text) TO recovery_receiver');
    const pool = new pg.Pool({ host: socket, port, user: 'recovery_receiver', database: 'postgres' });
    const oldDirectory = process.env.MYEVE_CAPABILITY_RECOVERY_WITNESS_DIRECTORY, oldEpoch = process.env.MYEVE_CAPABILITY_RECOVERY_EPOCH;
    process.env.MYEVE_CAPABILITY_RECOVERY_WITNESS_DIRECTORY = witness.directory;
    process.env.MYEVE_CAPABILITY_RECOVERY_EPOCH = witness.epoch;
    const connection = await pool.connect();
    try {
      await connection.query('BEGIN');
      const admission = await assertCapabilityAdmission(connection, scope, { capabilityId: 'work', workId: 'read-only-receiver-work', workGeneration: 1, budgetMicros: 0 });
      assert.equal(admission.capabilityId, 'work');
      await connection.query('ROLLBACK');
      await assert.rejects(connection.query('UPDATE capability_control.owner_state SET revision=revision+1'), /permission denied/);
    } finally {
      await connection.query('ROLLBACK'); connection.release(); await pool.end();
      if (oldDirectory === undefined) delete process.env.MYEVE_CAPABILITY_RECOVERY_WITNESS_DIRECTORY; else process.env.MYEVE_CAPABILITY_RECOVERY_WITNESS_DIRECTORY = oldDirectory;
      if (oldEpoch === undefined) delete process.env.MYEVE_CAPABILITY_RECOVERY_EPOCH; else process.env.MYEVE_CAPABILITY_RECOVERY_EPOCH = oldEpoch;
    }
  });
  await check('crash after witness advance before database commit quarantines rather than rolling authority back', async () => {
    const crashPool = { connect: async () => {
      const connection = await runtime.connect();
      return { release: () => connection.release(), query: async (sql, values) => {
        if (sql === 'COMMIT') throw Error('SYNTHETIC_COMMIT_INTERRUPTION');
        return connection.query(sql, values);
      } };
    } };
    const interrupted = new CapabilityStore(crashPool, store.installation, store.actor, undefined, witness);
    await assert.rejects(interrupted.command(command(2)), /COMMIT_INTERRUPTION/);
    assert.equal((await admin.query('SELECT revision FROM capability_control.owner_state WHERE owner_id=$1', [ownerId])).rows[0].revision, 2);
    await assert.rejects(store.inspect(), /RECOVERY_QUARANTINED/);
  });
}
