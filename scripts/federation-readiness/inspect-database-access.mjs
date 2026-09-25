// Metadata-only. Never emit connection URLs, passwords, owner rows or raw errors.
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../../relay-production-readiness/package.json', import.meta.url));
const { Client } = require('pg');
const sources = { myeve: '/Users/jaywest/Myeve/apps/eve/.env.local', relay: '/Users/jaywest/relay/.env.local' };
const report = { scope: 'read-only database metadata; no owner data', databases: {} };
for (const [name, path] of Object.entries(sources)) {
  let client;
  try {
    const environment = parseEnv(readFileSync(path, 'utf8'));
    const connectionString = environment.DATABASE_URL_UNPOOLED ?? environment.POSTGRES_URL_NON_POOLING ?? environment.RELAY_DATABASE_URL ?? environment.DATABASE_URL;
    const url = new URL(connectionString);
    client = new Client({ connectionString, connectionTimeoutMillis: 10000, query_timeout: 10000 });
    await client.connect();
    const { rows: [row] } = await client.query("SELECT current_setting('server_version') AS version, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname=current_user");
    report.databases[name] = { status: 'METADATA_READ', endpointFingerprint: createHash('sha256').update(url.hostname).digest('hex'), serverVersion: row.version, canCreateDatabase: row.rolcreatedb, canCreateRole: row.rolcreaterole };
  } catch { report.databases[name] = { status: 'METADATA_UNAVAILABLE' }; }
  finally { await client?.end().catch(() => {}); }
}
console.log(JSON.stringify(report, null, 2));
