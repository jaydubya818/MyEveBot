import { ExecutionStore } from "./execution-store.ts";
import { ActionBlocked } from "./action-gateway.ts";
import { LostExecutionClaim, type ExecutionClaim, type FailureCategory } from "./execution-types.ts";

export class ExecutionFailure extends Error {
  constructor(readonly category: FailureCategory) { super(category); }
}

export interface ExecutionRunner {
  preflight(claim: ExecutionClaim): Promise<void>;
  // Returns only after the canonical result/artifact/thread is durable.
  run(claim: ExecutionClaim, signal: AbortSignal): Promise<{ resultReference: string }>;
}

/** One bounded worker tick. Recovery never calls run; only eligible claims do. */
export async function executeNextOccurrence(input: {
  ownerId: string; workerId: string; store: ExecutionStore; runner: ExecutionRunner;
  leaseSeconds?: number; heartbeatMilliseconds?: number;
}): Promise<boolean> {
  const leaseSeconds = input.leaseSeconds ?? 60;
  const heartbeatMilliseconds = input.heartbeatMilliseconds ?? 15_000;
  if (heartbeatMilliseconds >= leaseSeconds * 1000 || heartbeatMilliseconds < 1) throw new Error("Heartbeat must precede lease expiry.");
  await input.store.recoverExpired(input.ownerId);
  const claim = await input.store.claim(input.ownerId,input.workerId,leaseSeconds);
  if (!claim) return false;
  const abort = new AbortController();
  let heartbeatFailure: unknown;
  let pendingHeartbeat = Promise.resolve();
  const heartbeat = setInterval(() => {
    pendingHeartbeat = pendingHeartbeat.then(async () => {
      if (abort.signal.aborted) return;
      try { await input.store.heartbeat(claim,leaseSeconds); }
      catch (error) { heartbeatFailure=error; abort.abort(); }
    });
  },heartbeatMilliseconds);
  const deadline = setTimeout(() => abort.abort(),claim.configuration.limits.maxRuntimeSeconds * 1000);
  try {
    await input.runner.preflight(claim);
    if (heartbeatFailure) throw heartbeatFailure;
    const result = await input.runner.run(claim,abort.signal);
    if (heartbeatFailure) throw heartbeatFailure;
    if (abort.signal.aborted) throw new ExecutionFailure("timeout");
    await input.store.complete(claim,result.resultReference);
  } catch (error) {
    if (heartbeatFailure || error instanceof LostExecutionClaim) return true;
    const category = error instanceof ExecutionFailure ? error.category
      : error instanceof ActionBlocked ? error.status === "awaiting_approval" ? "approval_required" : error.status === "result_unknown" ? "verification_failed" : "authorization_failed"
      : "unknown";
    await input.store.fail(claim,category);
  } finally {
    clearInterval(heartbeat);
    clearTimeout(deadline);
    abort.abort();
    await pendingHeartbeat;
  }
  return true;
}
