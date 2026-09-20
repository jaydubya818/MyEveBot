// Requires separate explicit operator authorization. No production rows are copied.
import { readFileSync, writeFileSync, mkdtempSync, chmodSync, rmSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomBytes, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../../relay-production-readiness/package.json', import.meta.url));
const { Client } = require('pg');
if (!process.argv.includes('--create-empty-synthetic-databases')) throw new Error('Explicit provisioning flag required.');
const directory = mkdtempSync('/private/tmp/fq-target-secrets-'); chmodSync(directory, 0o700);
const suffix = randomBytes(6).toString('hex');
const created = [];
const report = { status: 'PENDING', secretReferenceDirectory: directory, databases: [], noCanonicalDataCopied: true };
try {
  for (const name of ['myeve', 'peer', 'relay']) {
    const source = name === 'relay' ? '/Users/jaywest/relay/.env.local' : '/Users/jaywest/Myeve/apps/eve/.env.local';
    const env = parseEnv(readFileSync(source, 'utf8'));
    const connectionString = env.DATABASE_URL_UNPOOLED ?? env.POSTGRES_URL_NON_POOLING ?? env.RELAY_DATABASE_URL ?? env.DATABASE_URL;
    const admin = new Client({ connectionString, connectionTimeoutMillis: 10000, query_timeout: 15000 });
    await admin.connect();
    const database = `fq_${name}_${suffix}`; const role = `${database}_app`; const password = randomBytes(32).toString('hex');
    const state = { admin, database, role, attempted: true }; created.push(state);
    await admin.query(`CREATE ROLE ${role} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}'`);
    const { rows: [privileges] } = await admin.query('SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname=$1', [role]);
    if (Object.values(privileges).some(Boolean)) throw new Error('Unexpected privileges');
    const { rows: [access] } = await admin.query("SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f') AND has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE')", [role]);
    if (access.count !== 0) throw new Error('Existing data privileges');
    await admin.query(`CREATE DATABASE ${database} OWNER ${role} TEMPLATE template0`);
    await admin.query(`REVOKE ALL ON DATABASE ${database} FROM PUBLIC`);
    const target = new URL(connectionString); target.username = role; target.password = password; target.pathname = `/${database}`; target.searchParams.set('sslmode', 'verify-full');
    const client = new Client({ connectionString: target.toString(), connectionTimeoutMillis: 10000, query_timeout: 10000 });
    try { await client.connect(); const result = await client.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public'"); if (result.rows[0].count !== 0) throw new Error('Not empty'); }
    finally { await client.end().catch(() => {}); }
    writeFileSync(`${directory}/${name}.json`, JSON.stringify({ databaseUrl: target.toString() }), { mode: 0o600 });
    report.databases.push({ component: name, database, role, endpointFingerprint: createHash('sha256').update(target.hostname).digest('hex'), publicTables: 0, existingPublicTablePrivileges: 0, publicConnectRevoked: true });
  }
  for (const [source, other] of [['myeve', 'peer'], ['peer', 'myeve']]) {
    const target = new URL(JSON.parse(readFileSync(`${directory}/${source}.json`, 'utf8')).databaseUrl);
    target.pathname = `/${report.databases.find(d => d.component === other).database}`;
    const client = new Client({ connectionString: target.toString(), connectionTimeoutMillis: 10000 });
    let denied = false;
    try { await client.connect(); } catch (error) { denied = error.code === '42501'; }
    finally { await client.end().catch(() => {}); }
    if (!denied) throw new Error('Cross-database denial not proven');
  }
  report.crossCredentialMyEvePeerConnection = 'DENIED_BOTH_DIRECTIONS'; report.status = 'EMPTY_ISOLATED_DATABASES_CREATED';
} catch {
  report.status = 'FAILED'; report.cleanup = [];
  for (const item of created.toReversed()) {
    try {
      // Names are unique to this invocation and generated internally, never user input.
      await item.admin.query(`DROP DATABASE IF EXISTS ${item.database} WITH (FORCE)`);
      await item.admin.query(`DROP ROLE IF EXISTS ${item.role}`);
      report.cleanup.push({ database: item.database, role: item.role, status: 'REMOVED' });
    } catch { report.cleanup.push({ database: item.database, role: item.role, status: 'OPERATOR_CLEANUP_REQUIRED' }); }
  }
  rmSync(directory, { recursive: true, force: true }); report.secretReferenceDirectory = null; process.exitCode = 1;
} finally { await Promise.all(created.map(item => item.admin.end().catch(() => {}))); }
console.log(JSON.stringify(report, null, 2));
