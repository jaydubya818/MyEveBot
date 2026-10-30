/** Disposable PG17 proof for the rendered runtime schema; no service, provider or financial ledger access. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { JOURNAL_SCHEMA, PostgresJournal } from '../../apps/eve/lib/qualification/journal.ts';
import { RETAINED_ADMISSION_SCHEMA, DurableStageAdmitter } from '../../apps/eve/lib/qualification/retained-admissions.ts';

const script = fileURLToPath(new URL('./render-runtime-schema.mjs', import.meta.url));
const loader = new URL('../../node_modules/tsx/dist/loader.mjs', import.meta.url).href;
const sentinel = 'synthetic-never-print-or-use-credentials';
const render = (args = []) => spawnSync(process.execPath, ['--import', loader, script, ...args], {
  cwd: tmpdir(), encoding: 'utf8', maxBuffer: 1 << 20,
  env: { PATH: process.env.PATH, NODE_ENV: 'test', DATABASE_URL: sentinel, MYEVE_QDEV_HOST_BUNDLE: sentinel },
});

test('renderer works outside the checkout, uses the runtime constants and ignores all database/host credentials', () => {
  const result = render();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.ok(result.stdout.endsWith(JOURNAL_SCHEMA.trim() + '\n' + RETAINED_ADMISSION_SCHEMA.trim() + '\n'));
  assert.doesNotMatch(result.stdout, /qdev_charter|qdev_cohort_call|qdev_dispatch|external_alpha/);
  assert.ok(!result.stdout.includes(sentinel));
  const refused = render(['--execute', sentinel]);
  assert.equal(refused.status, 2); assert.equal(refused.stdout, '');
  assert.ok(!refused.stderr.includes(sentinel), 'refusal must not echo a supplied credential');
});

const url = process.env.MYEVE_ISOLATED_COHORT_TEST_DATABASE;
test('rendered SQL initializes only the journal/retention tables; real runtime append, one claim and immutable restart history work', { skip: !url }, async () => {
  const parsed = new URL(url);
  assert.ok(['127.0.0.1', 'localhost'].includes(parsed.hostname));
  assert.equal(parsed.pathname, '/postgres');
  const { Client } = createRequire(import.meta.url)('pg');
  const admin = new Client({ connectionString: url }); admin.on('error', () => {}); await admin.connect();
  const suffix = randomBytes(6).toString('hex'), name = 'qdev_schema_' + suffix, role = 'qdev_schema_rt_' + suffix;
  let database, runtime;
  try {
    await admin.query('CREATE DATABASE ' + name);
    const target = new URL(parsed); target.pathname = '/' + name;
    database = new Client({ connectionString: target.href }); database.on('error', () => {}); await database.connect();
    const sql = render(); assert.equal(sql.status, 0, sql.stderr);
    await database.query('BEGIN'); await database.query(sql.stdout); await database.query('COMMIT');
    assert.equal((await database.query('SHOW server_version_num')).rows[0].server_version_num.slice(0, 2), '17');
    assert.deepEqual((await database.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r => r.tablename),
      ['qdev_admission_claim', 'qdev_retained_admission', 'qjourney_event']);
    await admin.query('CREATE ROLE ' + role + ' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS');
    await database.query('GRANT USAGE ON SCHEMA public TO ' + role);
    await database.query('GRANT SELECT,INSERT ON qjourney_event,qdev_admission_claim,qdev_retained_admission TO ' + role);
    await database.query('GRANT USAGE ON SEQUENCE qjourney_event_seq_seq TO ' + role);
    runtime = new Client({ connectionString: target.href }); runtime.on('error', () => {}); await runtime.connect();
    await runtime.query('SET ROLE ' + role);
    await assert.rejects(runtime.query('CREATE TABLE runtime_ddl_is_forbidden(id int)'), /permission denied/);
    const adapter = { query: async (q, p) => (await runtime.query(q, p)).rows };
    const journal = new PostgresJournal(adapter, 'owned-journey');
    await journal.append({ kind: 'OP_CLAIMED', stage: 1, key: 'coding' });
    assert.deepEqual(await new PostgresJournal(adapter, 'owned-journey').read(), [{ kind: 'OP_CLAIMED', stage: 1, key: 'coding' }]);
    const claim = "INSERT INTO qdev_admission_claim(journey_id,stage) VALUES('owned-journey',1) ON CONFLICT DO NOTHING RETURNING stage";
    const results = await Promise.all([database.query(claim), runtime.query(claim)]);
    assert.equal(results.reduce((n, r) => n + r.rows.length, 0), 1, 'two connections cannot obtain two preparation claims');
    const restarted = new DurableStageAdmitter({ db: adapter, journeyId: 'owned-journey', inner: { retained: async () => { throw Error('must not prepare'); } } });
    assert.equal(await restarted.peek(1), null);
    await assert.rejects(restarted.retained(1), { code: 'QDEV_RETAINED_ADMISSION_PENDING' });
    await runtime.query("INSERT INTO qdev_retained_admission(journey_id,stage,admission) VALUES('owned-journey',1,'{}')");
    await assert.rejects(restarted.peek(1), { code: 'QDEV_RETAINED_ADMISSION_INVALID' });
    for (const table of ['qjourney_event', 'qdev_admission_claim', 'qdev_retained_admission']) {
      await assert.rejects(database.query('DELETE FROM ' + table), /IMMUTABLE/);
      const column = table === 'qjourney_event' ? 'kind' : 'journey_id';
      await assert.rejects(database.query('UPDATE ' + table + ' SET ' + column + '=' + column), /IMMUTABLE/);
      await assert.rejects(runtime.query('TRUNCATE ' + table), /permission denied/);
    }
    await database.query(sql.stdout);
    assert.equal((await database.query('SELECT count(*)::int AS n FROM qjourney_event')).rows[0].n, 1);
    assert.equal((await database.query('SELECT count(*)::int AS n FROM qdev_admission_claim')).rows[0].n, 1);
    assert.equal((await database.query('SELECT count(*)::int AS n FROM qdev_retained_admission')).rows[0].n, 1);
  } finally {
    await runtime?.end(); await database?.end();
    await admin.query('DROP DATABASE IF EXISTS ' + name + ' WITH (FORCE)');
    await admin.query('DROP ROLE IF EXISTS ' + role); await admin.end();
  }
});
