// Ordinary-only child. No modes, fault injection, replay or production authority.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { once } from 'node:events';
import { readFileSync, writeFileSync, lstatSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve, sep } from 'node:path';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { Client, Pool } from 'pg';
import { neonConfig } from '@neondatabase/serverless';
import { Agent, Dispatcher, setGlobalDispatcher } from 'undici';

function assertOrdinaryChildEnvironment(environment, platform, uid) {
  const allowed = new Set(['PATH', 'HOME', 'USER', 'TMPDIR', 'NODE_ENV', 'NODE_EXTRA_CA_CERTS', 'MYEVE_RELAY_ORDINARY_SPEC']);
  const unexpected = Object.keys(environment).filter(key => {
    if (allowed.has(key)) return false;
    if (key !== '__CF_USER_TEXT_ENCODING' || platform !== 'darwin') return true;
    const value = environment[key];
    if (typeof value !== 'string' || value.length > 128) return true;
    const fields = /^0x([0-9a-f]+):0x([0-9a-f]+):0x([0-9a-f]+)$/i.exec(value);
    return !fields || Number.parseInt(fields[1], 16) !== uid;
  }).sort();
  if (unexpected.length) throw Error('ORDINARY_CHILD_UNEXPECTED_ENV_KEYS:' + JSON.stringify(unexpected));
}

assert.ok(process.send, 'Private parent IPC required');
const specPath = process.env.MYEVE_RELAY_ORDINARY_SPEC;
const file = lstatSync(specPath); assert.equal(file.uid, process.getuid()); assert.equal(file.mode & 0o777, 0o600); assert.equal(file.isSymbolicLink(), false);
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
assert.equal(realpathSync(fileURLToPath(import.meta.url)), realpathSync(join(spec.myEve.copy, 'apps/eve/test/relay-mcp-memory-ordinary.integration.mjs')));
assert.equal(spec.version, 1);
const adminUrl = new URL(spec.postgres.adminUrl), pgPort = Number(adminUrl.port);
assert.equal(adminUrl.protocol, 'postgresql:'); assert.equal(adminUrl.hostname, '127.0.0.1');
assert.equal(adminUrl.username, 'mcp_fixture'); assert.equal(adminUrl.pathname, '/mcp_ordinary'); assert.ok(adminUrl.password.length >= 24 && !adminUrl.search && !adminUrl.hash);
assert.ok(Number.isInteger(pgPort) && pgPort > 1024 && pgPort < 65536);
assert.equal(process.env.NODE_EXTRA_CA_CERTS, spec.tls.certificatePath);
assert.equal(createHash('sha256').update(readFileSync(spec.tls.certificatePath)).digest('hex'), spec.tls.certificateSha256);
assertOrdinaryChildEnvironment(process.env, process.platform, process.getuid());
const origin = `https://127.0.0.1:${spec.tls.port}`;
let deniedTransport = 0;
let unexpectedFailure = '';
const pendingVerdicts = new Map();
function stopUnexpected(reason) {
  unexpectedFailure ||= reason;
  for (const pending of pendingVerdicts.values()) { clearTimeout(pending.timer); pending.reject(Error(unexpectedFailure)); }
  pendingVerdicts.clear();
}
function assertNoUnexpectedFailure() { assert.equal(unexpectedFailure, '', 'Ordinary fixture stopped after unexpected infrastructure/transport failure'); }
const deny = () => { deniedTransport++; stopUnexpected('ORDINARY_CHILD_FOREIGN_TRANSPORT'); throw Error(unexpectedFailure); };
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const options = typeof first === 'object' ? first : { port: first, host: args[1] };
  if (options.path ? !resolve(options.path).startsWith(resolve(spec.privateDirectory, 'tmp') + sep) :
    options.host !== '127.0.0.1' || ![pgPort, spec.tls.port].includes(Number(options.port))) return deny();
  return Reflect.apply(connect, this, args);
};
const allowedHttp = (url, method) => url.href === origin + '/mcp' && method === 'POST';
for (const module of [http, https]) for (const name of ['request', 'get']) {
  const original = module[name];
  module[name] = function (input, ...args) {
    const options = input instanceof URL || typeof input === 'string' ? args[0] ?? {} : input;
    const url = input instanceof URL || typeof input === 'string' ? new URL(input) :
      new URL(`${options.protocol ?? (module === http ? 'http:' : 'https:')}//${options.hostname ?? options.host}:${options.port ?? (module === http ? 80 : 443)}${options.path ?? '/'}`);
    if (!allowedHttp(url, String(options.method ?? 'GET').toUpperCase())) return deny();
    return Reflect.apply(original, this, [input, ...args]);
  };
}
const agent = new Agent();
class OwnedDispatcher extends Dispatcher {
  dispatch(options, handler) {
    if (!allowedHttp(new URL(options.path, String(options.origin)), String(options.method ?? 'GET').toUpperCase())) return deny();
    return agent.dispatch(options, handler);
  }
}
setGlobalDispatcher(new OwnedDispatcher());
process.send({ type: 'ready' });
const [fixture] = await once(process, 'message');
assert.equal(fixture.type, 'fixture'); assert.equal(fixture.origin, origin); assert.equal(fixture.agents.length, 2);
assert.notEqual(fixture.agents[0].accountId, fixture.agents[1].accountId); assert.notEqual(fixture.agents[0].credential, fixture.agents[1].credential);
process.on('message', message => {
  if (message?.type === 'parent-unexpected-failure') {
    stopUnexpected('ORDINARY_PARENT_UNEXPECTED_FAILURE');
  }
  if (message?.type === 'private-denial-verdict') {
    const pending = pendingVerdicts.get(message.requestId);
    if (!pending || message.verified !== true) { stopUnexpected('ORDINARY_INVALID_PRIVATE_DENIAL_VERDICT'); return; }
    clearTimeout(pending.timer); pendingVerdicts.delete(message.requestId); pending.resolve();
  }
});
async function verifyActualPrivateDenial(owner, memoryId) {
  assertNoUnexpectedFailure();
  await new Promise((resolve, reject) => {
    const requestId = randomUUID();
    const timer = setTimeout(() => stopUnexpected('ORDINARY_PRIVATE_DENIAL_VERDICT_DEADLINE'), 5000);
    pendingVerdicts.set(requestId, { resolve, reject, timer });
    process.send({ type: 'verify-private-denial', requestId, owner, memoryId }, error => {
      if (error) stopUnexpected('ORDINARY_PRIVATE_DENIAL_IPC_FAILED');
    });
  });
  assertNoUnexpectedFailure();
}
const native = new Client({ connectionString: adminUrl.href, connectionTimeoutMillis: 5000, query_timeout: 5000 });
const databaseName = 'myeve_mcp_ordinary_' + randomUUID().replaceAll('-', '');
const nativeApp = new URL(adminUrl); nativeApp.pathname = '/' + databaseName;
const logicalApp = new URL(nativeApp); logicalApp.hostname = 'localhost';
const pool = new Pool({ connectionString: nativeApp.href, max: 4, connectionTimeoutMillis: 5000, query_timeout: 10000 });
const endpoint = typeof neonConfig.fetchEndpoint === 'function' ? neonConfig.fetchEndpoint(logicalApp.hostname, logicalApp.port) : neonConfig.fetchEndpoint;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const connection = headers.get('Neon-Connection-String');
  if (connection) {
    if (new URL(connection).href !== logicalApp.href || target !== endpoint || init?.method !== 'POST') return deny();
    const body = JSON.parse(init.body), client = await pool.connect();
    try {
      if (body.queries) await client.query('BEGIN');
      const results = [];
      for (const item of body.queries ?? [body]) {
        const result = await client.query({ text: item.query, values: item.params, rowMode: 'array', types: { getTypeParser: () => value => value } });
        results.push({ fields: result.fields, rows: result.rows, rowCount: result.rowCount, command: result.command });
      }
      if (body.queries) await client.query('COMMIT');
      return Response.json(body.queries ? { results } : results[0]);
    } catch (error) {
      if (body.queries) await client.query('ROLLBACK');
      return Response.json({ message: 'Owned fixture SQL failed', code: error.code }, { status: 400 });
    } finally { client.release(); }
  }
  if (!allowedHttp(new URL(target), String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase())) return deny();
  return originalFetch(input, init);
};
let created = false, connected = false, passed = false;
let phase = 'owned-cluster-preflight';
const owners = [randomUUID(), randomUUID()], agents = [randomUUID(), randomUUID()];
const contents = owners.map(() => 'SYNTHETIC_PRIVATE_MEMORY_' + randomUUID());
const keys = [], results = [], memoryIds = [];
const sentinel = 'SYNTHETIC_OWNER_COOKIE_MUST_NEVER_LEAVE';
try {
  await native.connect(); connected = true;
  const row = (await native.query("SELECT current_user AS role,current_database() AS database,system_identifier::text,host(inet_server_addr()) AS address,inet_server_port() AS port,current_setting('server_encoding') AS encoding FROM pg_control_system()")).rows[0];
  assert.deepEqual(row, { role: 'mcp_fixture', database: 'mcp_ordinary', system_identifier: spec.postgres.systemIdentifier, address: '127.0.0.1', port: pgPort, encoding: 'UTF8' });
  await native.query(`CREATE DATABASE ${databaseName}`); created = true;
  phase = 'canonical-schema-and-owner-fixtures';
  const database = { query: async (sql, params) => (await pool.query(sql, params)).rows,
    transaction: async statements => {
      const client = await pool.connect();
      try { await client.query('BEGIN'); for (const statement of statements) await client.query(statement.sql, statement.params); await client.query('COMMIT'); }
      catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    } };
  process.env.DATABASE_URL = logicalApp.href;
  process.env.MYEVE_RELAY_ENABLED = 'true'; process.env.MYEVE_RELAY_ORIGIN = origin;
  process.env.MYEVE_RELAY_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  const [{ loadMigrations, runMigrations }, { relayMemoryRequest, relayMemoryAdapter }, { ActionGateway }, { encryptSecret }] = await Promise.all([
    import('../scripts/migration-runner.ts'), import('../lib/relay/mcp-memory.ts'), import('../lib/action-gateway.ts'), import('../lib/relay/transport.ts'),
  ]);
  await runMigrations(database, await loadMigrations(), () => {});
  for (let index = 0; index < 2; index++) {
    const remote = fixture.agents[index];
    await pool.query("INSERT INTO agents(id,owner_id,slug,name,role,instructions,is_primary,status,max_steps,max_runtime_seconds,max_estimated_cost_usd) VALUES($1,$2,'sofie','Ordinary fixture','Test','Synthetic test only',true,'active',30,600,1)", [agents[index], owners[index]]);
    await pool.query(`INSERT INTO myeve_relay_connections(owner_id,local_agent_id,relay_owner_id,relay_agent_id,address,issuer,signing_key_id,signing_public_key,agent_credential_encrypted,owner_session_encrypted)
      VALUES($1,$2,$3,$4,$5,$6,'synthetic-key','synthetic-public-key',$7,$8)`, [owners[index], agents[index], remote.accountId, remote.agentId,
      `relay://${remote.accountId}/${remote.agentId}`, origin, encryptSecret(owners[index], remote.credential), encryptSecret(owners[index], sentinel)]);
  }
  const authority = { evaluate: async (action, target) => {
    const index = owners.indexOf(action.ownerId), remote = fixture.agents[index];
    const allow = index >= 0 && action.executor.agentId === agents[index] && ['relay.memory.read', 'relay.memory.write'].includes(action.capabilityId) &&
      target.provider === 'relay-mcp' && target.account === JSON.stringify([remote.accountId, remote.agentId]) && target.environment === 'HTTPS';
    return { decision: allow ? 'ALLOW' : 'DENY', source: 'isolated-ordinary-test-only', reason: 'Synthetic exact owner/Agent/target authority; production registration remains default DENY' };
  } };
  async function execute(index, input, expectedPrivateDenial = false) {
    assertNoUnexpectedFailure();
    assert.ok(keys.length < 8);
    const id = 'ordinary_' + randomUUID(), owner = owners[index]; keys.push(`tool:${id}`);
    const principal = { authenticator: 'myeve-web-session', issuer: 'myeve', principalId: owner, principalType: 'user', subject: owner, attributes: { owner: 'true', myeveAgentId: agents[index] } };
    const context = { callId: id, session: { id: 'ordinary_session_' + randomUUID(), auth: { current: principal, initiator: principal } } };
    const action = await relayMemoryRequest(context, input), adapter = relayMemoryAdapter(action);
    let value;
    let outcome;
    try {
      outcome = await new ActionGateway(database, authority).execute(action, { ...adapter, execute: async (parameters, handle) => { value = await adapter.execute(parameters, handle); return value; } });
    } catch (error) {
      assertNoUnexpectedFailure();
      if (expectedPrivateDenial && error.status === 'result_unknown') await verifyActualPrivateDenial(index, input.id);
      throw error;
    }
    assertNoUnexpectedFailure();
    assert.equal(outcome.receipt.status, 'completed'); assert.equal(outcome.receipt.operation, input.operation);
    for (const content of contents) assert.equal(JSON.stringify(outcome).includes(content), false);
    assert.equal(value.isError === true, false);
    return JSON.parse(value.content[0].text);
  }
  phase = 'own-add';
  for (let index = 0; index < 2; index++) {
    const memory = await execute(index, { operation: 'add', content: contents[index] });
    assert.equal(memory.content, contents[index]); assert.equal(memory.scope, 'AGENT_PRIVATE'); memoryIds[index] = memory.id;
  }
  phase = 'own-get';
  for (let index = 0; index < 2; index++) {
    const memory = await execute(index, { operation: 'get', id: memoryIds[index] });
    assert.equal(memory.id, memoryIds[index]); assert.equal(memory.content, contents[index]);
  }
  phase = 'own-list';
  for (let index = 0; index < 2; index++) {
    const memories = await execute(index, { operation: 'list', limit: 10 });
    assert.equal(memories.length, 1); assert.equal(memories[0].id, memoryIds[index]);
    assert.equal(JSON.stringify(memories).includes(contents[1 - index]), false);
  }
  phase = 'foreign-private-get';
  for (let index = 0; index < 2; index++) {
    // Actual ordinary private-read denial, not injected failure or UNKNOWN repair.
    // The current generic adapter conserves the remote RPC error as uncertainty.
    await assert.rejects(execute(index, { operation: 'get', id: memoryIds[1 - index] }, true), error => error.status === 'result_unknown');
    assertNoUnexpectedFailure();
  }
  assert.equal(keys.length, 8); assert.equal(new Set(keys).size, 8);
  phase = 'durable-action-and-effect-readback';
  const rows = (await pool.query('SELECT action_key,status,attempt_count,provider_receipt,safe_summary FROM action_requests ORDER BY action_key')).rows;
  assert.equal(rows.length, 8); assert.ok(rows.every(row => keys.includes(row.action_key) && row.attempt_count === 1));
  assert.equal(rows.filter(row => row.status === 'completed').length, 6); assert.equal(rows.filter(row => row.status === 'result_unknown').length, 2);
  const receipts = JSON.stringify(rows.map(row => ({ receipt: row.provider_receipt, summary: row.safe_summary })));
  for (const secret of [sentinel, ...contents, ...fixture.agents.map(agent => agent.credential)]) assert.equal(receipts.includes(secret), false);
  const effects = {};
  for (const table of ['engineering_work', 'external_alpha_work_authority', 'external_alpha_work_result', 'external_alpha_operation', 'external_alpha_tool_effect']) {
    effects[table] = Number((await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n); assert.equal(effects[table], 0);
  }
  writeFileSync(join(spec.privateDirectory, 'myEve-ordinary-action-forensic.json'), JSON.stringify({ database: databaseName, rows }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  passed = true;
  results.push({ status: 'PASS_ORDINARY_REMOTE_BOUNDARY_LOCAL_UNCERTAINTY_PRESERVED', uniqueActions: 8, completedOwnCalls: 6,
    remotePrivateGetDenials: 2, localResultUnknownRowsPreserved: 2, attemptCountEach: 1, deniedTransport, effects,
    privateReceiptContentAbsent: true, syntheticAuthorityOnly: true, productionRegistrationChanged: false,
    databaseDisposition: 'RETAINED_PRIVATE_OWNED_CLUSTER_NO_REPAIR_OR_RESET', scope: 'No whole-pair/productive/installed/financial/provider/tester/production PASS' });
} catch (error) {
  let detail = error instanceof Error ? error.stack ?? error.message : 'ORDINARY_CHILD_FAILED';
  for (const secret of [adminUrl.href, adminUrl.password, nativeApp.href, logicalApp.href, sentinel, ...contents,
    ...fixture.agents.map(agent => agent.credential), process.env.MYEVE_RELAY_ENCRYPTION_KEY])
    if (secret) detail = detail.replaceAll(secret, '[REDACTED]');
  writeFileSync(join(spec.privateDirectory, 'myEve-first-failure.redacted.json'), JSON.stringify({
    phase, scheduledUniqueActions: keys.length, databaseCreated: created, detail: detail.slice(-131072),
  }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  process.exitCode = 1;
} finally {
  try { await pool.end(); if (connected) await native.end(); await agent.close(); }
  catch { passed = false; process.exitCode = 1; }
  globalThis.fetch = originalFetch;
  if (passed) process.send({ type: 'result', ...results[0] });
  else process.send({ type: 'result', status: 'FAIL_FIRST_ATTEMPT', databaseCreated: created, databaseRetained: created, deniedTransport });
  process.disconnect();
}
