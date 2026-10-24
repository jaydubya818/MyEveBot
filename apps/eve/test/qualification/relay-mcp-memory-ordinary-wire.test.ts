// Separate ordinary-only fixture. Copy this exact committed file to the selected
// Relay copy as myeve-ordinary-memory-wire.test.ts; run only after clearance.
import { expect, test } from 'vitest';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, fork, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:https';
import { once } from 'node:events';
import { readFileSync, writeFileSync, lstatSync, readdirSync, realpathSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';

type Source = { root: string; copy: string; sha: string; tree: string; lockSha256: string;
  dependencyContainers: { path: string; ownedCaches: string[] }[] };
type Spec = { version: 1; ownedRoot: string; privateDirectory: string; outputDirectory: string;
  myEve: Source; relay: Source; postgres: { adminUrl: string; systemIdentifier: string };
  tls: { port: number; keyPath: string; certificatePath: string; keySha256: string; certificateSha256: string } };
const wirePath = 'apps/eve/test/qualification/relay-mcp-memory-ordinary-wire.test.ts';
const childPath = 'apps/eve/test/relay-mcp-memory-ordinary.integration.mjs';
const overlay = 'myeve-ordinary-memory-wire.test.ts';
const hash = (body: string | Buffer) => createHash('sha256').update(body).digest('hex');
const git = (source: Source, ...args: string[]) => execFileSync('git', args, { cwd: source.root, encoding: 'utf8' }).trim();
const inside = (base: string, path: string) => resolve(path).startsWith(resolve(base) + sep);
function privatePath(path: string, directory: boolean) {
  const stat = lstatSync(path);
  assert.equal(stat.uid, process.getuid!());
  assert.equal(stat.isSymbolicLink(), false);
  assert.equal(stat.mode & 0o777, directory ? 0o700 : 0o600);
  assert.equal(directory ? stat.isDirectory() : stat.isFile(), true);
}
function dependencyContainer(source: Source, path: string) {
  const declaration = source.dependencyContainers.find(item => item.path === path);
  assert.ok(declaration, 'Undeclared dependency container');
  assert.deepEqual(declaration.ownedCaches, ['.vite', '.vite-temp']);
  const original = join(source.root, path), owned = join(source.copy, path);
  privatePath(owned, true); assert.ok(inside(realpathSync(source.copy), realpathSync(owned)));
  const links: [string, string][] = [];
  function packages(from: string, to: string, prefix = '') {
    const names = readdirSync(from).filter(name => !name.startsWith('.')).sort();
    assert.deepEqual(readdirSync(to).filter(name => !name.startsWith('.')).sort(), names);
    if (prefix) assert.equal(readdirSync(to).some(name => name.startsWith('.')), false);
    for (const name of names) {
      const input = join(from, name), output = join(to, name), relative = prefix + name;
      if (name.startsWith('@') && !prefix) { privatePath(output, true); packages(input, output, name + '/'); }
      else {
        assert.ok(lstatSync(output).isSymbolicLink(), 'Dependency packages must be exact links');
        const target = realpathSync(input), root = realpathSync(source.root);
        assert.ok(inside(root, target), 'Dependency must come from this product frozen graph');
        // Workspace links stay in the verified copy; external packages retain
        // only this product's existing frozen dependency graph.
        const expected = target.split(sep).includes('node_modules') ? target :
          join(realpathSync(source.copy), target.slice(root.length + 1));
        assert.equal(realpathSync(output), expected); links.push([relative, expected]);
      }
    }
  }
  packages(original, owned);
  assert.deepEqual(readdirSync(owned).filter(name => name.startsWith('.')).sort(), declaration.ownedCaches);
  const cacheFiles: [string, string][] = [];
  function cache(directory: string, prefix: string) {
    privatePath(directory, true);
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, item.name), name = prefix + '/' + item.name;
      assert.equal(item.isSymbolicLink(), false, 'Cache artifacts must remain owned regular files/directories');
      if (item.isDirectory()) cache(file, name);
      else { privatePath(file, false); cacheFiles.push([name, hash(readFileSync(file))]); }
    }
  }
  for (const name of declaration.ownedCaches) cache(join(owned, name), name);
  return { path, packageLinks: links.length, packageLinksSha256: hash(JSON.stringify(links)), ownedCaches: declaration.ownedCaches,
    cacheArtifacts: { files: cacheFiles.length, manifestSha256: hash(JSON.stringify(cacheFiles.sort())) } };
}
function sourceCopy(source: Source, lock: string, extra?: { name: string; body: Buffer }) {
  assert.match(source.sha, /^[a-f0-9]{40}$/); assert.match(source.tree, /^[a-f0-9]{40}$/);
  assert.equal(git(source, 'rev-parse', 'HEAD'), source.sha);
  assert.equal(git(source, 'rev-parse', 'HEAD^{tree}'), source.tree);
  assert.equal(git(source, 'status', '--porcelain'), '');
  assert.equal(hash(readFileSync(join(source.root, lock))), source.lockSha256);
  const expected = new Map<string, string>();
  const entries = execFileSync('git', ['ls-tree', '-rz', '--full-tree', source.sha], { cwd: source.root }).toString().split('\0').filter(Boolean);
  for (const entry of entries) {
    const [meta, path] = entry.split('\t'), [mode, type, blob] = meta.split(' ');
    assert.ok(['100644', '100755'].includes(mode) && type === 'blob');
    if (path.split('/').some(part => part.startsWith('.env')) || path.startsWith('output/')) continue;
    const file = join(source.copy, path); assert.ok(lstatSync(file).isFile());
    const body = readFileSync(file);
    assert.equal(createHash('sha1').update(`blob ${body.length}\0`).update(body).digest('hex'), blob);
    expected.set(path, hash(body));
  }
  if (extra) { assert.equal(hash(readFileSync(join(source.copy, extra.name))), hash(extra.body)); expected.set(extra.name, hash(extra.body)); }
  const dependencies: ReturnType<typeof dependencyContainer>[] = [];
  function walk(directory: string, prefix = '') {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const name = prefix + item.name;
      if (item.name === 'node_modules') {
        dependencies.push(dependencyContainer(source, name));
      } else if (item.isDirectory()) walk(join(directory, item.name), name + '/');
      else { assert.equal(item.isFile(), true); assert.ok(expected.has(name), 'Uncommitted copy input'); }
    }
  }
  walk(source.copy);
  assert.deepEqual(dependencies.map(item => item.path).sort(), source.dependencyContainers.map(item => item.path).sort());
  return { files: expected.size, manifestSha256: hash(JSON.stringify([...expected].sort())),
    dependencies: dependencies.map(({ cacheArtifacts: _, ...binding }) => binding),
    ownedCacheArtifacts: dependencies.map(({ path, cacheArtifacts }) => ({ path, ...cacheArtifacts })) };
}

test('ordinary MyEve resolver and SDK reach selected Relay with private-memory boundaries', async () => {
  const specPath = process.env.MYEVE_RELAY_ORDINARY_SPEC;
  assert.ok(specPath, 'Separately reviewed private operator descriptor required'); privatePath(specPath, false);
  const spec: Spec = JSON.parse(readFileSync(specPath, 'utf8'));
  assert.equal(spec.version, 1); privatePath(spec.ownedRoot, true); privatePath(spec.privateDirectory, true); privatePath(spec.outputDirectory, true);
  assert.ok(inside(spec.ownedRoot, spec.privateDirectory) && inside(spec.ownedRoot, spec.myEve.copy) && inside(spec.ownedRoot, spec.relay.copy));
  assert.ok(inside(realpathSync(spec.ownedRoot), realpathSync(spec.privateDirectory)));
  for (const copy of [spec.myEve.copy, spec.relay.copy]) {
    assert.ok(lstatSync(copy).isDirectory() && !lstatSync(copy).isSymbolicLink());
    assert.ok(inside(realpathSync(spec.ownedRoot), realpathSync(copy)));
  }
  assert.equal(realpathSync(process.cwd()), realpathSync(spec.relay.copy));
  assert.equal(spec.relay.sha, 'f05a5639e2f95994778753e6021603ca5a1777fb');
  assert.equal(spec.relay.tree, '7ab5ce216f82a3ef6272ed349a1f1730cc3bbdb9');
  assert.equal(spec.relay.lockSha256, 'b990fd8bf0bee8bc10473059e0d89e58c11d75fffb2c70cde0b6d59062d8d4df');
  assert.equal(spec.myEve.lockSha256, 'debed795a8e948e1829e15097e32b90c73f779747d11d986159eb6879a9ca892');
  assert.deepEqual(spec.myEve.dependencyContainers.map(item => item.path).sort(), ['apps/eve/node_modules', 'node_modules']);
  assert.deepEqual(spec.relay.dependencyContainers.map(item => item.path), ['node_modules']);
  execFileSync('git', ['merge-base', '--is-ancestor', '6e447cb9c326cc0694b7c6f0cc4099829009e705', spec.myEve.sha], { cwd: spec.myEve.root });
  for (const path of ['apps/eve/test/qualification/relay-mcp-memory-wire.test.ts', 'apps/eve/test/relay-mcp-memory.integration.mjs'])
    assert.equal(git(spec.myEve, 'rev-parse', `${spec.myEve.sha}:${path}`), git(spec.myEve, 'rev-parse', `6e447cb9:${path}`), 'Original full campaign must remain unchanged');
  const body = readFileSync(join(spec.myEve.copy, wirePath));
  const initialSources = { myEve: sourceCopy(spec.myEve, 'package-lock.json'), relay: sourceCopy(spec.relay, 'pnpm-lock.yaml', { name: overlay, body }) };
  for (const [path, expected] of [[spec.tls.keyPath, spec.tls.keySha256], [spec.tls.certificatePath, spec.tls.certificateSha256]]) {
    assert.ok(inside(spec.privateDirectory, path) && inside(realpathSync(spec.privateDirectory), realpathSync(path)));
    privatePath(path, false); assert.equal(hash(readFileSync(path)), expected);
  }
  const admin = new URL(spec.postgres.adminUrl);
  assert.equal(admin.protocol, 'postgresql:'); assert.equal(admin.hostname, '127.0.0.1');
  assert.equal(admin.username, 'mcp_fixture'); assert.equal(admin.pathname, '/mcp_ordinary'); assert.ok(admin.password.length >= 24 && !admin.search && !admin.hash);
  const pgPort = Number(admin.port); assert.ok(Number.isInteger(pgPort) && pgPort > 1024 && pgPort < 65536);
  assert.ok(Number.isInteger(spec.tls.port) && spec.tls.port > 1024 && spec.tls.port < 65536 && spec.tls.port !== pgPort);
  assert.match(spec.postgres.systemIdentifier, /^\d{10,25}$/);
  writeFileSync(join(spec.privateDirectory, 'ordinary-attempt-started.json'), JSON.stringify({
    source: spec.myEve.sha, tree: spec.myEve.tree, relaySource: spec.relay.sha,
    workerPID: process.pid, node: process.execPath, cwd: process.cwd(),
  }) + '\n', { mode: 0o600, flag: 'wx' });
  for (const key of Object.keys(process.env))
    assert.ok(!/^(?:AI_GATEWAY_|OPENAI_|ANTHROPIC_|VERCEL_|FQ_|MYEVE_QUALIFICATION_|RELAY_QUALIFICATION_|NODE_TLS_REJECT_UNAUTHORIZED)/.test(key), 'Ambient production/provider configuration forbidden');
  const origin = `https://127.0.0.1:${spec.tls.port}`;
  let deniedTransport = 0;
  const deny = () => { deniedTransport++; throw Error('ORDINARY_PARENT_FOREIGN_TRANSPORT'); };
  const originalConnect = net.Socket.prototype.connect, originalFetch = globalThis.fetch;
  const originals = [http.request, http.get, https.request, https.get];
  net.Socket.prototype.connect = function (this: net.Socket, ...args: any[]) {
    const first = Array.isArray(args[0]) ? args[0][0] : args[0];
    const options = typeof first === 'object' ? first : { port: first, host: args[1] };
    if (options.path ? !inside(join(spec.privateDirectory, 'tmp'), options.path) : options.host !== '127.0.0.1' || Number(options.port) !== pgPort) return deny();
    return Reflect.apply(originalConnect, this, args as any);
  } as any;
  globalThis.fetch = deny; http.request = deny as any; http.get = deny as any; https.request = deny as any; https.get = deny as any;
  let child: ChildProcess | undefined, server: Server | undefined, closePeer: (() => Promise<void>) | undefined;
  let passed = false, peerClosed = false, childClosed = false, failure = 'ORDINARY_FIRST_FAILURE';
  let childResult: any, callbackFailure = false, resultCount = 0;
  const stats = [0, 1].map(() => ({ add: 0, get: 0, list: 0, privateDenials: 0, rpcRequests: 0 }));
  const memories = new Map<string, { owner: number; content: string }>();
  const secrets = new Set([admin.href, admin.password, 'SYNTHETIC_OWNER_COOKIE_MUST_NEVER_LEAVE']);
  const redact = (value: string) => {
    for (const secret of secrets) value = value.replaceAll(secret, '[REDACTED]');
    return value.replace(/SYNTHETIC_PRIVATE_MEMORY_[a-f0-9-]+/gi, '[SYNTHETIC_PRIVATE_CONTENT]');
  };
  const logPath = join(spec.privateDirectory, 'child-diagnostics.log');
  let childLog = Buffer.alloc(0);
  try {
    const [{ POST }, { createAgent }, { listActivity }, helpers, peerDb, pg] = await Promise.all([
      import('@/app/mcp/route'), import('@/lib/agents'), import('@/lib/activity'), import('./tests/helpers'), import('@/lib/db'), import('pg'),
    ]);
    closePeer = peerDb.closeDatabasesForTests;
    const native = new pg.Client({ connectionString: admin.href, connectionTimeoutMillis: 5000, query_timeout: 5000 });
    await native.connect();
    try {
      const row = (await native.query("SELECT current_user AS role,current_database() AS database,system_identifier::text,host(inet_server_addr()) AS address,inet_server_port() AS port,current_setting('server_encoding') AS encoding FROM pg_control_system()")).rows[0];
      expect(row).toEqual({ role: 'mcp_fixture', database: 'mcp_ordinary', system_identifier: spec.postgres.systemIdentifier, address: '127.0.0.1', port: pgPort, encoding: 'UTF8' });
    } finally { await native.end(); }
    assert.equal(process.env.RELAY_TEST_DATABASE_URL, admin.href);
    const first = await helpers.freshDatabase(), second = await helpers.secondAccount();
    writeFileSync(join(spec.privateDirectory, 'peer-database-binding.json'), JSON.stringify({
      database: new URL(process.env.RELAY_DATABASE_URL!).pathname.slice(1), role: 'mcp_fixture', systemIdentifier: spec.postgres.systemIdentifier,
      disposition: 'RETAINED_IN_OWNED_CLUSTER_FOR_FORENSICS',
    }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    const accounts = [first.accountId, second];
    const agents = await Promise.all(accounts.map(accountId => createAgent(accountId, { name: 'Ordinary synthetic memory fixture', capabilities: ['memory.read', 'memory.write'] })));
    for (const agent of agents) secrets.add(agent.credential);
    server = createServer({ key: readFileSync(spec.tls.keyPath), cert: readFileSync(spec.tls.certificatePath) }, async (request, response) => {
      try {
        assert.equal(callbackFailure, false); assert.equal(request.method, 'POST'); assert.equal(request.url, '/mcp'); assert.equal(request.headers.cookie, undefined);
        const owner = agents.findIndex(agent => request.headers.authorization === `Bearer ${agent.credential}`); assert.ok(owner >= 0);
        const chunks: Buffer[] = []; let bytes = 0;
        for await (const chunk of request) { bytes += chunk.length; assert.ok(bytes <= 65536); chunks.push(Buffer.from(chunk)); }
        const payload = Buffer.concat(chunks).toString(), rpc = JSON.parse(payload);
        assert.equal((payload + JSON.stringify(request.headers)).includes('SYNTHETIC_OWNER_COOKIE_MUST_NEVER_LEAVE'), false);
        assert.ok(['initialize', 'notifications/initialized', 'tools/list', 'tools/call'].includes(rpc.method));
        assert.ok(++stats[owner].rpcRequests <= 16);
        if (rpc.method === 'tools/call') {
          const operation = rpc.params?.name?.replace('relay_memory_', ''); assert.ok(['add', 'get', 'list'].includes(operation));
          assert.ok(++(stats[owner] as any)[operation] <= (operation === 'get' ? 2 : 1));
          if (operation === 'add') { assert.equal(rpc.params.arguments.scope, 'AGENT_PRIVATE'); assert.equal(rpc.params.arguments.type, 'FACT'); }
        }
        const actual = await POST(new Request(origin + '/mcp', { method: 'POST', headers: request.headers as HeadersInit, body: payload }));
        const text = await actual.text(); assert.ok(Buffer.byteLength(text) <= 262144);
        if (rpc.method === 'tools/call') {
          const parsed = JSON.parse(text), operation = rpc.params.name.replace('relay_memory_', '');
          if (operation === 'get') assert.ok(memories.has(rpc.params.arguments.id), 'Privacy check requires a known created memory');
          const foreign = operation === 'get' && memories.get(rpc.params.arguments.id)?.owner !== owner;
          if (foreign) {
            assert.equal(parsed.error?.code, -32000); assert.equal(parsed.error?.data?.code, 'INVALID_INPUT');
            assert.equal(parsed.error?.message, 'Memory not found.'); assert.equal(parsed.result, undefined);
            for (const memory of memories.values()) assert.equal(text.includes(memory.content), false);
            stats[owner].privateDenials++;
          } else {
            assert.equal(parsed.error, undefined);
            const value = JSON.parse(parsed.result.content[0].text);
            if (operation === 'add') { assert.equal(value.scope, 'AGENT_PRIVATE'); memories.set(value.id, { owner, content: value.content }); }
            else if (operation === 'get') assert.equal(memories.get(value.id)?.owner, owner);
            else { assert.equal(value.length, 1); assert.equal(memories.get(value[0].id)?.owner, owner); }
          }
        }
        response.writeHead(actual.status, Object.fromEntries(actual.headers)); response.end(text);
      } catch (error) {
        if (!callbackFailure) writeFileSync(join(spec.privateDirectory, 'relay-first-failure.redacted.txt'),
          redact(error instanceof Error ? error.stack ?? error.message : 'ORDINARY_RELAY_HANDLER_FAILED').slice(-131072), { mode: 0o600, flag: 'wx' });
        callbackFailure = true; response.writeHead(500); response.end('ORDINARY_RELAY_HANDLER_FAILED');
      }
    });
    server.listen(spec.tls.port, '127.0.0.1'); await once(server, 'listening');
    const childEnv = { PATH: process.env.PATH, HOME: process.env.HOME, USER: process.env.USER, TMPDIR: join(spec.privateDirectory, 'tmp'),
      NODE_ENV: 'test', NODE_EXTRA_CA_CERTS: spec.tls.certificatePath, MYEVE_RELAY_ORDINARY_SPEC: specPath };
    child = fork(join(spec.myEve.copy, childPath), { cwd: spec.myEve.copy, execArgv: ['--import', 'tsx'], env: childEnv, silent: true });
    assert.ok(child.pid);
    writeFileSync(join(spec.privateDirectory, 'ordinary-child-ownership.json'), JSON.stringify({
      pid: child.pid, node: process.execPath, script: join(spec.myEve.copy, childPath), parentPID: process.pid,
    }) + '\n', { mode: 0o600, flag: 'wx' });
    const collect = (chunk: Buffer) => { childLog = Buffer.concat([childLog, chunk]).subarray(-4 * 1024 * 1024); };
    child.stdout?.on('data', collect); child.stderr?.on('data', collect);
    await new Promise<void>((done, reject) => {
      const timer = setTimeout(() => { child?.kill('SIGTERM'); reject(Error('ORDINARY_CHILD_DEADLINE')); }, 120000);
      child!.on('message', (message: any) => {
        if (message?.type === 'ready') child!.send({ type: 'fixture', origin, agents: agents.map((agent, index) => ({ ...agent, accountId: accounts[index] })) });
        if (message?.type === 'result') { childResult = message; resultCount++; }
      });
      child!.once('error', () => { clearTimeout(timer); reject(Error('ORDINARY_CHILD_START_FAILED')); });
      child!.once('exit', code => { clearTimeout(timer); childClosed = true; code === 0 ? done() : reject(Error('ORDINARY_CHILD_FAILED')); });
    });
    assert.equal(resultCount, 1); assert.equal(childResult?.status, 'PASS_ORDINARY_REMOTE_BOUNDARY_LOCAL_UNCERTAINTY_PRESERVED');
    expect(childResult).toMatchObject({ uniqueActions: 8, completedOwnCalls: 6, remotePrivateGetDenials: 2,
      localResultUnknownRowsPreserved: 2, attemptCountEach: 1, privateReceiptContentAbsent: true, productionRegistrationChanged: false });
    assert.equal(callbackFailure, false); assert.equal(deniedTransport, 0); assert.equal(childResult.deniedTransport, 0);
    for (const row of stats) expect({ add: row.add, get: row.get, list: row.list, privateDenials: row.privateDenials }).toEqual({ add: 1, get: 2, list: 1, privateDenials: 1 });
    for (let index = 0; index < 2; index++) {
      const activity = (await listActivity(accounts[index], { agentId: agents[index].agentId })).filter(row => row.action.startsWith('memory.'));
      expect(activity.map(row => `${row.action}:${row.status}`).sort()).toEqual(['memory.add:SUCCESS', 'memory.get:FAILED', 'memory.get:SUCCESS', 'memory.list:SUCCESS'].sort());
    }
    const finalSources = { myEve: sourceCopy(spec.myEve, 'package-lock.json'), relay: sourceCopy(spec.relay, 'pnpm-lock.yaml', { name: overlay, body }) };
    for (const product of ['myEve', 'relay'] as const) {
      const { ownedCacheArtifacts: _before, ...before } = initialSources[product];
      const { ownedCacheArtifacts: _after, ...after } = finalSources[product];
      assert.deepEqual(after, before);
    }
    writeFileSync(join(spec.outputDirectory, 'owned-cache-artifacts.json'), JSON.stringify({
      initial: { myEve: initialSources.myEve.ownedCacheArtifacts, relay: initialSources.relay.ownedCacheArtifacts },
      final: { myEve: finalSources.myEve.ownedCacheArtifacts, relay: finalSources.relay.ownedCacheArtifacts },
      scope: 'Declared owned scratch artifacts, excluded from committed source/dependency package binding',
    }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    passed = true; failure = '';
  } finally {
    if (child && !childClosed) {
      child.kill('SIGTERM'); const timer = setTimeout(() => child?.kill('SIGKILL'), 3000);
      await new Promise<void>(done => { if (child!.exitCode !== null || child!.signalCode !== null) done(); else child!.once('exit', () => done()); }); clearTimeout(timer);
    }
    if (server) { server.closeAllConnections(); await new Promise<void>(done => server!.close(() => done())); }
    try { await closePeer?.(); peerClosed = Boolean(closePeer); } finally {
      net.Socket.prototype.connect = originalConnect; globalThis.fetch = originalFetch;
      [http.request, http.get, https.request, https.get] = originals;
      writeFileSync(logPath, redact(childLog.toString()), { mode: 0o600, flag: 'wx' });
      writeFileSync(join(spec.outputDirectory, 'ordinary-pair-receipt.json'), JSON.stringify({
        status: passed && peerClosed && childClosed ? 'PASS_ORDINARY_REMOTE_BOUNDARY_LOCAL_UNCERTAINTY_PRESERVED' : 'FAIL_FIRST_ATTEMPT',
        source: spec.myEve.sha, sourceTree: spec.myEve.tree, relaySource: spec.relay.sha, sources: initialSources, failure: failure || null,
        stats, child: childResult ?? null, parentDeniedTransport: deniedTransport,
        resources: { childClosed, peerConnectionsClosed: peerClosed, databases: 'RETAINED_IN_PRIVATE_OWNED_CLUSTER_FOR_OPERATOR_STOP_AND_FORENSICS' },
        networkControls: 'Node process transport tripwires; not an OS sandbox or arbitrary native-egress measurement',
        scope: 'Eight unique ordinary synthetic memory calls only. Six completed own operations; two actual remote privacy-denials remain local result_unknown without repair. No injected failure/replay/rotation/revocation/cancellation/financial/provider/tester/production qualification.',
      }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    }
  }
}, 180000);
