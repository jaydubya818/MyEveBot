import { createHash } from 'node:crypto';

export type DashboardPrincipal = { ownerId: string; sessionRevision: string };
export type DashboardWorkflow = { id: string; name: string; event: string };
export type DashboardRepository = { id: string; name: string; defaultRef: string; refs: string[];
  workflows: DashboardWorkflow[]; deployments: boolean };
/** Supplied only by the trusted host's canonical authentication/installation policy.
 * This is a read context, not a grant, acceptance approval or execution permit. */
export type DashboardBinding = DashboardPrincipal & { installationId: string; accountId: string; agentId: string;
  connectionRevision: string; revision: string; expiresAt: number; repositories: DashboardRepository[] };
export type DashboardOperation = 'repo.get' | 'branch.get' | 'run.list' | 'run.get' | 'deployment.list' | 'deployment.status.list';
export type DashboardProviderFailure = 'forbidden' | 'unauthorized' | 'rate_limited' | 'unsupported' | 'unavailable';
export class DashboardProviderError extends Error {
  readonly kind: DashboardProviderFailure;
  constructor(kind: DashboardProviderFailure) { super(kind); this.kind = kind; }
}
export interface DashboardReadPorts {
  authenticate(request: Request, signal: AbortSignal): Promise<DashboardPrincipal | null>;
  /** Must recheck actual owner, session, installation, Agent, connection and grants.
   * Missing/revoked/unapproved bindings return null (denial). A transport outage
   * must be an error, not a false authorization result. Never use HTTP input. */
  binding(principal: DashboardPrincipal, signal: AbortSignal): Promise<DashboardBinding | null>;
  /** Canonical account/Agent Relay transport; no credentials or owner override in args.
   * Must honor signal, reject redirects, bound JSON and preserve typed denials. */
  read(binding: DashboardBinding, operation: DashboardOperation, args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
  now?(): number;
}
type Run = { id: string; workflowId: string; event: string; ref: string; headSha: string; attempt: number;
  status: string; conclusion: string | null; title: string; createdAt: number; updatedAt: number };
type Deployment = { id: string; environment: string; state: string; createdAt: number; sha: string };
class ReadFault extends Error { readonly status: number; constructor(status: number) { super('Dashboard read unavailable'); this.status = status; } }
const fail = (status = 502): never => { throw new ReadFault(status); };
const WINDOW = 86_400_000, AGE = 300_000, PAGE_SIZE = 100, MAX_PAGES = 5, MAX_CALLS = 32;
const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; frame-ancestors 'none'" };
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  return value as Record<string, unknown>;
}
function exact(value: unknown, fields: string[]) {
  const result = object(value);
  if (Object.keys(result).sort().join(',') !== [...fields].sort().join(',')) return fail();
  return result;
}
function text(value: unknown, max = 160): string {
  if (typeof value !== 'string' || !value.length || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) return fail();
  return value;
}
function integer(value: unknown, minimum = 0): number {
  return Number.isSafeInteger(value) && Number(value) >= minimum ? Number(value) : fail();
}
function id(value: unknown): string {
  const result = typeof value === 'number' ? String(integer(value, 1)) : text(value, 20);
  return /^[1-9][0-9]{0,19}$/.test(result) ? result : fail();
}
function sha(value: unknown): string { const result = text(value, 40); return /^[a-f0-9]{40}$/.test(result) ? result : fail(); }
function ref(value: unknown): string {
  const result = text(value, 255);
  if (!result.startsWith('refs/heads/') || /[\\~^:?*\[\s]/.test(result) || result.includes('..') || result.includes('@{') ||
    result.split('/').some(part => !part || part.startsWith('.') || part.endsWith('.') || part.endsWith('.lock'))) return fail();
  return result;
}
function timestamp(value: unknown): number {
  const result = typeof value === 'string' ? Date.parse(value) : integer(value);
  return Number.isSafeInteger(result) && result >= 0 && result <= 8_640_000_000_000_000 ? result : fail();
}
function array<T>(value: unknown, max: number, decode: (entry: unknown) => T): T[] {
  return Array.isArray(value) && value.length <= max ? value.map(decode) : fail();
}
function unique<T>(value: T[], key: (item: T) => string): T[] { return new Set(value.map(key)).size === value.length ? value : fail(); }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
function trusted<T>(decode: () => T): T { try { return decode(); } catch { return fail(403); } }
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new ReadFault(503));
    if (signal.aborted) { void promise.catch(() => {}); abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    promise.then(value => { signal.removeEventListener('abort', abort); resolve(value); },
      error => { signal.removeEventListener('abort', abort); reject(error); });
  });
}
function principal(value: unknown): DashboardPrincipal {
  const p = exact(value, ['ownerId', 'sessionRevision']);
  return { ownerId: text(p.ownerId, 128), sessionRevision: text(p.sessionRevision, 128) };
}
function binding(value: unknown, owner: DashboardPrincipal, now: number): DashboardBinding {
  const r = exact(structuredClone(value), ['ownerId', 'sessionRevision', 'installationId', 'accountId', 'agentId', 'connectionRevision', 'revision', 'expiresAt', 'repositories']);
  const result: DashboardBinding = { ...owner, installationId: text(r.installationId, 128), accountId: text(r.accountId, 128), agentId: text(r.agentId, 128),
    connectionRevision: text(r.connectionRevision, 128), revision: text(r.revision, 128), expiresAt: timestamp(r.expiresAt),
    repositories: unique(array(r.repositories, 100, entry => {
      const repo = exact(entry, ['id', 'name', 'defaultRef', 'refs', 'workflows', 'deployments']);
      const name = text(repo.name, 200), refs = unique(array(repo.refs, 100, ref), item => item), defaultRef = ref(repo.defaultRef);
      if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(name) || name.split('/').some(part => part === '.' || part === '..') ||
        !refs.includes(defaultRef) || typeof repo.deployments !== 'boolean') return fail();
      return { id: id(repo.id), name, defaultRef, refs, deployments: repo.deployments,
        workflows: unique(array(repo.workflows, 100, workflow => {
          const item = exact(workflow, ['id', 'name', 'event']);
          return { id: id(item.id), name: text(item.name), event: text(item.event, 64) };
        }), item => `${item.id}:${item.event}`) };
    }), item => item.id) };
  if (r.ownerId !== owner.ownerId || r.sessionRevision !== owner.sessionRevision || result.expiresAt <= now || result.expiresAt > now + AGE) return fail(403);
  return result;
}
function page(value: unknown, number: number, size = PAGE_SIZE, actions = false) {
  const p = exact(value, ['items', 'page', 'perPage', 'hasMore', ...(actions ? ['totalCount'] : [])]);
  if (p.page !== number || p.perPage !== size || typeof p.hasMore !== 'boolean') return fail();
  const items = array(p.items, size, object);
  const total = actions ? integer(p.totalCount) : undefined;
  if (total !== undefined && total < (number - 1) * size + items.length && items.length) return fail();
  return { items, hasMore: p.hasMore, total };
}
function run(value: unknown, repo: DashboardRepository): Run {
  const item = object(value), repository = object(item.repository);
  if (id(repository.id) !== repo.id || text(repository.full_name, 200).toLowerCase() !== repo.name.toLowerCase()) return fail(403);
  const result = { id: id(item.id), workflowId: id(item.workflow_id), event: text(item.event, 64), ref: ref(`refs/heads/${text(item.head_branch, 244)}`),
    headSha: sha(item.head_sha), attempt: integer(item.run_attempt, 1), status: text(item.status, 64),
    conclusion: item.conclusion === null ? null : text(item.conclusion, 64), title: text(item.display_title, 300),
    createdAt: timestamp(item.created_at), updatedAt: timestamp(item.updated_at) };
  if (result.updatedAt < result.createdAt) return fail();
  return result;
}
const compareId = (a: string, b: string) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
const sorted = (runs: Run[]) => [...runs].sort((a, b) => b.createdAt - a.createdAt || compareId(b.id, a.id) || b.attempt - a.attempt);
const authorizationFailure = (error: unknown) => error instanceof ReadFault && error.status === 403 ||
  error instanceof DashboardProviderError && (error.kind === 'forbidden' || error.kind === 'unauthorized');

/** Host composition supplies canonical ports; absent composition is unavailable.
 * Nothing registers a route, installs a capability, retries or creates authority. */
export function createDashboardReadHandler(ports?: DashboardReadPorts) {
  return async (request: Request): Promise<Response> => {
    const respond = (body: unknown, status = 200) => {
      const encoded = JSON.stringify(body);
      if (Buffer.byteLength(encoded) > 524_288) return Response.json({ error: 'Dashboard read unavailable.' }, { status: 502, headers });
      return new Response(encoded, { status, headers: { ...headers, 'content-type': 'application/json' } });
    };
    try {
      if (request.method !== 'GET') return new Response(null, { status: 405, headers: { ...headers, allow: 'GET' } });
      const url = new URL(request.url), catalog = url.pathname === '/api/dashboard/v1/context';
      if (!catalog && url.pathname !== '/api/dashboard/v1/observation') return respond({ error: 'Dashboard read unavailable.' }, 404);
      if (url.search.length > 1000 || [...url.searchParams.keys()].some(key => !['repositoryId', 'ref'].includes(key)) ||
        catalog && url.search || [...url.searchParams.keys()].some(key => url.searchParams.getAll(key).length !== 1)) return fail(400);
      if (request.headers.get('sec-fetch-site') === 'cross-site' || request.headers.has('origin') && request.headers.get('origin') !== url.origin) return fail(403);
      if (!ports) return respond({ error: 'Dashboard read unavailable.' }, 503);
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]), now = ports.now ?? Date.now;
      signal.throwIfAborted();
      const actor = await abortable(ports.authenticate(request, signal), signal); if (!actor) return fail(401);
      const owner = trusted(() => principal(actor)), raw = await abortable(ports.binding(owner, signal), signal); if (!raw) return fail(403);
      const context = trusted(() => binding(raw, owner, now())), original = digest(context);
      const gate = async () => {
        signal.throwIfAborted();
        const freshOwner = await abortable(ports.authenticate(request, signal), signal); if (!freshOwner || digest(trusted(() => principal(freshOwner))) !== digest(owner)) return fail(403);
        const fresh = await abortable(ports.binding(owner, signal), signal);
        if (!fresh || digest(trusted(() => binding(fresh, owner, now()))) !== original) return fail(403);
      };
      let calls = 0;
      const read = async (operation: DashboardOperation, args: Record<string, unknown>) => {
        await gate(); if (++calls > MAX_CALLS) throw new DashboardProviderError('unavailable');
        try { const result = await abortable(ports.read(structuredClone(context), operation, args, signal), signal); await gate(); return result; }
        catch (error) { await gate(); throw error; }
      };
      const authorization = { ownerId: owner.ownerId, revision: context.revision, expiresAt: context.expiresAt };
      if (catalog) {
        await gate();
        return respond({ serverTime: now(), authorization, repositories: context.repositories.map(({ id, name, defaultRef, refs }) => ({ id, name, defaultRef, refs })) });
      }
      if ([...url.searchParams].length !== 2) return fail(400);
      let repositoryId: string, fullRef: string;
      try { repositoryId = id(url.searchParams.get('repositoryId')); fullRef = ref(url.searchParams.get('ref')); } catch { return fail(400); }
      if (request.headers.get('x-dashboard-context') !== context.revision) return fail(403);
      const repo = context.repositories.find(item => item.id === repositoryId && item.refs.includes(fullRef)); if (!repo) return fail(403);
      const [repoOwner, repoName] = repo.name.split('/'), args = { owner: repoOwner, repo: repoName };
      const checkRepository = async () => {
        const actualRepository = object(await read('repo.get', args));
        if (id(actualRepository.id) !== repo.id || text(actualRepository.full_name, 200).toLowerCase() !== repo.name.toLowerCase()) return fail(403);
      };
      await checkRepository();
      const branchName = fullRef.slice('refs/heads/'.length);
      const tip = async () => {
        const value = object(await read('branch.get', { ...args, branch: branchName }));
        if (value.name !== branchName) return fail(403);
        return sha(object(value.commit).sha);
      };
      const headSha = await tip(), observedAt = now(), start = observedAt - WINDOW;
      let complete = true, truncated = false, pages = 0, more = false;
      const runs = new Map<string, Run>();
      for (let number = 1; number <= MAX_PAGES; number++) {
        let p: ReturnType<typeof page>;
        try { p = page(await read('run.list', { ...args, branch: branchName, headSha, created: `${new Date(start).toISOString()}..${new Date(observedAt).toISOString()}`, page: number, perPage: PAGE_SIZE }), number, PAGE_SIZE, true); }
        catch (error) { if (!pages || authorizationFailure(error)) throw error; complete = false; break; }
        pages++; more = p.hasMore;
        for (const rawRun of p.items) {
          const item = run(rawRun, repo);
          if (item.ref !== fullRef || item.headSha !== headSha || item.createdAt < start || item.createdAt > observedAt) continue;
          const key = `${item.id}:${item.attempt}`, prior = runs.get(key);
          if (prior) { complete = false; if (digest(prior) !== digest(item)) return fail(); }
          else runs.set(key, item);
        }
        if (!more) break;
      }
      if (more && pages === MAX_PAGES) { complete = false; truncated = true; }
      let resolvedRuns = sorted([...runs.values()]);
      // Detail reads resolve each selected pair's latest attempt. An unavailable
      // detail removes that pair's rows rather than substituting an older pass/fail.
      for (const workflow of repo.workflows) {
        const selected = resolvedRuns.find(item => item.workflowId === workflow.id && item.event === workflow.event);
        if (!selected) { complete = false; continue; }
        try {
          const current = run(await read('run.get', { ...args, runId: selected.id }), repo);
          if (current.id !== selected.id || current.workflowId !== selected.workflowId || current.event !== selected.event ||
            current.ref !== selected.ref || current.headSha !== selected.headSha || current.createdAt !== selected.createdAt || current.attempt < selected.attempt ||
            current.updatedAt < selected.updatedAt || current.attempt === selected.attempt && current.updatedAt === selected.updatedAt &&
            (current.status !== selected.status || current.conclusion !== selected.conclusion)) return fail();
          resolvedRuns = resolvedRuns.filter(item => item.id !== current.id); resolvedRuns.push(current);
        } catch (error) {
          if (authorizationFailure(error)) throw error;
          complete = false; resolvedRuns = resolvedRuns.filter(item => item.workflowId !== workflow.id || item.event !== workflow.event);
        }
      }
      let deployments: { availability: 'available' | 'none' | 'forbidden' | 'unsupported' | 'partial'; items: Deployment[] } = { availability: 'forbidden', items: [] };
      if (repo.deployments) {
        try {
          const listed = page(await read('deployment.list', { ...args, page: 1, perPage: 10 }), 1, 10);
          deployments = { availability: listed.hasMore ? 'partial' : listed.items.length ? 'available' : 'none', items: [] };
          for (const entry of listed.items) {
            const deploymentId = id(entry.id), item = { id: deploymentId, environment: text(entry.environment), state: 'unknown', createdAt: timestamp(entry.created_at), sha: sha(entry.sha) };
            try {
              const statuses = page(await read('deployment.status.list', { ...args, deploymentId, page: 1, perPage: 100 }), 1);
              if (statuses.hasMore || !statuses.items.length) deployments.availability = 'partial';
              else {
                const observedStatuses = unique(statuses.items.map(value => ({ id: id(value.id), state: text(value.state, 64), createdAt: timestamp(value.created_at) })), value => value.id);
                if (observedStatuses.some(value => value.createdAt > now() || value.createdAt < item.createdAt)) return fail();
                const latest = observedStatuses.sort((a, b) => b.createdAt - a.createdAt || compareId(b.id, a.id))[0];
                item.state = latest.state;
              }
            } catch (error) { if (authorizationFailure(error)) throw error; deployments.availability = 'partial'; }
            deployments.items.push(item);
          }
        } catch (error) {
          if (error instanceof ReadFault && error.status === 403) throw error;
          deployments = { availability: error instanceof DashboardProviderError && error.kind === 'forbidden' ? 'forbidden' :
            error instanceof DashboardProviderError && error.kind === 'unsupported' ? 'unsupported' : 'partial', items: [] };
          if (error instanceof DashboardProviderError && error.kind === 'unauthorized') throw error;
        }
      }
      if (await tip() !== headSha) return fail(503);
      await checkRepository();
      await gate(); const serverTime = now();
      if (resolvedRuns.some(item => item.createdAt > serverTime || item.updatedAt > serverTime) || deployments.items.some(item => item.createdAt > serverTime)) return fail();
      return respond({ serverTime, authorization, repositoryId, ref: fullRef, headSha, observedAt,
        coverage: { complete, truncated, pages, start, end: observedAt }, workflows: repo.workflows, runs: sorted(resolvedRuns), deployments });
    } catch (error) {
      const status = error instanceof ReadFault ? error.status : error instanceof DashboardProviderError ?
        error.kind === 'unauthorized' || error.kind === 'forbidden' ? 403 : error.kind === 'rate_limited' ? 429 : 503 : 503;
      return respond({ error: 'Dashboard read unavailable.' }, status);
    }
  };
}
