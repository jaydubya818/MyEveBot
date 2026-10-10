import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('PostgreSQL tool failure never exports credentials and ignores inherited libpq routing', () => {
  assert.equal(process.env.MYAPPS_MIGRATION_REHEARSAL, '1');
  const eve = resolve(process.env.MYEVE_SOURCE_ROOT || process.cwd());
  assert(process.env.MYFACTORY_SOURCE_ROOT);
  const factory = resolve(process.env.MYFACTORY_SOURCE_ROOT);
  const url = new URL(process.env.MYAPPS_POSTGRES_URL);
  // A fixture with an empty password uses trust authentication. Hosted fixtures
  // retain their configured password; this does not change a database credential.
  if (!url.password) url.password = 'synthetic_failure_path_secret';
  const secret = decodeURIComponent(url.password), directory = mkdtempSync(join(tmpdir(), 'myapps-pg-failure-'));
  try {
    const marker = join(directory, 'routing-checked');
    const receipt = join(directory, 'receipt.json');
    writeFileSync(join(directory, 'pg_dump'), `#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
assert.equal(process.env.PGHOSTADDR, undefined);
assert.equal(process.env.PGSERVICE, undefined);
assert.equal(process.env.PGSERVICEFILE, undefined);
assert(['127.0.0.1', 'localhost', '::1'].includes(process.env.PGHOST));
assert(!process.argv.some(arg => arg.includes(process.env.PGPASSWORD) || arg.includes('postgresql://')));
fs.writeFileSync(${JSON.stringify(marker)}, 'PASS');
process.stdout.write(process.env.PGPASSWORD);
process.stderr.write(process.env.PGPASSWORD);
process.exit(13);
`, { mode: 0o700 });
    const child = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./migration-recovery.mjs', import.meta.url)), eve, factory, receipt], {
      cwd: eve, encoding: 'utf8', timeout: 60000,
      env: { ...process.env, MYAPPS_POSTGRES_URL: url.href, PATH: directory + ':' + process.env.PATH,
        PGHOSTADDR: '192.0.2.1', PGSERVICE: 'forbidden-inherited-service', PGSERVICEFILE: '/nonexistent/forbidden-service' },
    });
    assert.equal(child.error, undefined);
    assert.equal(child.status, 1);
    assert(existsSync(marker), 'Child checked the complete fixture connection boundary');
    const body = readFileSync(receipt, 'utf8'), result = JSON.parse(body);
    assert.equal(result.status, 'FAIL');
    assert.equal(result.disposableDatabasesRemoved, 1);
    assert.match(result.error, /pg_dump qualification failed \(exit 13\); child output withheld/);
    for (const output of [body, child.stdout, child.stderr]) {
      assert(!output.includes(secret), 'Credential leaked in failure evidence');
      assert(!output.includes(url.href), 'Connection URL leaked in failure evidence');
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
