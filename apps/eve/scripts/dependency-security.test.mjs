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
