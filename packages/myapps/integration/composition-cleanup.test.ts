import { test, expect } from 'vitest';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { dropIdleCompositionDatabase } from './composition-database-cleanup.ts';

const connection = process.env.MYAPPS_POSTGRES_URL;
const pg = createRequire(import.meta.url)('pg');
function ownedDatabase() {
  if (!connection) throw new Error('LOCAL_TEST_DATABASE_REQUIRED');
  const url = new URL(connection);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname))
    throw new Error('LOCAL_TEST_DATABASE_REQUIRED');
  const name = 'myapps_composition_' + randomUUID().replaceAll('-', '');
  const admin = new pg.Pool({ connectionString: url.href });
  url.pathname = '/' + name;
  return { name, admin, url };
}

test.skipIf(!connection)('composition cleanup waits for a closing owned backend without terminating it', async () => {
  const { name, admin, url } = ownedDatabase();
  let pool: any, releaseEnd: (() => void) | undefined;
  const errors: string[] = [];
  const closed = Promise.withResolvers<void>();
  try {
    await admin.query('CREATE DATABASE ' + name);
    pool = new pg.Pool({ connectionString: url.href });
    pool.on('error', (error: { code: string }) => errors.push(error.code));
    const client = await pool.connect();
    await client.query('SELECT 1');
    const originalEnd = client.end.bind(client);
    const gate = Promise.withResolvers<void>();
    releaseEnd = gate.resolve;
    client.once('end', closed.resolve);
    // Delay only this fixture client's close, making Pool.end's ordering visible.
    client.end = (...args: unknown[]) => gate.promise.then(() => originalEnd(...args));
    client.release();
    await pool.end();
    let observedClosingBackend = false;
    await dropIdleCompositionDatabase({ query: async (sql, params) => {
      const result = await admin.query(sql, params);
      if (sql.startsWith('SELECT pid') && result.rows.length) {
        observedClosingBackend = true;
        releaseEnd!();
      }
      return result;
    } }, name);
    await closed.promise;
    expect(observedClosingBackend).toBe(true);
    expect(errors).toEqual([]);
    expect((await admin.query('SELECT datname FROM pg_database WHERE datname=$1', [name])).rows).toEqual([]);
  } finally {
    releaseEnd?.();
    if (pool && !pool.ending) await pool.end();
    if (releaseEnd) await closed.promise;
    try { await dropIdleCompositionDatabase(admin, name); }
    finally { await admin.end(); }
  }
});

test.skipIf(!connection)('composition cleanup fails without dropping a database whose session stays open', async () => {
  const { name, admin, url } = ownedDatabase();
  const client = new pg.Client({ connectionString: url.href });
  let connected = false;
  const errors: string[] = [];
  client.on('error', (error: { code: string }) => errors.push(error.code));
  try {
    await admin.query('CREATE DATABASE ' + name);
    await client.connect();
    connected = true;
    await expect(dropIdleCompositionDatabase(admin, name)).rejects.toThrow('COMPOSITION_DATABASE_SESSIONS_STILL_OPEN');
    expect((await client.query('SELECT 1 AS alive')).rows).toEqual([{ alive: 1 }]);
    expect(errors).toEqual([]);
    expect((await admin.query('SELECT datname FROM pg_database WHERE datname=$1', [name])).rows).toHaveLength(1);
  } finally {
    if (connected) await client.end();
    try { await dropIdleCompositionDatabase(admin, name); }
    finally { await admin.end(); }
  }
});

test('composition cleanup refuses non-fixture database names before querying', async () => {
  let queried = false;
  await expect(dropIdleCompositionDatabase({ query: async () => {
    queried = true; return { rows: [] };
  } }, 'postgres')).rejects.toThrow('COMPOSITION_DATABASE_NAME_REQUIRED');
  expect(queried).toBe(false);
});
