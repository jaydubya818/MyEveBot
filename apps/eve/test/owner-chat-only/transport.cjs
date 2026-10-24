// Fixture-only adapters. Constructor inputs are bound to the operator's owned
// topology. This is a Node transport tripwire, not an OS network sandbox.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { Pool } = require('pg');
const { neonConfig } = require('@neondatabase/serverless');
const { Agent, Dispatcher, setGlobalDispatcher } = require('undici');
const binding = JSON.parse(fs.readFileSync(process.env.MYEVE_CHAT_ONLY_TRANSPORT_FILE, 'utf8'));
const app = new URL(process.env.DATABASE_URL || '');
const central = new URL(process.env.MYEVE_EXTERNAL_ALPHA_ACCOUNTING_DATABASE_URL || '');
if (app.href !== binding.appUrl || central.href !== binding.centralUrl ||
    !/^\/ea_work_[a-f0-9]{32}$/.test(app.pathname) || !/^\/ea_work_[a-f0-9]{32}$/.test(central.pathname) ||
    app.pathname === central.pathname) throw Error('CHAT_FIXTURE_DATABASE_BINDING');
for (const url of [app, central]) {
  if (!['localhost','127.0.0.1'].includes(url.hostname) || Number(url.port) !== binding.pgPort ||
      [...url.searchParams].some(([key,value]) => key !== 'host' || value !== '::1')) throw Error('CHAT_FIXTURE_LOCAL_DATABASE_REQUIRED');
}
const allowedPorts = new Set([binding.pgPort, binding.webPort, binding.evePort, binding.modelPort]);
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const options = typeof first === 'object' ? first : typeof first === 'string' && !/^\d+$/.test(first)
    ? { path: first } : { port: first, host: typeof args[1] === 'string' ? args[1] : 'localhost' };
  if (options?.path) {
    const name = path.resolve(options.path), base = path.resolve(binding.ipcDirectory) + path.sep;
    if (!name.startsWith(base)) throw Error('CHAT_FIXTURE_FOREIGN_IPC_DENIED');
  } else if (!['localhost','127.0.0.1','::1'].includes(options?.host || 'localhost') || !allowedPorts.has(Number(options?.port))) {
    throw Error('CHAT_FIXTURE_FOREIGN_SOCKET_DENIED');
  }
  return Reflect.apply(connect, this, args);
};
const web = new Set([`http://localhost:${binding.webPort}`, `http://127.0.0.1:${binding.webPort}`]);
const eve = `http://127.0.0.1:${binding.evePort}`;
const model = `http://127.0.0.1:${binding.modelPort}`;
const reads = new Set(['/login','/today','/chat','/work/new','/api/auth/status','/api/chat-usage','/api/threads','/api/agents','/api/relay','/api/work-inbox','/api/readiness','/api/files']);
function allowedHttp(url, method) {
  if (url.origin === model) return url.pathname === '/model' && !url.search && method === 'POST';
  if (url.origin === eve) return /^\/eve\/v1\/(health|info|session(?:\/[^/]+)?(?:\/stream)?)$/.test(url.pathname) && ['GET','HEAD','POST'].includes(method);
  if (!web.has(url.origin)) return false;
  if (['GET','HEAD'].includes(method)) return reads.has(url.pathname) ||
    /^\/(?:_next\/static\/|api\/threads\/[^/]+$|api\/agents\/[^/]+(?:\/home)?$)/.test(url.pathname);
  return (method === 'POST' && ['/api/auth/login','/api/auth/logout'].includes(url.pathname)) ||
    (method === 'PUT' && /^\/api\/threads\/[^/]+$/.test(url.pathname));
}
for (const protocol of ['http','https']) {
  const module = require('node:' + protocol);
  for (const name of ['request','get']) {
    const original = module[name];
    module[name] = function (input, ...args) {
      const options = input instanceof URL || typeof input === 'string' ? (typeof args[0] === 'object' ? args[0] : {}) : input;
      const url = input instanceof URL || typeof input === 'string' ? new URL(input) :
        new URL(`${options.protocol || protocol + ':'}//${options.hostname || options.host || 'localhost'}:${options.port || (protocol === 'http' ? 80 : 443)}${options.path || '/'}`);
      if (!allowedHttp(url, String(options.method || 'GET').toUpperCase())) throw Error('CHAT_FIXTURE_FOREIGN_NODE_HTTP_DENIED');
      return Reflect.apply(original, this, [input, ...args]);
    };
  }
}
const agent = new Agent();
class OwnedDispatcher extends Dispatcher {
  dispatch(options, handler) {
    const url = new URL(options.path, String(options.origin));
    if (!allowedHttp(url, String(options.method || 'GET').toUpperCase())) throw Error('CHAT_FIXTURE_FOREIGN_HTTP_DENIED');
    return agent.dispatch(options, handler);
  }
}
setGlobalDispatcher(new OwnedDispatcher());
const endpoint = typeof neonConfig.fetchEndpoint === 'function' ? neonConfig.fetchEndpoint(app.hostname, app.port) : neonConfig.fetchEndpoint;
const pool = new Pool({ connectionString: app.href, max: 8, connectionTimeoutMillis: 5000, query_timeout: 10000 });
const fetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const connection = headers.get('Neon-Connection-String');
  if (connection) {
    // The SDK's exact derived endpoint is opaque fixture input: its normal Neon
    // hostname rewrite can be an invalid URL for a numeric loopback host. Check
    // it before URL parsing; this branch never sends HTTP and uses only owned pg.
    if (new URL(connection).href !== app.href || target !== endpoint || String(init?.method || 'GET').toUpperCase() !== 'POST')
      throw Error('CHAT_FIXTURE_FOREIGN_NEON_DENIED');
    const body = JSON.parse(init.body), client = await pool.connect();
    try {
      if (body.queries) await client.query('BEGIN');
      const results = [];
      for (const query of body.queries ?? [body]) {
        const result = await client.query({ text: query.query, values: query.params, rowMode: 'array', types: { getTypeParser: () => value => value } });
        results.push({ fields: result.fields, rows: result.rows, command: result.command, rowCount: result.rowCount });
      }
      if (body.queries) await client.query('COMMIT');
      return Response.json(body.queries ? { results } : results[0]);
    } catch (error) {
      if (body.queries) await client.query('ROLLBACK');
      return Response.json({ message: 'Owned fixture query failed', code: error.code }, { status: 400 });
    } finally { client.release(); }
  }
  const url = new URL(target);
  if (!allowedHttp(url, String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()))
    throw Error('CHAT_FIXTURE_FOREIGN_FETCH_DENIED');
  return fetch(input, init);
};
