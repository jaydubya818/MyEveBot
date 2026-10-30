import { prepareAuthenticatedLocalFactoryInputV4 } from "../engineering/factory-authenticated-result.ts";
import type { FactoryPrepareRequest, FactoryReadback } from "../engineering/factory-live-adapter.ts";
import type { FactoryExecutionIdentity } from "../engineering/factory-writer.ts";
import type { LocalFactoryBindingV4 } from "../engineering/factory-receipt-store.ts";
import { canonical } from "../engineering/factory-producer-protocol.ts";
import { ProviderNotSent, type KnownOutcome, type UnknownOutcome } from "./gate.ts";
import type { FactoryPort } from "./wiring.ts";
import type { StageStart } from "./factory-dispatch.ts";

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
};
/** A Result is not available yet (RUNNING/STOPPING/UNKNOWN). Recovery re-reads; it never redispatches. */
export class FactoryResultPending extends Error {
  constructor(readonly state: string) { super("QDEV_FACTORY_RESULT_PENDING:" + state); }
}

export class FactoryLivePortRefused extends Error {
  constructor(readonly code: string) { super(code); }
}
const refuse = (code: string): never => { throw new FactoryLivePortRefused(code); };

const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED", "NOT_DISPATCHED"]);
type Ready = { binding: LocalFactoryBindingV4; identity: FactoryExecutionIdentity };

export class LiveFactoryPort implements FactoryPort {
  private readonly ready_ = new Map<1 | 2 | 3, Ready>();
  constructor(private readonly c: FactoryLivePortConfig) {}

  /** Proves, before any gate claim, that Factory holds a prepared execution matching the retained admission. */
  async ready(stage: 1 | 2 | 3): Promise<void> {
    if (this.c.enabled !== true) refuse("QDEV_FACTORY_DISABLED");
    const retained = await this.c.retained(stage);
    const binding = prepareAuthenticatedLocalFactoryInputV4(retained.binding);
    this.checkIdentity(binding, retained.identity, retained.request);
    const readback = await this.c.live.prepared(retained.request);
    const s = readback.snapshot as Record<string, unknown> | null;
    if (readback.state !== "PREPARED" || !s) refuse("QDEV_FACTORY_NOT_PREPARED");
    if (readback.requestId !== binding.requestId || readback.workOrderId !== binding.workOrderId || readback.runId !== binding.runId)
      refuse("QDEV_FACTORY_PREPARED_MISMATCH");
    const snap = s as Record<string, any>;
    for (const f of ["factoryId", "factoryVersion", "sourceDigest", "configurationDigest", "requestId", "workOrderId", "runId", "attemptNumber", "inputCommit", "inputTree"] as const)
      if (snap[f] !== (binding as unknown as Record<string, unknown>)[f]) refuse("QDEV_FACTORY_PREPARED_MISMATCH");
    if (canonical(snap.configuration) !== canonical(binding.configuration)) refuse("QDEV_FACTORY_PREPARED_MISMATCH");
    this.ready_.set(stage, { binding, identity: retained.identity });
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
    return structuredClone(r.binding);
  }

  /**
   * A dispatch acknowledgment is NOT final measured usage. This returns `known: true` (which the gate
   * settles, releasing cohort concurrency) only after the exact-identity readback shows terminal state,
   * resource quiescence, evidence and zero active/unknown spend. UNKNOWN, timeout or any read failure
   * leaves the operation unsettled so the gate fences; nothing is ever resent.
   */
  async dispatch(binding: LocalFactoryBindingV4): Promise<KnownOutcome<unknown> | UnknownOutcome<unknown>> {
    if (this.c.enabled !== true) throw new ProviderNotSent("factory disabled");
    const ready = [...this.ready_.values()].find(r => r.binding.operationId === binding.operationId);
    if (!ready || canonical(ready.binding) !== canonical(binding)) throw new ProviderNotSent("binding not prepared");
    // Any failure from here on is ambiguous exposure: the gate fences, it never resends.
    await this.c.live.dispatch(ready.identity);
    const now = this.c.now ?? Date.now, sleep = this.c.sleep ?? (ms => new Promise<void>(r => setTimeout(r, ms)));
    const deadline = now() + (this.c.settleTimeoutMs ?? 30 * 60_000);
    for (;;) {
      const rb = await this.c.live.read(ready.identity);
      if (rb.requestId !== ready.identity.requestId || rb.workOrderId !== ready.identity.workOrderId || rb.runId !== ready.identity.remoteRunId)
        return { known: false };
      if (rb.state === "UNKNOWN") return { known: false };
      if (rb.quiescent === true && TERMINAL.has(rb.state) && rb.evidenceRef) {
        const a = rb.accounting;
        if (typeof a?.activeMicrousd !== "number" || typeof a?.unknownMicrousd !== "number" || a.activeMicrousd !== 0 || a.unknownMicrousd !== 0) return { known: false };
        return { known: true, value: { state: rb.state, evidenceRef: rb.evidenceRef, settledMicrousd: a.settledMicrousd } };
      }
      if (now() >= deadline) return { known: false };
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
    const r = this.ready_.get(stage);
    if (!r) return refuse("QDEV_FACTORY_NOT_READY");
    const envelope = await this.c.live.result(r.binding) as { state?: unknown; result?: unknown } | null;
    if (!envelope || typeof envelope !== "object" || Object.keys(envelope).sort().join(",") !== "result,state" || typeof envelope.state !== "string")
      return refuse("QDEV_FACTORY_RESULT_ENVELOPE");
    if (envelope.result === null) throw new FactoryResultPending(envelope.state);
    if (!["COMPLETED", "FAILED", "CANCELLED"].includes(envelope.state)) return refuse("QDEV_FACTORY_RESULT_ENVELOPE");
    return envelope.result;
  }
}
