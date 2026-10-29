import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import path from 'node:path';

// Execute the actual preload in a VM with inert native transport dependencies.
// No app imports, sockets, SQL or provider requests occur in these unit tests.
const source = readFileSync(new URL('./owner-chat-only/transport.cjs', import.meta.url), 'utf8');
const topology = {
  appUrl: 'postgresql://fixture@localhost:56490/ea_work_0123456789abcdef0123456789abcdef?host=%3A%3A1',
  centralUrl: 'postgresql://fixture@localhost:56490/ea_work_fedcba9876543210fedcba9876543210?host=%3A%3A1',
  pgPort: 56490, webPort: 32831, evePort: 32832, modelPort: 32833,
  ipcDirectory: '/fixture/ipc',
};
const origin = 'http://127.0.0.1:32832';
const callback = '/.well-known/workflow/v1/flow';

function fixture() {
  const forwarded = [];
  let dispatcher;
  const nativeHttp = Object.fromEntries(['http', 'https'].map(protocol => [protocol,
    Object.fromEntries(['request', 'get'].map(method => [method, (...args) => {
      forwarded.push({ transport: protocol, method, args }); return {};
    }]))]));
  const modules = {
    'node:fs': { readFileSync(file, encoding) {
      assert.equal(file, '/fixture/topology.json'); assert.equal(encoding, 'utf8');
      return JSON.stringify(topology);
    } },
    'node:path': path,
    'node:net': { Socket: class { connect() { throw Error('UNIT_NATIVE_SOCKET_FORBIDDEN'); } } },
    pg: { Pool: class { connect() { throw Error('UNIT_SQL_FORBIDDEN'); } } },
    '@neondatabase/serverless': { neonConfig: { fetchEndpoint: () => 'https://localhost/sql' } },
    undici: {
      Dispatcher: class {},
      Agent: class { dispatch(options) { forwarded.push({ transport: 'undici', options }); return true; } },
      setGlobalDispatcher(value) { dispatcher = value; },
    },
    'node:http': nativeHttp.http,
    'node:https': nativeHttp.https,
  };
  const context = vm.createContext({
    URL, Request, Response, Headers,
    process: { env: { DATABASE_URL: topology.appUrl, MYEVE_EXTERNAL_ALPHA_ACCOUNTING_DATABASE_URL: topology.centralUrl,
      MYEVE_CHAT_ONLY_TRANSPORT_FILE: '/fixture/topology.json' } },
    require(name) { assert.ok(Object.hasOwn(modules, name), 'Unexpected native dependency'); return modules[name]; },
    fetch: async (input, init) => { forwarded.push({ transport: 'fetch', input, init }); return new Response('owned'); },
  });
  vm.runInContext(source, context, { filename: 'owner-chat-only/transport.cjs' });
  return { fetch: context.fetch, dispatcher, http: nativeHttp.http, forwarded };
}

test('ordinary workflow callback reaches only its exact owned Eve origin', async () => {
  const f = fixture();
  assert.equal(await (await f.fetch(origin + callback, { method: 'POST', body: '{}' })).text(), 'owned');
  assert.equal(f.forwarded.length, 1);
  assert.equal(f.forwarded[0].input, origin + callback);
});

test('workflow callback rejects other methods, routes, query and fragments', async () => {
  const f = fixture();
  for (const method of ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE'])
    await assert.rejects(f.fetch(origin + callback, { method }), /CHAT_FIXTURE_FOREIGN_FETCH_DENIED/);
  for (const suffix of [callback + '?__health', callback + '?x=1', callback + '#x', callback + '/',
    '/.well-known/workflow/v1/manifest.json', '/.well-known/workflow/v1/webhook/example', '/.well-known/workflow/v2/flow'])
    await assert.rejects(f.fetch(origin + suffix, { method: 'POST' }), /CHAT_FIXTURE_FOREIGN_FETCH_DENIED/);
  assert.equal(f.forwarded.length, 0);
});

test('workflow callback rejects aliases, another owner port and external origins', async () => {
  const f = fixture();
  for (const other of ['http://localhost:32832', 'http://127.0.0.1:32835', 'http://127.0.0.1:32831',
    'http://127.0.0.1:32833', 'https://127.0.0.1:32832', 'https://example.invalid'])
    await assert.rejects(f.fetch(other + callback, { method: 'POST' }), /CHAT_FIXTURE_FOREIGN_FETCH_DENIED/);
  assert.equal(f.forwarded.length, 0);
});

test('native HTTP and Undici enforce the same exact callback policy', () => {
  const f = fixture();
  f.http.request(origin + callback, { method: 'POST' });
  assert.equal(f.dispatcher.dispatch({ origin, path: callback, method: 'POST' }, {}), true);
  for (const pathname of [callback + '?x=1', '/.well-known/workflow/v1/manifest.json']) {
    assert.throws(() => f.http.request(origin + pathname, { method: 'POST' }), /CHAT_FIXTURE_FOREIGN_NODE_HTTP_DENIED/);
    assert.throws(() => f.dispatcher.dispatch({ origin, path: pathname, method: 'POST' }, {}), /CHAT_FIXTURE_FOREIGN_HTTP_DENIED/);
  }
  assert.throws(() => f.http.get(origin + callback), /CHAT_FIXTURE_FOREIGN_NODE_HTTP_DENIED/);
  assert.equal(f.forwarded.length, 2);
});

test('existing local health and model requests remain permitted; Work stays denied', async () => {
  const f = fixture();
  await f.fetch(origin + '/eve/v1/health');
  await f.fetch('http://127.0.0.1:32833/model', { method: 'POST' });
  await assert.rejects(f.fetch('http://127.0.0.1:32831/api/work', { method: 'POST' }), /CHAT_FIXTURE_FOREIGN_FETCH_DENIED/);
  assert.equal(f.forwarded.length, 2);
});
