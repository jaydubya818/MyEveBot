import assert from 'node:assert/strict';
import { Client } from 'pg';
import { loadMigrations, runMigrations } from '../scripts/migration-runner.ts';

const url = new URL(process.env.PEER_TEST_DATABASE_URL ?? '');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55439');
assert.equal(url.pathname, '/myeve_peer_v1');
const client = new Client({ connectionString: url.href, ssl: false });
await client.connect();
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
  const migrations = await loadMigrations();
  const prefix = migrations.filter(m => m.name < '0034');
  await runMigrations(database, prefix);
  const failing = [...prefix, { ...migrations.at(-1), statements: [...migrations.at(-1).statements, 'SELECT nonexistent_peer_migration_failure()'] }];
  await assert.rejects(runMigrations(database, failing));
  assert.equal((await client.query("SELECT to_regclass('myeve_peer_permissions') AS relation")).rows[0].relation, null);
  await runMigrations(database, migrations);
  const count = (await client.query('SELECT count(*)::int AS count FROM myeve_peer_permissions')).rows[0].count;
  assert.equal(count, 0);
  await runMigrations(database, migrations);
  assert.equal((await client.query('SELECT count(*)::int AS count FROM myeve_peer_permissions')).rows[0].count, 0);
  console.log('PASS: canonical prefix upgrade, atomic failure rollback, migration rerun. Disposable database only.');
} finally { await client.end(); }
