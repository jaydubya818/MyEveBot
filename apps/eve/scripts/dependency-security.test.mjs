import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);

test('IPv4-mapped proxy trust cannot make an arbitrary client trusted', () => {
  const proxyaddr = require('proxy-addr');
  assert.equal(proxyaddr.compile('::ffff:10.0.0.0/8')('198.51.100.1'), false);
  assert.equal(proxyaddr.compile('10.0.0.0/8')('10.1.2.3'), true);
  assert.equal(proxyaddr.compile('10.0.0.0/8')('198.51.100.1'), false);
});

test('LangChain telemetry retains its LangSmith imports without a provider operation', async () => {
  const tree = await import('langsmith/run_trees');
  const singleton = await import('langsmith/singletons/traceable');
  const tracing = await import('@langchain/core/tracers/tracer_langchain');
  assert.equal(typeof tree.RunTree, 'function');
  assert.equal(typeof singleton.getCurrentRunTree, 'function');
  assert.equal(typeof tracing.LangChainTracer, 'function');
  const run = new tree.RunTree({ name: 'offline-compatibility', run_type: 'chain', inputs: {} });
  assert.equal(run.name, 'offline-compatibility');
});

test('removing the generator preserves the exact licensed stylesheet', async () => {
  const css = await readFile(new URL('../app/vendor/shadcn/tailwind.css', import.meta.url));
  assert.equal(createHash('sha256').update(css).digest('hex'), 'bc7d83425702955b4cb67cb14ede9d603f9d912376d57a2d81d661094d2a782a');
  const license = await readFile(new URL('../app/vendor/shadcn/LICENSE.md', import.meta.url), 'utf8');
  assert.match(license, /MIT License/);
  assert.match(license, /Copyright/);
});

const root = new URL('../../../', import.meta.url);

test('sprintf mitigation rejects amplification before invoking argument callbacks', async () => {
  const { sprintf } = require('../../../patches/sprintf-js-1.1.3.js');
  let invoked = false;
  for (const format of ['%999999999999s', '%.999999999999s', '%.101f', '%.101e', '%.101g']) {
    assert.throws(() => sprintf(format, () => { invoked = true; return 1; }), /limit exceeded/);
  }
  assert.equal(invoked, false);
  assert.throws(() => sprintf('x'.repeat(1048577)), /format limit/);
  assert.throws(() => sprintf('%600000s%600000s', 'a', 'b'), /output limit/);
  assert.equal(sprintf('%+06d %.2f %s %%', 12, 1.25, 'ok'), '+00012 1.25 ok %');
  assert.equal(sprintf('%(name)s', { name: 'owner' }), 'owner');
});

test('installed node and browser sprintf entries match the reviewed patch', async () => {
  const manifest = JSON.parse(await readFile(new URL('patches/sprintf-js-1.1.3.json', root), 'utf8'));
  for (const file of manifest.files) {
    const bytes = await readFile(new URL(`node_modules/sprintf-js/${file.path}`, root));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.patchedSha256);
    const { sprintf } = require(`../../../node_modules/sprintf-js/${file.path}`);
    assert.throws(() => sprintf('%99999999999s', 'x'), /limit exceeded/);
    assert.equal(sprintf('%04d', 12), '0012');
  }
});

test('the actual just-bash printf consumer retains formatting and bounds malicious width', async () => {
  const { Bash } = await import('just-bash');
  const bash = new Bash();
  const normal = await bash.exec("printf '%04d %s' 12 ok");
  assert.equal(normal.exitCode, 0);
  assert.equal(normal.stdout, '0012 ok');
  const hostile = await bash.exec("printf '%99999999999s' x");
  assert.notEqual(hostile.exitCode, 0);
  assert.ok(hostile.stdout.length + hostile.stderr.length < 4096);
});

test('all installed legacy UUID copies reject writes past the supplied output buffer', async () => {
  const lock = JSON.parse(await readFile(new URL('package-lock.json', root), 'utf8'));
  const copies = Object.entries(lock.packages).filter(([key, value]) => key.endsWith('node_modules/uuid') && value.version === '11.1.1');
  assert.ok(copies.length > 0);
  for (const [key] of copies) {
    const { v3, v5 } = require(new URL(`${key}/dist/cjs/index.js`, root).pathname);
    for (const generate of [v3, v5]) {
      assert.throws(() => generate('bounded', generate.DNS, new Uint8Array(15)), /bounds|length/i);
      assert.match(generate('bounded', generate.DNS), /^[0-9a-f-]{36}$/);
    }
  }
});

test('all affected OpenTelemetry copies bound untrusted inbound baggage', async () => {
  const { ROOT_CONTEXT, propagation, defaultTextMapGetter } = require('@opentelemetry/api');
  const lock = JSON.parse(await readFile(new URL('package-lock.json', root), 'utf8'));
  const copies = Object.entries(lock.packages).filter(([key]) => key.endsWith('node_modules/@opentelemetry/core'));
  assert.ok(copies.length > 0);
  for (const [key] of copies) {
    const { W3CBaggagePropagator } = require(new URL(`${key}/build/src/index.js`, root).pathname);
    const parser = new W3CBaggagePropagator();
    const header = Array.from({ length: 300 }, (_, i) => `key${i}=value`).join(',');
    const extracted = parser.extract(ROOT_CONTEXT, { baggage: header }, defaultTextMapGetter);
    assert.ok(propagation.getBaggage(extracted).getAllEntries().length <= 180);
    const oversized = parser.extract(ROOT_CONTEXT, { baggage: `key=${'x'.repeat(9000)}` }, defaultTextMapGetter);
    assert.equal(propagation.getBaggage(oversized), undefined);
    const normal = parser.extract(ROOT_CONTEXT, { baggage: 'owner=synthetic' }, defaultTextMapGetter);
    assert.equal(propagation.getBaggage(normal).getEntry('owner').value, 'synthetic');
  }
});

test('patch application is idempotent and rejects missing, drifted, or replaced identities', async () => {
  const { mkdtemp, mkdir, cp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const fixture = await mkdtemp(join(tmpdir(), 'myeve-security-patch-test-'));
  try {
    await mkdir(join(fixture, 'scripts/security'), { recursive: true });
    await cp(new URL('scripts/security/apply-dependency-patches.mjs', root), join(fixture, 'scripts/security/apply-dependency-patches.mjs'));
    await cp(new URL('patches', root), join(fixture, 'patches'), { recursive: true });
    await cp(new URL('node_modules/sprintf-js', root), join(fixture, 'node_modules/sprintf-js'), { recursive: true });
    await writeFile(join(fixture, 'package-lock.json'), JSON.stringify({ packages: { 'node_modules/sprintf-js': { version: '1.1.3' } } }));
    const run = (...args) => spawnSync(process.execPath, ['scripts/security/apply-dependency-patches.mjs', ...args], { cwd: fixture, encoding: 'utf8' });
    assert.equal(run().status, 0);
    assert.equal(run('--check').status, 0);
    await writeFile(join(fixture, 'node_modules/sprintf-js/src/sprintf.js'), '// changed');
    assert.match(run().stderr, /Unexpected dependency bytes/);
    await rm(join(fixture, 'node_modules/sprintf-js/src/sprintf.js'));
    assert.notEqual(run('--check').status, 0);
    await writeFile(join(fixture, 'package-lock.json'), JSON.stringify({ packages: { 'node_modules/sprintf-js': { version: '1.1.4' } } }));
    assert.match(run().stderr, /identity changed/);
  } finally { await rm(fixture, { recursive: true, force: true }); }
});
