import {retainedFactoryCheckpoint,retainedFactoryAccounting} from "./factory-checkpoint.ts";
import { factoryAction, factoryActionSchema } from './factory-api.ts';
import { FactoryEvidenceStore } from './factory-evidence-store.ts';
import type { FactoryBinding } from './factory-receipt-store.ts';
import { digest } from './factory-producer-protocol.ts';
import type { ExecutionSnapshot } from './factory-producer-protocol.ts';
import { EngineeringWorkerProjectionStore, type EngineeringProjectionSnapshot } from './worker-projection.ts';
import { WorkStore } from './store.ts';
import { WorkError } from './types.ts';

interface SessionRow {
  id: string;
  work_version: number;
  work_generation: number;
  status: string;
  dispatch_state: string;
  stop_reason: string | null;
  provider_id: string;
  provider_version: string;
  factory_request_id: string;
  agent_id: string;
  binding: FactoryBinding;
  observation: { state?: string; snapshot?: ExecutionSnapshot } | null;
  updated_at: string | Date;
}

export type CodingSessionState = 'PREPARED' | 'RUNNING_REPORTED' | 'RECONCILIATION_REQUIRED'
  | 'INTERRUPTING' | 'COMPLETED_UNVERIFIED' | 'INDEPENDENT_CHECKS_PASSED'
  | 'VERIFICATION_FAILED' | 'FAILED' | 'CANCELLED' | 'HISTORICAL';

const capability = (supported: boolean, reason: string) => ({ supported, status: supported ? 'IMPLEMENTED' as const : 'DEFERRED' as const, reason, authorityGranted: false as const });

/** A presentation facade over existing Work/Run/Factory records. It owns no
 * task state, execution lease, permission, dispatch retry or accounting. The
 * default command path is the same guarded/queued factoryAction used by Sofie. */
export class FactoryCodingSessionAdapter {
  constructor(
    readonly store: WorkStore,
    private readonly invoke: typeof factoryAction = factoryAction,
    private readonly projections = new EngineeringWorkerProjectionStore(store),
  ) {}

  private owner() {
    const principal = this.store.principal;
    if (principal.scopeKind !== 'personal' || principal.actorId !== principal.scopeId)
      throw new WorkError('coding_session_owner', 'Current Work owner authority is required.', 403);
  }

  async command(id: string, value: unknown) {
    this.owner();
    const input = factoryActionSchema.parse(value), work = await this.store.get(id);
    if (work.version !== input.expectedWorkVersion || work.generation !== input.expectedWorkGeneration)
      throw new WorkError('factory_work_changed', 'Reload the current Work before acting.');
    // No direct driver, transport, shell, alternate provider, new request ID or
    // fallback. Admission, qualification, budgets and UNKNOWN remain upstream.
    return this.invoke(this.store, id, input);
  }

  start(id: string, revision: { expectedWorkVersion: number; expectedWorkGeneration: number }) {
    return this.command(id, { ...revision, operation: 'start' });
  }

  interrupt(id: string, revision: { expectedWorkVersion: number; expectedWorkGeneration: number }) {
    return this.command(id, { ...revision, operation: 'stop' });
  }

  reconcile(id: string, revision: { expectedWorkVersion: number; expectedWorkGeneration: number }) {
    return this.command(id, { ...revision, operation: 'reconcile' });
  }

  handoffToOwner(id: string, revision: { expectedWorkVersion: number; expectedWorkGeneration: number }) {
    return this.command(id, { ...revision, operation: 'takeover' });
  }

  async resume(id: string) {
    this.owner();
    await this.store.get(id);
    return capability(false, 'In-place coding-process resume is not qualified. Use reconcile on the same Work; terminal Attempts cannot be restarted.');
  }

  /** SELECT-only observation, including independent readback of retained Proof
   * bytes. Reading never calls reconcile, prepares work or retries an effect. */
  async observe(id: string, observed?: EngineeringProjectionSnapshot) {
    this.owner();
    const work = await this.store.get(id);
    const snapshot = observed ?? await this.projections.get(id);
    if (snapshot.work.id !== id || snapshot.work.scopeId !== work.scopeId ||
        snapshot.work.version !== work.version || snapshot.work.generation !== work.generation)
      throw new WorkError('coding_session_changed', 'Work changed; reload the session observation.');
    const p = snapshot.projection, scope = [this.store.principal.scopeId, this.store.principal.scopeKind, id];
    const [rows, events, history] = await Promise.all([
      this.store.database.query(`SELECT r.id,r.work_version,r.work_generation,r.status,r.dispatch_state,r.stop_reason,
        r.provider_id,r.provider_version,r.factory_request_id,r.updated_at,q.agent_id,q.binding,
        d.factory_observation->'value' AS observation
        FROM engineering_route_runs r
        JOIN engineering_factory_requests q ON q.id=r.factory_request_id
          AND q.scope_id=r.scope_id AND q.scope_kind=r.scope_kind AND q.work_id=r.work_id AND q.actor_id=$4
        JOIN engineering_routing_decisions d ON d.id=r.decision_id
          AND d.scope_id=r.scope_id AND d.scope_kind=r.scope_kind AND d.work_id=r.work_id
        WHERE r.scope_id=$1 AND r.scope_kind=$2 AND r.work_id=$3 AND r.route='MYFACTORY'
        ORDER BY r.updated_at DESC,r.id DESC LIMIT 100`, [...scope, this.store.principal.actorId]),
      this.store.events(id),
      this.store.database.query(`SELECT revision,kind,actor_id,created_at FROM engineering_execution_history
        WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 ORDER BY revision DESC LIMIT 200`, scope),
    ]);
    const artifacts: { reference: string; kind: string; candidate: string; sha256: string; size: number; integrity: 'VERIFIED_BYTES' }[] = [];
    const proof = p.nativeResult;
    if (proof) {
      // Existing Result projection verifies its content hash. Factory evidence
      // readback also verifies retained bytes against the admitted signed Result.
      const refs = proof.proof.artifactRefs.filter(ref => ref.startsWith('factory-evidence:sha256:'));
      for (const ref of refs) {
        const evidence = await new FactoryEvidenceStore(this.store).readProof(id, proof.id, ref);
        artifacts.push({ reference: ref, kind: evidence.ref.kind, candidate: evidence.ref.candidateCommit,
          sha256: evidence.ref.sha256, size: evidence.ref.size, integrity: 'VERIFIED_BYTES' });
      }
    }
    const sessions = (rows as unknown as SessionRow[]).map(row => {
      const b = row.binding;
      if (!b || b.workId !== id || b.workVersion !== Number(row.work_version) ||
          b.workGeneration !== Number(row.work_generation) || b.agentId !== row.agent_id ||
          b.factoryId !== row.provider_id || b.factoryVersion !== row.provider_version)
        throw new WorkError('coding_session_binding', 'Stored session does not match its Factory binding.');
      const execution = row.observation?.snapshot;
      const metadata = execution && execution.factoryId === b.factoryId && execution.factoryVersion === b.factoryVersion && execution.runId === b.runId &&
        execution.requestId === b.requestId && execution.inputCommit === b.inputCommit &&
        execution.workOrderId === b.workOrderId && execution.sourceDigest === b.sourceDigest && execution.attemptNumber === b.attemptNumber &&
        execution.configurationDigest === b.configurationDigest && digest(execution.configuration) === b.configurationDigest
        ? execution.configuration : null;
      const current = Number(row.work_version) === work.version && Number(row.work_generation) === work.generation;
      const terminal = row.dispatch_state === 'TERMINAL';
      const sameRun = p.factoryWriter?.runId === row.id && current;
      const sameCandidate = sameRun && proof?.current === true &&
        p.verification.candidateSha === proof.proof.resultRevision;
      const independent = sameCandidate && p.verification.status === 'PASS' &&
        artifacts.length === 2 && new Set(artifacts.map(a => a.kind)).size === 2 &&
        artifacts.every(a => a.candidate === p.verification.candidateSha);
      const failedChecks = sameRun && p.verification.status === 'FAIL';
      let state: CodingSessionState;
      if (!current) state = 'HISTORICAL';
      else if (row.dispatch_state === 'UNKNOWN' || row.observation?.state === 'UNKNOWN' ||
          row.observation?.state === 'BLOCKED' || p.factoryAccounting?.blocker) state = 'RECONCILIATION_REQUIRED';
      else if (row.dispatch_state === 'STOPPING') state = 'INTERRUPTING';
      else if (terminal && row.status === 'CANCELLED') state = 'CANCELLED';
      else if (terminal && failedChecks) state = 'VERIFICATION_FAILED';
      else if (terminal && row.status === 'FAILED') state = 'FAILED';
      else if (terminal && independent) state = 'INDEPENDENT_CHECKS_PASSED';
      else if (terminal) state = 'COMPLETED_UNVERIFIED';
      else if (row.dispatch_state === 'DISPATCHED') state = 'RUNNING_REPORTED';
      else state = 'PREPARED';
      return {
        id: row.id, role: 'IMPLEMENTER' as const, assignedAgentId: row.agent_id,
        requestId: b.requestId, attemptId: b.runId, attemptNumber: b.attemptNumber,
        factoryId: b.factoryId, factoryVersion: b.factoryVersion,
        executor: metadata?.executor ?? null, executorVersion: metadata?.executorVersion ?? null,
        model: metadata?.model ?? null,
        repository: work.repository, baseSha: b.inputCommit,
        branch: null, worktree: execution?.version === 3 && metadata && execution.workspace?.kind === 'GIT_WORKTREE' ? execution.workspace.path : null,
        associationLimit: execution?.version === 3 && metadata && execution.workspace?.kind === 'GIT_WORKTREE' ? 'Producer-recorded detached Git worktree; no named branch is assigned.' : 'Deferred: this Factory version does not expose authenticated branch/worktree associations.',
        state, recordedStatus: row.status, dispatchState: row.dispatch_state, stopReason: row.stop_reason,
        currentGeneration: current, activeReported: current && !terminal,
        sessionCompleted: terminal, independentlyVerified: current && terminal && independent,
        verification: sameRun ? p.verification.status : 'NOT_ESTABLISHED',
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
      };
    });
    const historicalCheckpoint=await retainedFactoryCheckpoint(this.store,id);
    const accountingHistory=(await retainedFactoryAccounting(this.store,id)).map(r=>({workGeneration:r.workGeneration,requestId:r.requestId,terminal:r.terminal,
      ceilingMicrousd:'ceilingMicrousd' in r.spend?r.spend.ceilingMicrousd:null,settledMicrousd:'settledMicrousd' in r.spend?r.spend.settledMicrousd:null,
      retainedMicrousd:'retainedMicrousd' in r.spend?r.spend.retainedMicrousd:null,cancelled:'cancelled' in r.spend?r.spend.cancelled:null}));
    // Async evidence/history reads must not return a result under a changed Work.
    const latest = await this.store.get(id);
    if (latest.version !== work.version || latest.generation !== work.generation)
      throw new WorkError('coding_session_changed', 'Work changed during session observation. Reload.');
    const retained = sessions.some(s => s.currentGeneration);
    const result = proof ? { id: proof.id, version: proof.proof.workVersion,
      candidate: proof.proof.resultRevision ?? '', createdAt: proof.proof.createdAt,
      summary: `Protected verification: ${p.verification.status}. Retained Result: ${proof.proof.outcome}. Release readiness is separate.`,
    } : p.latestResult;
    return {
      source: 'canonical-work-attempt-records' as const, observationOnly: true as const,
      workId: id, expectedWorkVersion: work.version, expectedWorkGeneration: work.generation,
      status: p.status, progress: p.activity, nextStep: p.nextStep,
      control: work.control, lifecycle: work.lifecycle,
      sessions, artifacts, events, executionHistory: history,
      historicalCheckpoint, accountingHistory,
      routingHistory: snapshot.routing.transitions, candidateHistory: p.candidateHistory,
      result: result ? { ...result, current: proof?.current === true,
        independentlyVerified: sessions.some(session => session.independentlyVerified) } : null,
      verification: p.verification, accounting: p.factoryAccounting ?? null,
      readiness: p.readiness, publicationAuthorized: false as const,
      capabilities: {
        start: capability(true, 'Existing Factory admission rechecks identity, policy, budget, source and Factory Version; support is not authorization.'),
        observe: capability(true, 'Read canonical Work/Attempt state without advancing execution.'),
        interrupt: capability(retained, 'Stop the existing Factory writer; cancellation is pending until quiescence is proven.'),
        resume: capability(false, 'No qualified in-place resume. Reconcile the retained Attempt instead.'),
        reconcile: capability(retained || !!p.factoryPreparation, 'Use the retained dispatch identity; UNKNOWN is never blindly redispatched.'),
        results: capability(true, 'Return retained candidate verification and integrity-checked artifact references.'),
        handoffToOwner: capability(retained, 'Existing takeover stops and fences the writer before handing control to the owner.'),
        handoffToAgent: capability(false, 'Agent-to-agent productive handoff is not qualified by this adapter.'),
      },
    };
  }

  async results(id: string) {
    const view = await this.observe(id);
    return { result: view.result, verification: view.verification, artifacts: view.artifacts,
      readiness: view.readiness, publicationAuthorized: false as const };
  }
}
