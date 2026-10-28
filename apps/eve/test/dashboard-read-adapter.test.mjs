import test from 'node:test';
import assert from 'node:assert/strict';
import { createDashboardReadHandler, DashboardProviderError } from '../lib/dashboard/read-adapter.ts';

// Public synthetic unit fixtures for trusted server ports. These do not qualify
// a real owner login, installed capability, protected criteria or live provider.
const now = 1_800_000_000_000, commit = 'a'.repeat(40);
const observationPath = '/api/dashboard/v1/observation?repositoryId=1001&ref=refs%2Fheads%2Fmain';
function rawRun(id = '3001') {
  return { id, workflow_id: '101', event: 'push', repository: { id: '1001', full_name: 'example/dashboard' },
    head_branch: 'main', head_sha: commit, run_attempt: 1, status: 'completed', conclusion: 'success',
    display_title: 'PUBLIC_SYNTHETIC_RUN', created_at: new Date(now - 60_000).toISOString(), updated_at: new Date(now - 30_000).toISOString() };
}
function fixture() {
  const context = { ownerId: 'owner-a', sessionRevision: 'session-a', installationId: 'installation-a', accountId: 'account-a',
    agentId: 'agent-a', connectionRevision: 'connection-a', revision: 'context-a', expiresAt: now + 240_000,
    repositories: [{ id: '1001', name: 'example/dashboard', defaultRef: 'refs/heads/main', refs: ['refs/heads/main'],
      workflows: [{ id: '101', name: 'Build and test', event: 'push' }], deployments: false }] };
  const state = { context, owner: { ownerId: 'owner-a', sessionRevision: 'session-a' }, calls: [], elapsed: 0,
    provider: async (operation, args) => {
      if (operation === 'repo.get') return { id: '1001', full_name: 'example/dashboard' };
      if (operation === 'branch.get') return { name: 'main', commit: { sha: commit } };
      if (operation === 'run.list') return { items: [rawRun()], page: args.page, perPage: args.perPage, totalCount: 1, hasMore: false };
      if (operation === 'run.get') return rawRun(args.runId);
      if (operation === 'deployment.list') return { items: [], page: 1, perPage: 10, hasMore: false };
      if (operation === 'deployment.status.list') return { items: [], page: 1, perPage: 100, hasMore: false };
      throw new Error('Unexpected operation');
    } };
  const ports = { authenticate: async () => structuredClone(state.owner), binding: async () => structuredClone(state.context),
    read: async (binding, operation, args, signal) => {
      state.calls.push({ binding, operation, args, signal });
      return state.provider(operation, args);
    }, now: () => now + state.elapsed };
  const handler = createDashboardReadHandler(ports);
  const request = (path = observationPath, init = {}) => new Request(`https://myeve.example${path}`, { ...init, headers: { 'x-dashboard-context': 'context-a', ...init.headers } });
  const read = async (path, init) => { const response = await handler(request(path, init)); return { response, body: await response.json() }; };
  return { state, ports, handler, request, read };
}
test('absent host composition is unavailable and cannot return demo data', async () => {
  const response = await createDashboardReadHandler()(new Request('https://myeve.example/api/dashboard/v1/context'));
  assert.equal(response.status, 503); assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await response.json(), { error: 'Dashboard read unavailable.' });
});
test('writes are rejected before any host authentication or provider read', async () => {
  const f = fixture(); let authentication = 0; f.ports.authenticate = async () => { authentication++; return f.state.owner; };
  const response = await f.handler(f.request(observationPath, { method: 'POST', body: '{}' }));
  assert.equal(response.status, 405); assert.equal(response.headers.get('allow'), 'GET'); assert.equal(authentication, 0); assert.equal(f.state.calls.length, 0);
});
for (const query of ['?ownerId=other', '?repositoryId=1001&repositoryId=1002&ref=refs/heads/main', '?repositoryId=1001&ref=refs/heads/main&url=https://other.example', '?repositoryId=../other&ref=refs/heads/main', '?repositoryId=1001&ref=refs/heads/../other']) test(`authority-bearing or malformed query cannot reach provider: ${query}`, async () => {
  const f = fixture(); const { response } = await f.read('/api/dashboard/v1/observation' + query);
  assert.equal(response.status, 400); assert.equal(f.state.calls.length, 0);
});
test('cross-site requests fail before authentication and private reads', async () => {
  const f = fixture(); const { response } = await f.read(observationPath, { headers: { origin: 'https://other.example' } });
  assert.equal(response.status, 403); assert.equal(f.state.calls.length, 0);
});
test('authentication denial and missing installation binding are distinct and invoke no provider', async () => {
  const f = fixture(); f.state.owner = null;
  assert.equal((await f.read()).response.status, 401); assert.equal(f.state.calls.length, 0);
  f.state.owner = { ownerId: 'owner-a', sessionRevision: 'session-a' }; f.state.context = null;
  assert.equal((await f.read()).response.status, 403); assert.equal(f.state.calls.length, 0);
});
test('catalog exposes only the browser allowlist, without account/Agent/installation or credentials', async () => {
  const f = fixture(); const { response, body } = await f.read('/api/dashboard/v1/context');
  assert.equal(response.status, 200);
  assert.deepEqual(body, { serverTime: now, authorization: { ownerId: 'owner-a', revision: 'context-a', expiresAt: now + 240_000 },
    repositories: [{ id: '1001', name: 'example/dashboard', defaultRef: 'refs/heads/main', refs: ['refs/heads/main'] }] });
  assert.equal(f.state.calls.length, 0);
});
test('a complete observation preserves exact owner/repository/ref/SHA and current run identity', async () => {
  const f = fixture(); const { response, body } = await f.read(); assert.equal(response.status, 200);
  assert.equal(body.repositoryId, '1001'); assert.equal(body.ref, 'refs/heads/main'); assert.equal(body.headSha, commit);
  assert.equal(body.authorization.ownerId, 'owner-a'); assert.equal(body.coverage.complete, true); assert.equal(body.coverage.pages, 1);
  assert.equal(body.runs[0].id, '3001'); assert.equal(body.runs[0].attempt, 1);
  assert.deepEqual(body.deployments, { availability: 'forbidden', items: [] });
  assert.deepEqual(f.state.calls.map(call => call.operation), ['repo.get', 'branch.get', 'run.list', 'run.get', 'branch.get', 'repo.get']);
  for (const call of f.state.calls) {
    assert.equal(call.binding.ownerId, 'owner-a'); assert.equal(call.binding.installationId, 'installation-a');
    assert.equal(call.binding.accountId, 'account-a'); assert.equal(call.binding.agentId, 'agent-a');
    assert.deepEqual([call.args.owner, call.args.repo], ['example', 'dashboard']); assert(call.signal instanceof AbortSignal);
  }
});
for (const field of ['ownerId', 'sessionRevision', 'installationId', 'accountId', 'agentId', 'connectionRevision', 'revision', 'expiresAt']) test(`changing ${field} during a provider read prevents any private response`, async () => {
  const f = fixture(); f.state.provider = async () => {
    f.state.context[field] = field === 'expiresAt' ? now - 1 : 'other';
    return { id: '1001', full_name: 'example/dashboard' };
  };
  const { response, body } = await f.read(); assert.equal(response.status, 403); assert.deepEqual(body, { error: 'Dashboard read unavailable.' });
  assert.equal(f.state.calls.length, 1);
});
for (const scope of ['repositoryId=1002&ref=refs/heads/main', 'repositoryId=1001&ref=refs/heads/other']) test(`a caller cannot select an unauthorized scope: ${scope}`, async () => {
  const f = fixture(); assert.equal((await f.read('/api/dashboard/v1/observation?' + scope)).response.status, 403); assert.equal(f.state.calls.length, 0);
});
test('an old context header never grants access', async () => {
  const f = fixture(); assert.equal((await f.read(observationPath, { headers: { 'x-dashboard-context': 'old-context' } })).response.status, 403); assert.equal(f.state.calls.length, 0);
});
test('a missing latest-attempt read removes that pair rather than falling back to an old passing/failing run', async () => {
  const f = fixture(), original = f.state.provider;
  f.state.provider = async (operation, args) => operation === 'run.get' ? Promise.reject(new DashboardProviderError('unsupported')) : original(operation, args);
  const { response, body } = await f.read(); assert.equal(response.status, 200); assert.equal(body.coverage.complete, false); assert.deepEqual(body.runs, []);
});
test('a newer queued attempt replaces its earlier completed attempt', async () => {
  const f = fixture(), original = f.state.provider;
  f.state.provider = async (operation, args) => operation === 'run.get' ? { ...rawRun(), run_attempt: 2, status: 'queued', conclusion: null } : original(operation, args);
  const { body } = await f.read(); assert.equal(body.coverage.complete, true); assert.equal(body.runs.length, 1); assert.equal(body.runs[0].attempt, 2); assert.equal(body.runs[0].conclusion, null);
});
test('a contradictory older detail or different commit cannot substitute for selected current evidence', async () => {
  for (const change of [{ run_attempt: 0 }, { head_sha: 'b'.repeat(40) }, { id: '9999' }]) {
    const f = fixture(), original = f.state.provider;
    f.state.provider = async (operation, args) => operation === 'run.get' ? { ...rawRun(), ...change } : original(operation, args);
    const { body } = await f.read(); assert.equal(body.coverage.complete, false); assert.deepEqual(body.runs, []);
  }
});
test('same-attempt older detail cannot replace a newer running list observation with success', async () => {
  const f = fixture(), original = f.state.provider;
  f.state.provider = async (operation, args) => operation === 'run.list' ? { items: [{ ...rawRun(), status: 'in_progress', conclusion: null, updated_at: new Date(now - 10_000).toISOString() }], page: 1, perPage: 100, totalCount: 1, hasMore: false } : original(operation, args);
  const { body } = await f.read(); assert.equal(body.coverage.complete, false); assert.deepEqual(body.runs, []);
});
test('detached installation policy cannot change a deployment deny through an accessor during validation', async () => {
  const f = fixture();
  f.ports.binding = async () => {
    const value = structuredClone(f.state.context); let reads = 0;
    Object.defineProperty(value.repositories[0], 'deployments', { enumerable: true, get: () => ++reads === 1 ? false : 'true' });
    return value;
  };
  const { response, body } = await f.read(); assert.equal(response.status, 200); assert.equal(body.deployments.availability, 'forbidden');
  assert.equal(f.state.calls.some(call => call.operation.startsWith('deployment.')), false);
});
test('immutable repository substitution is denied even when the slug and Git SHA match', async () => {
  const f = fixture(), original = f.state.provider; let reads = 0;
  f.state.provider = async (operation, args) => operation === 'repo.get' && ++reads === 2 ? { id: '1002', full_name: 'example/dashboard' } : original(operation, args);
  assert.equal((await f.read()).response.status, 403);
});
test('branch movement during aggregation returns no merged observation', async () => {
  const f = fixture(), original = f.state.provider; let reads = 0;
  f.state.provider = async (operation, args) => operation === 'branch.get' && ++reads === 2 ? { name: 'main', commit: { sha: 'b'.repeat(40) } } : original(operation, args);
  const { response, body } = await f.read(); assert.equal(response.status, 503); assert.equal(body.runs, undefined);
});
test('the page cap is incomplete even with only successful runs', async () => {
  const f = fixture(), original = f.state.provider;
  f.state.provider = async (operation, args) => operation === 'run.list' ? { items: Array.from({ length: 100 }, (_, index) => rawRun(String(args.page * 100 + index))), page: args.page, perPage: 100, totalCount: 1000, hasMore: true } : original(operation, args);
  const { body } = await f.read(); assert.equal(body.coverage.complete, false); assert.equal(body.coverage.truncated, true); assert.equal(body.coverage.pages, 5); assert.equal(body.runs.length, 500);
});
test('a later page failure preserves known rows with explicit incomplete coverage', async () => {
  const f = fixture(), original = f.state.provider;
  f.state.provider = async (operation, args) => operation === 'run.list' ? args.page === 1 ? { items: [rawRun()], page: 1, perPage: 100, totalCount: 2, hasMore: true } : Promise.reject(new DashboardProviderError('rate_limited')) : original(operation, args);
  const { body } = await f.read(); assert.equal(body.coverage.complete, false); assert.equal(body.runs.length, 1);
});
test('authorization loss during pagination overrides partial successful data', async () => {
  const f = fixture(), original = f.state.provider;
  f.state.provider = async (operation, args) => {
    if (operation === 'run.list') {
      if (args.page === 1) return { items: [rawRun()], page: 1, perPage: 100, totalCount: 2, hasMore: true };
      f.state.context = null; throw new Error('PRIVATE_BODY_NEVER_RETURN');
    }
    return original(operation, args);
  };
  const { response, body } = await f.read(); assert.equal(response.status, 403); assert.deepEqual(body, { error: 'Dashboard read unavailable.' });
});
test('deployment denial stays separate from CI while whole-connection denial clears everything', async () => {
  for (const kind of ['forbidden', 'unsupported', 'unauthorized']) {
    const f = fixture(), original = f.state.provider; f.state.context.repositories[0].deployments = true;
    f.state.provider = async (operation, args) => operation === 'deployment.list' ? Promise.reject(new DashboardProviderError(kind)) : original(operation, args);
    const { response, body } = await f.read();
    if (kind === 'unauthorized') { assert.equal(response.status, 403); assert.equal(body.runs, undefined); }
    else { assert.equal(response.status, 200); assert.equal(body.coverage.complete, true); assert.deepEqual(body.deployments, { availability: kind, items: [] }); }
  }
});
test('deployment status history cannot imply success without resolving its current observation', async () => {
  const f = fixture(), original = f.state.provider; f.state.context.repositories[0].deployments = true;
  f.state.provider = async (operation, args) => operation === 'deployment.list' ? { items: [{ id: '4001', environment: 'preview', created_at: new Date(now - 1000).toISOString(), sha: commit }], page: 1, perPage: 10, hasMore: false } :
    operation === 'deployment.status.list' ? { items: [{ id: '5001', state: 'success', created_at: new Date(now - 500).toISOString() }], page: 1, perPage: 100, hasMore: true } : original(operation, args);
  const { body } = await f.read(); assert.equal(body.deployments.availability, 'partial'); assert.equal(body.deployments.items[0].state, 'unknown');
});
for (const mode of ['future', 'contradictory-duplicate']) test(`deployment status ${mode} cannot display as successful`, async () => {
  const f = fixture(), original = f.state.provider; f.state.context.repositories[0].deployments = true;
  f.state.provider = async (operation, args) => operation === 'deployment.list' ? { items: [{ id: '4001', environment: 'preview', created_at: new Date(now - 1000).toISOString(), sha: commit }], page: 1, perPage: 10, hasMore: false } :
    operation === 'deployment.status.list' ? { items: mode === 'future' ? [{ id: '5001', state: 'success', created_at: new Date(now + 60_000).toISOString() }] :
      [{ id: '5001', state: 'success', created_at: new Date(now - 500).toISOString() }, { id: '5001', state: 'failure', created_at: new Date(now - 500).toISOString() }], page: 1, perPage: 100, hasMore: false } : original(operation, args);
  const { response, body } = await f.read(); assert.equal(response.status, 200); assert.equal(body.coverage.complete, true);
  assert.equal(body.deployments.availability, 'partial'); assert.equal(body.deployments.items[0].state, 'unknown');
});
test('cancellation ends a request even if the trusted port ignores abort and answers late', async () => {
  const f = fixture(), controller = new AbortController(); let resolve, started;
  const waiting = new Promise(yes => { started = yes; });
  f.state.provider = () => { started(); return new Promise(yes => { resolve = yes; }); };
  const response = f.handler(f.request(observationPath, { signal: controller.signal })); await waiting; controller.abort();
  assert.equal((await response).status, 503); resolve({ id: '1001', full_name: 'example/dashboard' });
});
test('provider errors never echo tokens, raw response bodies or private run data', async () => {
  const f = fixture(); f.state.provider = async () => { throw new Error('SYNTHETIC_SECRET_PRIVATE_BODY'); };
  const { response, body } = await f.read(); assert.equal(response.status, 503); assert.deepEqual(body, { error: 'Dashboard read unavailable.' });
});
