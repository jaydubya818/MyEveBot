import assert from 'node:assert/strict';
import { Client } from 'pg';
import { randomBytes } from 'node:crypto';
import { loadMigrations, runMigrations } from '../scripts/migration-runner.ts';

const url = new URL(process.env.PEER_TEST_DATABASE_URL ?? '');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55439');
assert.equal(url.pathname, '/myeve_combined_v1');
const client = new Client({ connectionString: url.href, ssl: false });
await client.connect();
const schemas = ['upgrade', 'fresh', 'multirun'].map(kind => `peer_test_${kind}_${randomBytes(6).toString('hex')}`);
const database = {
  query: async (sql, params) => (await client.query(sql, params)).rows,
  transaction: async statements => {
    await client.query('BEGIN');
    try {
      for (const statement of statements) await client.query(statement.sql, statement.params);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  },
};
try {
  for (const schema of schemas) await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET search_path=${schemas[0]}`);
  const migrations = await loadMigrations();
  const prefix = migrations.filter(m => m.name < '0034');
  await runMigrations(database, prefix);
  const multirun = migrations.find(m => m.name === '0034_conversation_runs.sql');
  assert.deepEqual(migrations.slice(-3).map(m => m.name), ['0033_final_lineage_bridge.sql', '0034_conversation_runs.sql', '0035_peer_permissions.sql']);
  const failedRun = [...prefix, { ...multirun, statements: [...multirun.statements, 'SELECT nonexistent_run_migration_failure()'] }];
  await assert.rejects(runMigrations(database, failedRun));
  assert.equal((await client.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='task_run_sessions' AND column_name='is_current'")).rows[0].n, 0);
  await runMigrations(database, [...prefix, multirun]);
  const failing = [...prefix, multirun, { ...migrations.at(-1), statements: [...migrations.at(-1).statements, 'SELECT nonexistent_peer_migration_failure()'] }];
  await assert.rejects(runMigrations(database, failing));
  assert.equal((await client.query("SELECT to_regclass('myeve_peer_permissions') AS relation")).rows[0].relation, null);
  await runMigrations(database, migrations);
  const count = (await client.query('SELECT count(*)::int AS count FROM myeve_peer_permissions')).rows[0].count;
  assert.equal(count, 0);
  await runMigrations(database, migrations);
  assert.equal((await client.query('SELECT count(*)::int AS count FROM myeve_peer_permissions')).rows[0].count, 0);
  await client.query(`SET search_path=${schemas[1]}`);
  await runMigrations(database, migrations);
  await runMigrations(database, migrations);
  assert.equal((await client.query('SELECT count(*)::int AS count FROM myeve_peer_permissions')).rows[0].count, 0);
  await client.query(`SET search_path=${schemas[2]}`);
  await runMigrations(database, migrations.filter(m => m.name < '0035'));
  await runMigrations(database, migrations);
  await runMigrations(database, migrations);
  await client.query('SET search_path=public');
  await runMigrations(database, migrations); // named disposable fixture for the other SQL suites
  console.log('PASS: fresh schema, canonical prefix upgrade, atomic failure rollback, migration rerun. Disposable schemas only.');
} finally {
  await client.query('SET search_path=public');
  for (const schema of schemas) await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await client.end();
}
