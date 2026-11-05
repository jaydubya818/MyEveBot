import { expect, it, vi } from "vitest";
import { LiveFactoryPort, MAX_TRANSIENT_READS, isTransientReadFailure } from "./factory-live-port.ts";

const done = { requestId: "r", workOrderId: "w", runId: "run", state: "COMPLETED", quiescent: true, evidenceRef: "ev",
  accounting: { metering: "SUBSCRIPTION_UNMETERED", status: "SUBSCRIPTION_UNMETERED", unit: "OPERATION", operationsUsed: 3, maxOperations: 3, inFlightOperations: 0,
    unknownOperations: 0, completionOperationsUsed: 1, accountingComplete: true, settledMicrousd: null, activeMicrousd: null, unknownMicrousd: null, ceilingMicrousd: null } };
const running = { ...done, state: "RUNNING", quiescent: false, evidenceRef: null };
const timeout = () => Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });

function port(reads: Array<() => unknown>, settleTimeoutMs = 10_000) {
  let t = 0;
  const dispatch = vi.fn(async () => undefined), read = vi.fn(async () => { const next = reads.shift(); if (!next) throw Error("no more reads"); return next(); });
  const p = new LiveFactoryPort({ enabled: true, retained: async () => ({}) as never, pollMs: 1, settleTimeoutMs, now: () => t, sleep: async ms => { t += ms; },
    recordSubscriptionUsage: async () => undefined,
    live: { prepared: async () => ({}) as never, dispatch, result: async () => null, read: read as never } });
  (p as any).ready_.set(1, { binding: { operationId: "op" }, identity: { requestId: "r", workOrderId: "w", remoteRunId: "run" }, admitted: {}, ceilingMicrousd: 650000 });
  return { p, dispatch, read };
}
const quiet = () => vi.spyOn(console, "error").mockImplementation(() => undefined);

it("classifies only transport-level readback failures as transient", () => {
  expect(isTransientReadFailure(timeout())).toBe(true);
  expect(isTransientReadFailure(new TypeError("fetch failed"))).toBe(true);
  expect(isTransientReadFailure(Error("Factory control unavailable (503); reconcile the same request"))).toBe(true);
  expect(isTransientReadFailure(Error("Factory control unavailable (403); reconcile the same request"))).toBe(false);
  expect(isTransientReadFailure(Error("Factory readback does not bind this exact writer"))).toBe(false);
  expect(isTransientReadFailure(Error("Factory spend binding mismatch"))).toBe(false);
  expect(isTransientReadFailure("x")).toBe(false);
});

it("a transient readback failure during a running repair round is re-read (never redispatched) and the run then settles", async () => {
  quiet();
  const f = port([() => running, () => { throw timeout(); }, () => { throw new TypeError("fetch failed"); }, () => running, () => done]);
  expect(await f.p.dispatch({ operationId: "op" } as never, 650000)).toMatchObject({ known: true });
  expect(f.dispatch).toHaveBeenCalledTimes(1);
  expect(f.read).toHaveBeenCalledTimes(5);
});

it("persistent transport failure, a validation failure, UNKNOWN state or the deadline still leave the operation unsettled", async () => {
  quiet();
  const failing: Array<() => unknown> = Array.from({ length: MAX_TRANSIENT_READS + 1 }, () => () => { throw timeout(); });
  const persistent = port([...failing, () => done]);
  await expect(persistent.p.dispatch({ operationId: "op" } as never, 650000)).rejects.toThrow("QDEV_FACTORY_POST_DISPATCH_AMBIGUOUS");
  expect(persistent.dispatch).toHaveBeenCalledTimes(1);
  const invalid = port([() => { throw Error("Factory readback does not bind this exact writer"); }, () => done]);
  await expect(invalid.p.dispatch({ operationId: "op" } as never, 650000)).rejects.toThrow("QDEV_FACTORY_POST_DISPATCH_AMBIGUOUS");
  expect(invalid.read).toHaveBeenCalledTimes(1);
  expect(await port([() => ({ ...running, state: "UNKNOWN" }), () => done]).p.dispatch({ operationId: "op" } as never, 650000)).toEqual({ known: false });
  const late = port([() => running, () => { throw timeout(); }, () => done], 1);
  await expect(late.p.dispatch({ operationId: "op" } as never, 650000)).rejects.toThrow("QDEV_FACTORY_POST_DISPATCH_AMBIGUOUS");
});
