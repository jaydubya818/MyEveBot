import { prepareAuthenticatedLocalFactoryInputV4 } from "../engineering/factory-authenticated-result.ts";
import type { FactoryPrepareRequest, FactoryReadback } from "../engineering/factory-live-adapter.ts";
import type { FactoryExecutionIdentity } from "../engineering/factory-writer.ts";
import type { LocalFactoryBindingV4 } from "../engineering/factory-receipt-store.ts";
import { canonical } from "../engineering/factory-producer-protocol.ts";
import { ProviderNotSent, type KnownOutcome, type UnknownOutcome } from "./gate.ts";
import type { FactoryPort } from "./wiring.ts";
import type { StageStart } from "./factory-dispatch.ts";
import { QDEV_LIMITS } from "../external-alpha/qualification-accounting.ts";

/**
 * Adapter from the qdev journey's FactoryPort to the EXISTING LiveFactoryAdapter
 * (which in turn uses FactoryCapabilityClient for ordered admission). It adds no
 * transport, accounting or authority: the retained admission (binding, execution
 * identity, prepare request) comes from the host's trusted Work store, never from
 * a model reply or a returned Result.
 *
 * Preparation is network I/O that precedes the spend gate, so it runs in the async
 * `ready(stage)` step. The gate-time `admit` is synchronous and only returns a
 * stage that `ready` already proved; anything else is a pre-send refusal
 * (ProviderNotSent), which tombstones the claim without provider contact.
 * Disabled by default.
 */
export type FactoryLiveClient = {
  prepared(request: FactoryPrepareRequest): Promise<FactoryReadback>;
  dispatch(identity: FactoryExecutionIdentity): Promise<void>;
  /** Exact-identity readback (existing LiveFactoryAdapter.read): state, quiescence, evidence and spend accounting. */
  read(identity: FactoryExecutionIdentity): Promise<FactoryReadback>;
  /** Existing result channel: `{ state, result }`; the port unwraps it. */
  result(binding: LocalFactoryBindingV4): Promise<unknown>;
};
export type RetainedFactoryAdmission = { binding: unknown; identity: FactoryExecutionIdentity; request: FactoryPrepareRequest };
export type FactoryLivePortConfig = {
  enabled?: boolean; live: FactoryLiveClient; retained(stage: 1 | 2 | 3): RetainedFactoryAdmission | Promise<RetainedFactoryAdmission>;
  /** Maximum wait for terminal quiescence + spend proof before the operation is left fenced. */
  settleTimeoutMs?: number; pollMs?: number; sleep?: (ms: number) => Promise<void>; now?: () => number;
  /**
   * Required to settle an OWNER_SUBSCRIPTION_LOCAL (operations-only, unmetered) run: durably records the operation units BEFORE the gate settles.
   * Absent, or failing, an unmetered run is never settled (it is fenced): MyEve never converts unmetered usage into a money figure or $0.
   */
  recordSubscriptionUsage?: (usage: SubscriptionUsage) => Promise<void>;
};
/** One settled unmetered Factory run, as read back from the Factory's own operations-only ledger (MyFactory remains the spend authority). */
export type SubscriptionUsage = { metering: "SUBSCRIPTION_UNMETERED"; requestId: string; workOrderId: string; runId: string | null; state: string;
  operationsUsed: number; maxOperations: number; completionOperationsUsed: number; evidenceRef: string };
/** A Result is not available yet (RUNNING/STOPPING/UNKNOWN). Recovery re-reads; it never redispatches. */
export class FactoryResultPending extends Error {
  constructor(readonly state: string) { super("QDEV_FACTORY_RESULT_PENDING:" + state); }
}

export class FactoryLivePortRefused extends Error {
  constructor(readonly code: string) { super(code); }
}
const refuse = (code: string): never => { throw new FactoryLivePortRefused(code); };

const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED", "NOT_DISPATCHED"]);
/** Consecutive transport-level readback failures tolerated before the operation is left unsettled (the gate then fences). */
export const MAX_TRANSIENT_READS = 5;
/** Transport-level only: a timed-out/aborted request, a connection failure, or the adapter's non-OK 429/5xx. Never a validation failure. */
export function isTransientReadFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "TimeoutError" || error.name === "AbortError") return true;
  if (error instanceof TypeError && error.message === "fetch failed") return true;
  return /^Factory control unavailable \((429|5\d\d)\); reconcile the same request$/.test(error.message);
}
/** Operator diagnostics (server log only): printable message chain, bounded. */
export function errorSummary(error: unknown): string {
  const parts: string[] = [];
  for (let e: unknown = error, i = 0; e instanceof Error && i < 5; e = (e as Error & { cause?: unknown }).cause, i++) parts.push(`${e.name}: ${e.message}`);
  return (parts.join(" <- ") || String(error)).replace(/[^\x20-\x7e]/g, " ").slice(0, 600);
}
const unsettled = (why: string): { known: false } => { console.error(`[qdev] factory readback left unsettled: ${why.replace(/[^\x20-\x7e]/g, " ").slice(0, 300)}`); return { known: false }; };
type Ready = { binding: LocalFactoryBindingV4; identity: FactoryExecutionIdentity; admitted: unknown; ceilingMicrousd: number };

export class LiveFactoryPort implements FactoryPort {
  private readonly ready_ = new Map<1 | 2 | 3, Ready>();
  private readonly subscription: SubscriptionUsage[] = [];
  /** Unmetered usage settled by this port (operations only; null when no run was unmetered). Presentation only: it confers nothing. */
  subscriptionUsage(): { metering: "SUBSCRIPTION_UNMETERED"; operations: number; runs: number } | null {
    return this.subscription.length ? { metering: "SUBSCRIPTION_UNMETERED", operations: this.subscription.reduce((n, u) => n + u.operationsUsed, 0), runs: this.subscription.length } : null;
  }
  constructor(private readonly c: FactoryLivePortConfig) {}

  /** Proves, before any gate claim, that Factory holds a prepared execution matching the retained admission. */
  async ready(stage: 1 | 2 | 3): Promise<void> {
    if (this.c.enabled !== true) refuse("QDEV_FACTORY_DISABLED");
    const retained = await this.c.retained(stage);
    const binding = prepareAuthenticatedLocalFactoryInputV4(retained.binding);
    this.checkIdentity(binding, retained.identity, retained.request);
    const ceilingMicrousd = this.nativeCeiling(retained.request);
    const readback = await this.c.live.prepared(retained.request);
    const s = readback.snapshot as Record<string, unknown> | null;
    if (readback.state !== "PREPARED" || !s) refuse("QDEV_FACTORY_NOT_PREPARED");
    if (readback.requestId !== binding.requestId || readback.workOrderId !== binding.workOrderId || readback.runId !== binding.runId)
      refuse("QDEV_FACTORY_PREPARED_MISMATCH");
    const snap = s as Record<string, any>;
    for (const f of ["factoryId", "factoryVersion", "sourceDigest", "configurationDigest", "requestId", "workOrderId", "runId", "attemptNumber", "inputCommit", "inputTree"] as const)
      if (snap[f] !== (binding as unknown as Record<string, unknown>)[f]) refuse("QDEV_FACTORY_PREPARED_MISMATCH");
    if (canonical(snap.configuration) !== canonical(binding.configuration)) refuse("QDEV_FACTORY_PREPARED_MISMATCH");
    this.ready_.set(stage, { binding, identity: structuredClone(retained.identity), admitted: structuredClone(retained.binding), ceilingMicrousd });
  }

  /**
   * Journey lifecycle hook: runs after the preceding stage's candidate was ACCEPTED and before any ledger
   * reservation for this stage. Prepares/proves the stage against the exact accepted start (stage 3 depends on
   * the accepted stage-2 candidate), so a mismatched host admission halts with nothing reserved or sent.
   */
  async preflight(stage: 1 | 2 | 3, start: StageStart): Promise<void> {
    await this.ready(stage);
    const r = this.ready_.get(stage)!;
    if (r.binding.inputCommit !== start.commit || r.binding.inputTree !== start.tree) refuse("QDEV_FACTORY_START_MISMATCH");
  }

  private async retainedForResult(stage: 1 | 2 | 3): Promise<Ready> {
    const retained = await this.c.retained(stage);
    const binding = prepareAuthenticatedLocalFactoryInputV4(retained.binding);
    this.checkIdentity(binding, retained.identity, retained.request);
    return { binding, identity: structuredClone(retained.identity), admitted: structuredClone(retained.binding), ceilingMicrousd: this.nativeCeiling(retained.request) };
  }

  private nativeCeiling(request: FactoryPrepareRequest): number {
    // Same micro-dollar quantization as FactoryDispatchControl. The native ledger must never authorize more than this charter.
    if (typeof request.maxSpendUsd !== "number" || !Number.isFinite(request.maxSpendUsd)) return refuse("QDEV_FACTORY_NATIVE_CEILING");
    const ceiling = Math.floor(request.maxSpendUsd * 1_000_000);
    if (!Number.isSafeInteger(ceiling) || ceiling < 1 || ceiling > QDEV_LIMITS.perWorkMicrousd)
      return refuse("QDEV_FACTORY_NATIVE_CEILING");
    return ceiling;
  }

  private checkIdentity(b: LocalFactoryBindingV4, i: FactoryExecutionIdentity, r: FactoryPrepareRequest) {
    if (i.workId !== b.workId || i.workGeneration !== b.workGeneration || i.factoryId !== b.factoryId || i.factoryVersion !== b.factoryVersion
      || i.requestId !== b.requestId || i.workOrderId !== b.workOrderId || i.remoteRunId !== b.runId || i.baseSha !== b.inputCommit
      || r.requestId !== b.requestId || r.workId !== b.workId || r.workGeneration !== b.workGeneration || r.input.baseRef !== b.inputCommit
      || i.repository !== r.repository || i.deadline !== r.deadline || canonical(i.allowedPaths) !== canonical(r.input.allowedPaths))
      refuse("QDEV_FACTORY_IDENTITY_MISMATCH");
  }

  admit(stage: 1 | 2 | 3, start: StageStart): unknown {
    const r = this.ready_.get(stage);
    if (!r) return refuse("QDEV_FACTORY_NOT_READY");
    if (r.binding.inputCommit !== start.commit || r.binding.inputTree !== start.tree) refuse("QDEV_FACTORY_START_MISMATCH");
    // The trusted ADMISSION (as retained by the Work store), not the validator's output: the wiring re-validates it with
    // bindFactoryDispatch (prepareAuthenticatedLocalFactoryInputV4 is not idempotent over its own output) and dispatch compares
    // that result with the prepared binding.
    return structuredClone(r.admitted);
  }

  /**
   * A dispatch acknowledgment is NOT final measured usage. This returns `known: true` (which the gate
   * settles, releasing cohort concurrency) only after the exact-identity readback shows terminal state,
   * resource quiescence, evidence and zero active/unknown spend. UNKNOWN, timeout or any read failure
   * leaves the operation unsettled so the gate fences; nothing is ever resent.
   */
  async dispatch(binding: LocalFactoryBindingV4, reserveMicrousd: number): Promise<KnownOutcome<unknown> | UnknownOutcome<unknown>> {
    if (this.c.enabled !== true) throw new ProviderNotSent("factory disabled");
    const ready = [...this.ready_.values()].find(r => r.binding.operationId === binding.operationId);
    if (!ready || canonical(ready.binding) !== canonical(binding)) throw new ProviderNotSent("binding not prepared");
    if (!Number.isSafeInteger(reserveMicrousd) || reserveMicrousd < 1 || reserveMicrousd > QDEV_LIMITS.perWorkMicrousd || ready.ceilingMicrousd > reserveMicrousd)
      throw new ProviderNotSent("native Factory ceiling exceeds the reserved parent operation");
    // Any failure from here on is ambiguous exposure: the gate fences, it never resends. A ProviderNotSent
    // thrown by a nested layer (client, readback) must not tombstone an operation whose dispatch has begun.
    try { return await this.sendAndSettle(ready); }
    catch (error) {
      console.error(`[qdev] factory dispatch ambiguous: ${errorSummary(error)}`);
      throw new Error("QDEV_FACTORY_POST_DISPATCH_AMBIGUOUS", { cause: error });
    }
  }

  private async sendAndSettle(ready: Ready): Promise<KnownOutcome<unknown> | UnknownOutcome<unknown>> {
    await this.c.live.dispatch(ready.identity);
    const now = this.c.now ?? Date.now, sleep = this.c.sleep ?? (ms => new Promise<void>(r => setTimeout(r, ms)));
    const deadline = now() + (this.c.settleTimeoutMs ?? 30 * 60_000);
    let transient = 0;
    for (;;) {
      // A readback is a pure GET of the exact identity: retrying a READ never resends the dispatch. Only transport-level failures
      // (timeout, connection error, 429/5xx) are re-read, a bounded number of consecutive times and only before the settle deadline.
      // Any binding/schema/identity failure, an UNKNOWN state, persistent transport failure or the deadline still leaves it unsettled.
      let rb;
      try { rb = await this.c.live.read(ready.identity); transient = 0; }
      catch (error) {
        if (!isTransientReadFailure(error) || ++transient > MAX_TRANSIENT_READS || now() >= deadline) throw error;
        console.error(`[qdev] factory readback transient failure ${transient}/${MAX_TRANSIENT_READS}: ${errorSummary(error)}`);
        await sleep(this.c.pollMs ?? 2000);
        continue;
      }
      if (rb.requestId !== ready.identity.requestId || rb.workOrderId !== ready.identity.workOrderId || rb.runId !== ready.identity.remoteRunId)
        return unsettled("readback identity differs");
      if (rb.state === "UNKNOWN") return unsettled("Factory state UNKNOWN");
      if (rb.quiescent === true && TERMINAL.has(rb.state) && rb.evidenceRef && rb.accounting && "metering" in rb.accounting) {
        // Operations-only route: settle on proven quiescence with no unresolved or in-flight operation, after durably recording the units.
        const u = rb.accounting;
        if (u.metering !== "SUBSCRIPTION_UNMETERED" || u.status !== "SUBSCRIPTION_UNMETERED" || u.unknownOperations !== 0 || u.inFlightOperations !== 0
          || !u.accountingComplete || u.operationsUsed > u.maxOperations || !this.c.recordSubscriptionUsage) return unsettled(`subscription accounting not settled ${JSON.stringify(u)}`);
        const usage: SubscriptionUsage = { metering: "SUBSCRIPTION_UNMETERED", requestId: rb.requestId, workOrderId: rb.workOrderId, runId: rb.runId, state: rb.state,
          operationsUsed: u.operationsUsed, maxOperations: u.maxOperations, completionOperationsUsed: u.completionOperationsUsed, evidenceRef: rb.evidenceRef };
        try { await this.c.recordSubscriptionUsage(usage); } catch (error) { return unsettled(`usage record failed: ${errorSummary(error)}`); }
        this.subscription.push(usage);
        return { known: true, value: { state: rb.state, evidenceRef: rb.evidenceRef, metering: "SUBSCRIPTION_UNMETERED", operationsUsed: u.operationsUsed, settledMicrousd: null } };
      }
      if (rb.quiescent === true && TERMINAL.has(rb.state) && rb.evidenceRef) {
        const a = rb.accounting as Extract<typeof rb.accounting, { safeAllowanceMicrousd: unknown }>;
        if (typeof a?.activeMicrousd !== "number" || typeof a?.unknownMicrousd !== "number" || a.activeMicrousd !== 0 || a.unknownMicrousd !== 0) return { known: false };
        if (typeof a.settledMicrousd !== "number" || !Number.isSafeInteger(a.settledMicrousd) || a.settledMicrousd < 0 || a.settledMicrousd > ready.ceilingMicrousd) return { known: false };
        return { known: true, value: { state: rb.state, evidenceRef: rb.evidenceRef, settledMicrousd: a.settledMicrousd } };
      }
      if (now() >= deadline) return unsettled(`settle deadline reached in state ${rb.state}`);
      await sleep(this.c.pollMs ?? 2000);
    }
  }

  /**
   * Unwraps the existing result-channel envelope `{ state, result }` to the raw signed Result that
   * consumeStageResult authenticates. A missing Result is reported as pending (never a redispatch);
   * the unsigned `state` is informational only, the signed manifest alone decides acceptance.
   */
  async fetchResult(stage: 1 | 2 | 3): Promise<unknown> {
    if (this.c.enabled !== true) refuse("QDEV_FACTORY_DISABLED");
    // Stages 1-2 are executed by the host-owned agent executor and carry no FACTORY operation, so the journey never prepares them here;
    // a resumed run may also skip preflight for an already-settled FACTORY operation. The Result read then rests on the retained
    // admission alone (same binding/identity/request consistency proof as `ready`), and never enables `admit` or `dispatch`.
    const r = this.ready_.get(stage) ?? await this.retainedForResult(stage);
    const envelope = await this.c.live.result(r.binding) as { state?: unknown; result?: unknown } | null;
    if (!envelope || typeof envelope !== "object" || Object.keys(envelope).sort().join(",") !== "result,state" || typeof envelope.state !== "string")
      return refuse("QDEV_FACTORY_RESULT_ENVELOPE");
    if (envelope.result === null) throw new FactoryResultPending(envelope.state);
    if (!["COMPLETED", "FAILED", "CANCELLED"].includes(envelope.state)) return refuse("QDEV_FACTORY_RESULT_ENVELOPE");
    return envelope.result;
  }
}
