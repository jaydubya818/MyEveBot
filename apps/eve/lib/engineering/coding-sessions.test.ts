import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { FactoryCodingSessionAdapter } from './coding-sessions.ts';
import { FactoryEvidenceStore } from './factory-evidence-store.ts';
import { digest } from './factory-producer-protocol.ts';
import { WorkError } from './types.ts';
import type { WorkStore } from './store.ts';
import type { EngineeringProjectionSnapshot, EngineeringWorkerProjectionStore } from './worker-projection.ts';

function fixture() {
  const id = randomUUID(), runId = randomUUID(), candidate = 'a'.repeat(40);
  const work = { id, scopeId: 'synthetic-owner', version: 2, generation: 2, repository: 'fixture/disposable' };
  const configuration = { executor: 'codex-cli', executorVersion: 'qualified-local', model: 'synthetic-model' };
  const binding = { workId: id, workVersion: 2, workGeneration: 2, agentId: 'synthetic-coder', factoryId: 'fixture-factory',
    factoryVersion: 'f'.repeat(64), runId: randomUUID(), requestId: randomUUID(), workOrderId: randomUUID(),
    attemptNumber: 1, inputCommit: 'b'.repeat(40), sourceDigest: 'd'.repeat(64), configurationDigest: digest(configuration) };
  const row = { id: runId, work_version: 2, work_generation: 2, status: 'RUNNING', dispatch_state: 'DISPATCHED',
    stop_reason: null, provider_id: binding.factoryId, provider_version: binding.factoryVersion,
    agent_id: binding.agentId, binding, updated_at: new Date(), observation: { state: 'RUNNING', snapshot: {
      ...binding, version: 1, configuration, configurationDigest: binding.configurationDigest,
    } } };
  const snapshot = { work, routing: { transitions: [] }, projection: { workId: id, status: 'Working', activity: 'Factory running', nextStep: 'Observe the same Attempt',
    factoryWriter: { runId }, verification: { status: 'NOT_RUN', candidateSha: candidate, evidenceCount: 0 },
    nativeResult: null, latestResult: null, readiness: { ready: false, reasons: ['Independent checks not established'] } } };
  const queries: string[] = [];
  const query = vi.fn(async (sql: string, _params?: unknown[]) => { queries.push(sql); return sql.includes('FROM engineering_route_runs r') ? [row] : []; });
  const store = { principal: { scopeId: work.scopeId, actorId: work.scopeId, scopeKind: 'personal' },
    get: vi.fn(async () => work), events: vi.fn(async () => []), database: { query } };
  const invoke = vi.fn().mockResolvedValue({ state: 'guarded-upstream' });
  const adapter = new FactoryCodingSessionAdapter(store as unknown as WorkStore, invoke,
    { get: async () => snapshot } as unknown as EngineeringWorkerProjectionStore);
  return { id, candidate, row, work, snapshot, queries, store, invoke, adapter };
}

let f: ReturnType<typeof fixture>;
beforeEach(() => { f = fixture(); });
afterEach(() => vi.restoreAllMocks());

describe('canonical coding session visibility', () => {
  it('observes existing attempts, agent and exact executor without mutation or invented paths', async () => {
    const view = await f.adapter.observe(f.id);
    expect(view.sessions[0]).toMatchObject({ id: f.row.id, assignedAgentId: f.row.agent_id,
      executor: 'codex-cli', attemptId: f.row.binding.runId, state: 'RUNNING_REPORTED',
      branch: null, worktree: null, independentlyVerified: false, sessionCompleted: false });
    expect(view.observationOnly).toBe(true);
    expect(f.invoke).not.toHaveBeenCalled();
    expect(f.queries.every(sql => sql.trimStart().startsWith('SELECT'))).toBe(true);
    expect(f.store.database.query.mock.calls[0][1]).toEqual(['synthetic-owner', 'personal', f.id, 'synthetic-owner']);
  });

  it('shows empty session state without creating an attempt', async () => {
    f.store.database.query.mockResolvedValue([]);
    const view = await f.adapter.observe(f.id);
    expect(view.sessions).toEqual([]);
    expect(view.capabilities.interrupt.supported).toBe(false);
    expect(f.invoke).not.toHaveBeenCalled();
  });

  it.each(['UNKNOWN', 'STOPPING'])('preserves %s without retrying or assuming cancellation', async state => {
    f.row.dispatch_state = state;
    const session = (await f.adapter.observe(f.id)).sessions[0];
    expect(session.state).toBe(state === 'UNKNOWN' ? 'RECONCILIATION_REQUIRED' : 'INTERRUPTING');
    expect(session.sessionCompleted).toBe(false);
    expect(f.invoke).not.toHaveBeenCalled();
  });

  it('never promotes completed execution to independent success', async () => {
    Object.assign(f.row, { dispatch_state: 'TERMINAL', status: 'COMPLETED' });
    f.snapshot.projection.verification.status = 'PASS';
    const session = (await f.adapter.observe(f.id)).sessions[0];
    expect(session.state).toBe('COMPLETED_UNVERIFIED');
    expect(session.independentlyVerified).toBe(false);
  });

  it('reports failed protected checks even when the coding session completed', async () => {
    Object.assign(f.row, { dispatch_state: 'TERMINAL', status: 'COMPLETED' });
    f.snapshot.projection.verification.status = 'FAIL';
    expect((await f.adapter.observe(f.id)).sessions[0].state).toBe('VERIFICATION_FAILED');
  });

  it('keeps previous-generation completion historical', async () => {
    f.work.generation = 3;
    Object.assign(f.row, { dispatch_state: 'TERMINAL', status: 'COMPLETED' });
    const session = (await f.adapter.observe(f.id)).sessions[0];
    expect(session.state).toBe('HISTORICAL');
    expect(session.currentGeneration).toBe(false);
    expect(session.independentlyVerified).toBe(false);
  });

  it('does not accept mismatched Factory identity or modified executor metadata', async () => {
    f.row.observation.snapshot.configuration.executor = 'unreviewed-executor';
    expect((await f.adapter.observe(f.id)).sessions[0].executor).toBeNull();
    f.row.binding.factoryVersion = 'changed';
    await expect(f.adapter.observe(f.id)).rejects.toMatchObject({ code: 'coding_session_binding' });
  });

  it('denies stale asynchronous snapshots and wrong-owner access before session queries', async () => {
    await expect(f.adapter.observe(f.id, { work: { ...f.work, scopeId: 'other' } } as EngineeringProjectionSnapshot))
      .rejects.toMatchObject({ code: 'coding_session_changed' });
    f.store.get.mockRejectedValue(new WorkError('work_not_found', 'Absent in this workspace', 404));
    await expect(f.adapter.observe(f.id)).rejects.toMatchObject({ code: 'work_not_found' });
    expect(f.store.database.query).not.toHaveBeenCalled();
    expect(f.invoke).not.toHaveBeenCalled();
  });

  it('denies delegated actors for reads and effects', async () => {
    f.store.principal.actorId = 'other';
    await expect(f.adapter.observe(f.id)).rejects.toMatchObject({ code: 'coding_session_owner' });
    await expect(f.adapter.start(f.id, { expectedWorkVersion: 2, expectedWorkGeneration: 2 }))
      .rejects.toMatchObject({ code: 'coding_session_owner' });
    expect(f.invoke).not.toHaveBeenCalled();
  });

  it('reports unsupported resume and agent handoff without an effect', async () => {
    expect((await f.adapter.resume(f.id)).supported).toBe(false);
    const view = await f.adapter.observe(f.id);
    expect(view.capabilities.handoffToAgent.supported).toBe(false);
    expect(Object.values(view.capabilities).every(c => c.authorityGranted === false)).toBe(true);
    expect(f.invoke).not.toHaveBeenCalled();
  });

  it('requires matching current Proof and two integrity-checked artifacts for a verified label', async () => {
    Object.assign(f.row, { dispatch_state: 'TERMINAL', status: 'COMPLETED' });
    const refs = ['factory-evidence:sha256:' + '1'.repeat(64), 'factory-evidence:sha256:' + '2'.repeat(64)];
    const unrelatedResultId = randomUUID();
    Object.assign(f.snapshot.projection, { verification: { status: 'PASS', candidateSha: f.candidate },
      nativeResult: { id: randomUUID(), current: true, proof: { resultRevision: f.candidate, artifactRefs: refs,
        workVersion: 2, createdAt: new Date().toISOString(), outcome: 'PARTIAL' } },
      latestResult: { id: unrelatedResultId, candidate: f.candidate, summary: 'PARTIAL; publication not authorized' } });
    const read = vi.spyOn(FactoryEvidenceStore.prototype, 'readProof').mockImplementation(async (_id, _result, ref) => ({
      ref: { kind: ref === refs[0] ? 'DiffEvidence' : 'TestEvidence', candidateCommit: f.candidate, sha256: ref.slice(-64), size: 10 },
    } as Awaited<ReturnType<FactoryEvidenceStore['readProof']>>));
    const view = await f.adapter.observe(f.id);
    expect(view.sessions[0].state).toBe('INDEPENDENT_CHECKS_PASSED');
    expect(view.sessions[0].independentlyVerified).toBe(true);
    expect(view.result?.id).not.toBe(unrelatedResultId);
    expect(view.readiness.ready).toBe(false);
    expect(view.publicationAuthorized).toBe(false);
    read.mockRejectedValue(new WorkError('factory_evidence_integrity', 'Tampered evidence'));
    await expect(f.adapter.results(f.id)).rejects.toMatchObject({ code: 'factory_evidence_integrity' });
    expect(f.invoke).not.toHaveBeenCalled();
  });
});

describe('bounded adapter uses existing Factory authority', () => {
  const revision = { expectedWorkVersion: 2, expectedWorkGeneration: 2 };
  it.each(['start', 'interrupt', 'reconcile', 'handoffToOwner'] as const)('%s delegates only the existing canonical command', async method => {
    await f.adapter[method](f.id, revision);
    const operation = { start: 'start', interrupt: 'stop', reconcile: 'reconcile', handoffToOwner: 'takeover' }[method];
    expect(f.invoke).toHaveBeenCalledExactlyOnceWith(f.store, f.id, { ...revision, operation });
  });

  it('propagates upstream budget, authorization and Factory qualification denials without fallback', async () => {
    for (const code of ['factory_denied', 'factory_spend_unqualified', 'factory_configuration_changed']) {
      f.invoke.mockRejectedValue(new WorkError(code, 'Denied'));
      await expect(f.adapter.start(f.id, revision)).rejects.toMatchObject({ code });
    }
    expect(f.invoke).toHaveBeenCalledTimes(3);
  });

  it('rejects stale revisions and caller-supplied provider controls before any effect', async () => {
    await expect(f.adapter.start(f.id, { ...revision, expectedWorkGeneration: 1 })).rejects.toMatchObject({ code: 'factory_work_changed' });
    await expect(f.adapter.command(f.id, { ...revision, operation: 'start', factoryVersion: 'injected' })).rejects.toThrow();
    expect(f.invoke).not.toHaveBeenCalled();
  });
});
