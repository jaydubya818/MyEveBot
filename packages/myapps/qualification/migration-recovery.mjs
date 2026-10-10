/** Disposable PostgreSQL qualification; never connects to a production host.
 * Run with node --import tsx .../migration-recovery.mjs EVE FACTORY RECEIPT.
 * MYAPPS_POSTGRES_URL must name a loopback fixture administrator database.
 * pg_dump and pg_restore must be on PATH (PostgreSQL 17 or newer).
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const [eveArg, factoryArg, receiptArg] = process.argv.slice(2);
assert(eveArg && factoryArg && receiptArg, 'Explicit Eve, Factory and receipt paths required');
assert.equal(process.env.MYAPPS_MIGRATION_REHEARSAL, '1', 'Explicit disposable rehearsal opt-in required');
const eve = resolve(eveArg), factory = resolve(factoryArg), receipt = resolve(receiptArg);
const url = new URL(process.env.MYAPPS_POSTGRES_URL || '');
assert(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Loopback PostgreSQL only');
assert(['myapps_fixture', 'blocker_fixes'].includes(url.pathname.slice(1)), 'Fixture administrator database required');
assert(['postgres:', 'postgresql:'].includes(url.protocol));
assert(!url.search && !url.hash, 'Connection overrides are forbidden');
const { Client } = createRequire(join(eve, 'package.json'))('pg');
const { loadMigrations, runMigrations, planMigrations } = await import(pathToFileURL(join(eve, 'apps/eve/scripts/migration-runner.ts')));
const { splitSqlStatements } = await import(pathToFileURL(join(eve, 'apps/eve/scripts/migration-sql.ts')));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const historical = JSON.parse(readFileSync(new URL('./historical-migrations.json', import.meta.url)));
const result = { version: 1, status: 'RUNNING', source: {}, qualificationSha256: sha(readFileSync(new URL(import.meta.url))), historicalManifestSha256: sha(readFileSync(new URL('./historical-migrations.json', import.meta.url))), historical: [], checks: [], production: 'NOT_RUN', limitations: [
  'Disposable canonical-prefix recovery qualification only; no production target, credentials, role transfer or activation is approved.',
  'Prior Phase 2 0085 MyApps lineage is not a supported canonical prefix; this harness rejects it and does not invent a transfer.',
  'Factory SQL is tested in source order on disposable fixtures. This is not a new Factory production migration runner or ledger.',
  'Recovery retains data and replays forward migrations; no destructive down migration is supported.'
] };
for (const [name, root] of [['myeve', eve], ['myfactory', factory]]) {
  result.source[name] = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.equal(execFileSync('git', ['-C', root, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim(), '', 'Qualification requires committed clean source');
}
for (const entry of historical.files) {
  const actual = sha(readFileSync(join(entry.repository === 'myeve' ? eve : factory, entry.path)));
  assert.equal(actual, entry.sha256, `Historical migration changed: ${entry.path}`);
  result.historical.push({ ...entry, actual });
}
assert.equal(result.historical.length, 103);
const migrations = await loadMigrations(pathToFileURL(join(eve, 'apps/eve/migrations/')));
assert.equal(migrations.length, 89, 'Review any new application migration explicitly');
assert.equal(migrations.at(-1).name, '0093_myapps_runtime.sql');
assert.equal(new Set(migrations.map(m => m.name.slice(0, 4))).size, migrations.length);
const expected = migrations.map(({ name, checksum }) => ({ name, checksum }));
assert.throws(() => planMigrations(migrations, [expected[1]]), /Noncontiguous/);
assert.throws(() => planMigrations(migrations, [expected[0], expected[0]]), /Duplicate/);
assert.throws(() => planMigrations(migrations, [{ name: '0085_myapps_runtime.sql', checksum: migrations.at(-1).checksum }]), /lineage/);
const admin = new Client({ connectionString: url.href });
const clients = new Set(), names = [], roles = [], temporary = mkdtempSync(join(tmpdir(), 'myapps-restore-'));
const check = (name, detail = {}) => { result.checks.push({ name, status: 'PASS', ...detail }); console.log(`PASS ${name}`); };
const fixtureUrl = name => { const next = new URL(url); next.pathname = '/' + name; return next.href; };
const connect = async name => {
  const client = new Client({ connectionString: fixtureUrl(name) });
  await client.connect(); clients.add(client); return client;
};
const close = async client => { clients.delete(client); await client.end(); };
const create = async label => {
  const name = `myapps_migration_${label}_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE DATABASE "${name}"`); names.push(name);
  return { name, client: await connect(name) };
};
const driver = (client, beforeStatement = async () => {}) => ({
  query: async (sql, params) => (await client.query(sql, params)).rows,
  transaction: async statements => {
    await client.query('BEGIN');
    try {
      for (const statement of statements) { await beforeStatement(statement); await client.query(statement.sql, statement.params); }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  },
});
const migrate = (client, source = migrations, before) => runMigrations(driver(client, before), source, () => {});
const ledger = async client => (await client.query('SELECT name,checksum FROM sofie_schema_migrations ORDER BY name')).rows;
const schema = name => execFileSync('pg_dump', ['--schema-only', '--no-owner', fixtureUrl(name)], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  .split('\n').filter(line => !/^\\(?:un)?restrict /.test(line)).join('\n');
const snapshot = async client => {
  const tables = (await client.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','factory') ORDER BY 1,2")).rows;
  const rows = {};
  for (const { schemaname, tablename } of tables) {
    const quote = value => '"' + value.replaceAll('"', '""') + '"';
    rows[`${schemaname}.${tablename}`] = (await client.query(`SELECT to_jsonb(t) AS row FROM ${quote(schemaname)}.${quote(tablename)} t ORDER BY to_jsonb(t)::text`)).rows.map(r => r.row);
  }
  return rows;
};

await admin.connect();
try {
  const fresh = await create('fresh');
  await migrate(fresh.client);
  assert.deepEqual(await ledger(fresh.client), expected);
  const freshSchema = schema(fresh.name);
  check('fresh ordered application ledger and all historical checksums', { application: 89, factory: 12, central: 2 });
  check('duplicate, noncontiguous and unsupported Phase 2 ledger identities are rejected');
  const originalLedger = (await fresh.client.query('SELECT * FROM sofie_schema_migrations ORDER BY name')).rows;
  await migrate(fresh.client);
  assert.deepEqual((await fresh.client.query('SELECT * FROM sofie_schema_migrations ORDER BY name')).rows, originalLedger);
  check('duplicate application migration preserves names, checksums and original timestamps');

  // Exact canonical prefixes are supported by planMigrations, not guessed deployment states.
  for (const boundary of ['0033', '0067', '0084', '0092']) {
    const upgrade = await create('prefix' + boundary);
    const prefix = migrations.filter(m => m.name.slice(0, 4) <= boundary);
    await migrate(upgrade.client, prefix);
    const previous = (await upgrade.client.query('SELECT * FROM sofie_schema_migrations ORDER BY name')).rows;
    await migrate(upgrade.client);
    assert.deepEqual(await ledger(upgrade.client), expected);
    assert.deepEqual((await upgrade.client.query('SELECT * FROM sofie_schema_migrations ORDER BY name')).rows.slice(0, previous.length), previous);
    assert.equal(schema(upgrade.name), freshSchema);
    check('supported canonical prefix ' + boundary + ' forward upgrade converges without ledger rewriting');
  }

  // Qualified historical origins retain their actual applied ledger identities.
  // Read exact bytes from canonical Git history and verify canonical pinned hashes.
  for (const origin of [
    { label: 'feature396631a', ref: '396631afa4739e5ca8ac0c5c81781f82f3160403', manifest: 'deployed-lineage-396631a.json', raw: true },
    { label: 'publishedmain', ref: 'd64f2f96003818b2f51341b54a2edd6f426a0dae', manifest: 'published-main-d64f2f9.json', raw: false },
  ]) {
    const pinned = JSON.parse(readFileSync(join(eve, 'apps/eve/scripts', origin.manifest)));
    const hashes = origin.raw ? pinned : pinned.migrations;
    const old = Object.entries(hashes).sort(([a], [b]) => a.localeCompare(b)).map(([name, checksum]) => {
      const source = execFileSync('git', ['-C', eve, 'show', `${origin.ref}:apps/eve/migrations/${name}`], { encoding: 'utf8' });
      assert.equal(sha(source), checksum, 'Pinned historical origin source changed');
      return { name, checksum, statements: splitSqlStatements(source) };
    });
    const upgrade = await create(origin.label);
    if (origin.raw) {
      await upgrade.client.query('CREATE TABLE sofie_schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
      for (const migration of old) await driver(upgrade.client).transaction([
        ...migration.statements.map(sql => ({ sql })),
        { sql: 'INSERT INTO sofie_schema_migrations(name,checksum) VALUES($1,$2)', params: [migration.name, migration.checksum] },
      ]);
    } else await migrate(upgrade.client, old);
    const previous = (await upgrade.client.query('SELECT * FROM sofie_schema_migrations ORDER BY name')).rows;
    await migrate(upgrade.client);
    await migrate(upgrade.client);
    const after = (await upgrade.client.query('SELECT * FROM sofie_schema_migrations ORDER BY name')).rows;
    assert.deepEqual(after.filter(row => previous.some(oldRow => oldRow.name === row.name)), previous);
    assert.equal(schema(upgrade.name), freshSchema);
    if (origin.raw) assert(!after.some(row => row.name === '0030_action_binding_reconciliation.sql'), 'Do not fabricate execution of historically satisfied migration');
    check('exact historical ' + origin.label + ' bridge preserves applied ledger and converges to fresh schema', { source: origin.ref });
  }

  const recovering = await create('recover');
  const prefix = migrations.slice(0, -1), last = migrations.at(-1);
  await migrate(recovering.client, prefix);
  const beforeSchema = schema(recovering.name), beforeLedger = await ledger(recovering.client);
  await assert.rejects(migrate(recovering.client, [...prefix, { ...last, statements: [...last.statements, 'SELECT myapps_deliberate_failure()'] }]), /myapps_deliberate_failure/);
  assert.equal(schema(recovering.name), beforeSchema);
  assert.deepEqual(await ledger(recovering.client), beforeLedger);
  check('partial final migration rolls back every schema object and ledger write');
  // Disconnect the actual session after DDL and before commit; reconnect as a restarted runner.
  let interrupted = false;
  await assert.rejects(migrate(recovering.client, migrations, async statement => {
    if (statement.sql.includes('INSERT INTO sofie_schema_migrations')) {
      interrupted = true; await close(recovering.client); throw new Error('deliberate session interruption');
    }
  }), /deliberate session interruption/);
  assert(interrupted);
  recovering.client = await connect(recovering.name);
  assert.equal(schema(recovering.name), beforeSchema);
  assert.deepEqual(await ledger(recovering.client), beforeLedger);
  await migrate(recovering.client);
  assert.equal(schema(recovering.name), freshSchema);
  check('disconnected in-flight transaction recovers by canonical forward replay after restart');

  const concurrent = await create('concurrent');
  await migrate(concurrent.client, prefix);
  const rival = await connect(concurrent.name);
  let arrivals = 0, release;
  const rendezvous = new Promise(resolve => { release = resolve; });
  const barrier = async statement => {
    if (statement.sql.startsWith('LOCK TABLE sofie_schema_migrations')) {
      if (++arrivals === 2) release();
      let timer;
      try {
        await Promise.race([rendezvous, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Concurrent runner barrier timed out')), 5000); })]);
      } finally { clearTimeout(timer); }
    }
  };
  const outcomes = await Promise.allSettled([migrate(concurrent.client, migrations, barrier), migrate(rival, migrations, barrier)]);
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(r => r.status === 'rejected').length, 1);
  assert.match(outcomes.find(r => r.status === 'rejected').reason.message, /division by zero/);
  await migrate(rival);
  assert.deepEqual(await ledger(rival), expected);
  check('concurrent stale runner fails locked ledger comparison; rediscovery is idempotent');

  await fresh.client.query("UPDATE sofie_schema_migrations SET checksum=$1 WHERE name=$2", ['0'.repeat(64), last.name]);
  await assert.rejects(migrate(fresh.client), /lineage|checksum/i);
  await fresh.client.query('UPDATE sofie_schema_migrations SET checksum=$1 WHERE name=$2', [last.checksum, last.name]);
  await fresh.client.query('ALTER TABLE chat_files ALTER COLUMN owner_id SET DEFAULT \'wrong-owner\'');
  await assert.rejects(migrate(fresh.client), /schema has drifted/);
  await fresh.client.query('ALTER TABLE chat_files ALTER COLUMN owner_id DROP DEFAULT');
  await migrate(fresh.client);
  assert.equal(schema(fresh.name), freshSchema);
  check('checksum corruption and reconciled ownership schema drift fail closed');

  const factoryNames = readdirSync(join(factory, 'apps/cloud-control/migrations')).filter(n => n.endsWith('.sql')).sort();
  assert.equal(factoryNames.length, 12);
  for (const name of factoryNames) await driver(fresh.client).transaction([{ sql: readFileSync(join(factory, 'apps/cloud-control/migrations', name), 'utf8') }]);
  assert.equal((await fresh.client.query('SELECT environment FROM factory.environment')).rows[0].environment, 'staging');
  assert.equal((await fresh.client.query('SELECT count(*)::int n FROM factory.external_alpha_host_registration')).rows[0].n, 0);
  assert.equal((await fresh.client.query('SELECT count(*)::int n FROM factory.production_work_authority')).rows[0].n, 0);
  assert.deepEqual(await ledger(fresh.client), expected);
  check('all 12 Factory schemas coexist with application schema without authority or host registration');
  const factorySchema = schema(fresh.name), factoryRows = await snapshot(fresh.client);
  // Migration 012 contains non-idempotent DDL. Atomic replay rejects duplication,
  // and interruption cannot leave a partially applied host-registration boundary.
  const factoryLast = readFileSync(join(factory, 'apps/cloud-control/migrations', factoryNames.at(-1)), 'utf8');
  await assert.rejects(driver(fresh.client).transaction([{ sql: factoryLast }]), /already exists/);
  assert.equal(schema(fresh.name), factorySchema);
  assert.deepEqual(await snapshot(fresh.client), factoryRows);
  const factoryUpgrade = await create('factory');
  for (const name of factoryNames.slice(0, -1)) await driver(factoryUpgrade.client).transaction([{ sql: readFileSync(join(factory, 'apps/cloud-control/migrations', name), 'utf8') }]);
  const factoryBefore = schema(factoryUpgrade.name), factoryPreviousRows = await snapshot(factoryUpgrade.client);
  await assert.rejects(driver(factoryUpgrade.client).transaction([{ sql: factoryLast }, { sql: 'SELECT myapps_deliberate_factory_failure()' }]), /myapps_deliberate_factory_failure/);
  assert.equal(schema(factoryUpgrade.name), factoryBefore);
  assert.deepEqual(await snapshot(factoryUpgrade.client), factoryPreviousRows);
  await driver(factoryUpgrade.client).transaction([{ sql: factoryLast }]);
  assert.equal((await factoryUpgrade.client.query('SELECT count(*)::int n FROM factory.external_alpha_host_registration')).rows[0].n, 0);
  check('Factory 011 to 012 forward recovery is atomic; duplicate 012 fails without mutation');

  // The central database is intentionally separate. Its base SQL must not replay on history.
  const central = await create('central');
  const centralSource = readFileSync(join(eve, 'apps/eve/lib/external-alpha/shared-accounting.sql'), 'utf8');
  const recoverySource = readFileSync(join(eve, 'apps/eve/lib/external-alpha/shared-accounting-recovery.sql'), 'utf8');
  await driver(central.client).transaction([{ sql: centralSource }, { sql: recoverySource }]);
  const cohort = randomUUID(), owner = randomUUID(), admission = randomUUID();
  await central.client.query('INSERT INTO external_alpha_cohort(id) VALUES($1)', [cohort]);
  await central.client.query("INSERT INTO external_alpha_cohort_member VALUES($1,'1',$2,$3,$4)", [cohort, owner, 'a'.repeat(64), 'b'.repeat(64)]);
  await central.client.query("INSERT INTO external_alpha_cohort_admission(id,cohort_id,owner_id,policy_sha256,kind,binding_sha256,request_sha256,day_index,ceiling_microusd,state,deadline) VALUES($1,$2,$3,$4,'WORK',$5,$6,0,1300000,'UNKNOWN',now()+interval '1 day')", [admission, cohort, owner, 'a'.repeat(64), 'c'.repeat(64), 'd'.repeat(64)]);
  const accounting = await snapshot(central.client);
  await assert.rejects(driver(central.client).transaction([{ sql: centralSource }]), /already exists/);
  assert.deepEqual(await snapshot(central.client), accounting);
  await driver(central.client).transaction([{ sql: recoverySource }]);
  assert.deepEqual(await snapshot(central.client), accounting);
  assert.equal((await fresh.client.query("SELECT to_regclass('external_alpha_cohort') AS relation")).rows[0].relation, null);
  check('central base replay is rejected atomically; recovery SQL preserves UNKNOWN 1300000 exposure in separate database');

  // Populate two owners and immutable evidence before restoring, not just an empty schema.
  for (const ownerId of ['fixture-owner-a', 'fixture-owner-b']) {
    await fresh.client.query('INSERT INTO myapps_installations VALUES($1,$2,$3,$4)', [ownerId, 'fixture-app', 'migration-fixture', JSON.stringify({ ownerId, appId: 'fixture-app' })]);
    await fresh.client.query("INSERT INTO myapps_audit(owner_id,app_id,action,actor,evidence) VALUES($1,'fixture-app','restore-fixture',$1,'{}')", [ownerId]);
  }
  for (const original of [fresh, central]) {
    const target = await create('restore');
    const backup = join(temporary, original.name + '.dump');
    execFileSync('pg_dump', ['--format=custom', '--no-owner', '--file', backup, fixtureUrl(original.name)], { stdio: 'pipe' });
    execFileSync('pg_restore', ['--exit-on-error', '--single-transaction', '--no-owner', '--dbname', fixtureUrl(target.name), backup], { stdio: 'pipe' });
    assert.equal(schema(target.name), schema(original.name));
    assert.deepEqual(await snapshot(target.client), await snapshot(original.client));
    if (original === fresh) {
      await migrate(target.client);
      const role = 'myapps_fixture_' + randomUUID().replaceAll('-', '');
      await admin.query(`CREATE ROLE "${role}" NOLOGIN`); roles.push(role);
      await target.client.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
      await target.client.query(`GRANT SELECT,INSERT ON myapps_installations TO "${role}"`);
      await target.client.query(`SET ROLE "${role}"`);
      await target.client.query("SELECT set_config('myeve.myapps_owner','fixture-owner-a',false)");
      assert.deepEqual((await target.client.query('SELECT owner_id FROM myapps_installations')).rows, [{ owner_id: 'fixture-owner-a' }]);
      await assert.rejects(target.client.query("INSERT INTO myapps_installations VALUES('fixture-owner-b','foreign','foreign','{\"ownerId\":\"fixture-owner-b\",\"appId\":\"foreign\"}')"), /row-level security/);
      await target.client.query('RESET ROLE');
      await assert.rejects(target.client.query("UPDATE myapps_audit SET action='tampered'"), /immutable/);
      check('restored application enforces owner RLS and immutable evidence');
    } else {
      await assert.rejects(target.client.query("UPDATE external_alpha_cohort_admission SET state='BOUND'"), /immutable|check constraint/);
      assert.equal((await target.client.query("SELECT sum(ceiling_microusd)::text amount FROM external_alpha_cohort_admission WHERE state='UNKNOWN'")).rows[0].amount, '1300000');
      check('restored central history retains UNKNOWN fence and full accounting exposure');
    }
    check('real backup and restore retain full schema, ACLs, all rows and migration evidence', { sourceDatabase: original === fresh ? 'application-and-factory' : 'central-accounting', backupSha256: sha(readFileSync(backup)) });
  }
  result.status = 'PASS';
} catch (error) {
  result.status = 'FAIL'; result.error = error.stack; throw error;
} finally {
  const cleanupErrors = [];
  const cleanup = async action => { try { await action(); } catch (error) { cleanupErrors.push(error.message); } };
  for (const client of clients) await cleanup(() => close(client));
  let removed = 0;
  for (const name of names.reverse()) await cleanup(async () => { await admin.query(`DROP DATABASE "${name}"`); removed++; });
  for (const role of roles) await cleanup(() => admin.query(`DROP ROLE "${role}"`));
  await cleanup(() => admin.end());
  await cleanup(() => rmSync(temporary, { recursive: true, force: true }));
  result.disposableDatabasesRemoved = removed;
  if (cleanupErrors.length) { result.status = 'FAIL'; result.cleanupErrors = cleanupErrors; }
  writeFileSync(receipt, JSON.stringify(result, null, 2) + '\n');
  assert.equal(cleanupErrors.length, 0, 'Disposable fixture cleanup failed; inspect receipt');
}
