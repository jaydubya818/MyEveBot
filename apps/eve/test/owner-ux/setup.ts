import pg from 'pg';
import { loadMigrations, runMigrations } from '../../scripts/migration-runner.ts';
const connectionString = process.env.MYEVE_TEST_DATABASE_URL;
if (!connectionString || !/^postgresql:\/\/ux_fixture:local-only@localhost:(55491|55591)\/blocker_fixes$/.test(connectionString)) throw Error('Dedicated local UX database required');
const client = new pg.Client({ connectionString });
await client.connect();
try {
  // This exact guarded localhost fixture is disposable. Reset before migration
  // so interrupted browser runs cannot leak synthetic records into the next run.
  await client.query('DROP SCHEMA public CASCADE');
  await client.query('CREATE SCHEMA public');
  await runMigrations({
    query: async (sql, params) => (await client.query(sql, params)).rows,
    transaction: async statements => {
      await client.query('BEGIN');
      try { const results = []; for (const s of statements) results.push((await client.query(s.sql, s.params)).rows); await client.query('COMMIT'); return results; }
      catch (e) { await client.query('ROLLBACK'); throw e; }
    },
  }, await loadMigrations());
  console.log('Clean synthetic owner database migrated; no Work, goals, conversations or files seeded.');
} finally { await client.end(); }
