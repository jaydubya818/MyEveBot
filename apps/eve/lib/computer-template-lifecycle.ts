import { createHash, randomUUID } from "node:crypto";

export type TemplateFailure = "authentication" | "quota" | "rate_limit" | "provider_unavailable" | "bootstrap" | "timeout" | "cancelled" | "invalid_template" | "cleanup";
export type TemplateState = "PREPARING" | "READY" | "FAILED" | "CLEANING" | "CLEANED";
export interface TemplateKey { scope: string; fingerprint: string; provider: string }
export interface Preparation extends TemplateKey {
  id: string; state: TemplateState; deadline: number; templateId: string | null;
  failure: TemplateFailure | null; retryAfter: number;
}
export interface TemplateInspection { state: "READY" | "MISSING" | "STALE"; fingerprint?: string; templateId?: string }
export interface ComputerTemplateProvider {
  readonly id: string;
  inspect(preparation: Preparation, signal: AbortSignal): Promise<TemplateInspection>;
  prepare(preparation: Preparation, signal: AbortSignal): Promise<{ templateId: string; costUsd?: number }>;
  // Adapters must independently attempt stop AND delete and verify absence.
  cleanup(preparation: Preparation, signal: AbortSignal, identifySnapshot?: (templateId: string) => Promise<void>): Promise<boolean>;
  classify(error: unknown): TemplateFailure;
}
export interface TemplateStore {
  current(key: TemplateKey): Promise<Preparation | null>;
  claim(key: TemplateKey, deadline: number): Promise<Preparation | null>;
  ready(id: string, templateId: string, costUsd?: number): Promise<boolean>;
  cleaning(id: string, failure: TemplateFailure): Promise<string | null>;
  cleaned(id: string, token: string, success: boolean, retryAfter: number): Promise<void>;
  identifySnapshot(id: string, token: string, templateId: string): Promise<void>;
  enter(key: TemplateKey, waiterId: string, expiresAt: number): Promise<void>;
  leave(waiterId: string): Promise<void>;
  hasWaiters(key: TemplateKey): Promise<boolean>;
  recoverable(scope: string, limit: number): Promise<Preparation[]>;
  event(id: string, event: string, failure?: TemplateFailure, durationMs?: number): Promise<void>;
}
export class ComputerPreparationError extends Error {
  constructor(readonly code: TemplateFailure | "preparing" | "unconfigured") {
    super(code === "preparing" ? "Computer is still preparing. Check its status shortly." : code === "unconfigured" ? "Computer needs a configured runtime provider." : "Computer could not be prepared. Check runtime status before retrying.");
    this.name = "ComputerPreparationError";
  }
}
/** The caller supplies versioned, nonsecret compatibility inputs, not arbitrary environment values. */
export function templateFingerprint(input: Record<string, string>): string {
  return createHash("sha256").update(JSON.stringify(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)))).digest("hex");
}
function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = () => { signal?.removeEventListener("abort", abort); resolve(); };
    const timer = setTimeout(finish, ms);
    const abort = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(new ComputerPreparationError("cancelled")); };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}
/** Promise timeout also fences providers that ignore AbortSignal. Late completion is cleaned again. */
async function bounded<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  let abort: () => void = () => {};
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      abort = () => reject(new ComputerPreparationError("timeout"));
      signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort();
    })]);
  } finally { signal.removeEventListener("abort", abort); }
}

export class ComputerTemplateLifecycle {
  constructor(readonly store: TemplateStore, readonly provider: ComputerTemplateProvider,
    readonly options = { prepareMs: 120_000, waitMs: 125_000, cleanupMs: 10_000, pollMs: 500, retryMs: 30_000 }) {}

  async resolve(key: TemplateKey): Promise<"READY" | "COLD" | "PREPARING" | "UNAVAILABLE"> {
    const row = await this.store.current(key);
    if (!row) return "COLD";
    if (row.state === "CLEANED") return row.retryAfter > Date.now() ? "UNAVAILABLE" : "COLD";
    if (row.state === "PREPARING") return row.deadline > Date.now() ? "PREPARING" : "UNAVAILABLE";
    if (row.state !== "READY") return "UNAVAILABLE";
    try {
      const signal = AbortSignal.timeout(this.options.cleanupMs);
      const inspected = await bounded(this.provider.inspect(row, signal), signal);
      return inspected.state === "READY" && inspected.fingerprint === key.fingerprint && inspected.templateId === row.templateId ? "READY" : "COLD";
    } catch { return "UNAVAILABLE"; }
  }

  // Explicit prewarm and authorized runtime requests both use this method.
  async ensure(key: TemplateKey, signal?: AbortSignal): Promise<Preparation> {
    if (signal?.aborted) throw new ComputerPreparationError("cancelled");
    const waiterId = randomUUID(), end = Date.now() + this.options.waitMs;
    await this.store.enter(key, waiterId, end);
    const cancel = () => { void this.store.leave(waiterId).catch(() => {}); };
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      while (Date.now() < end) {
        if (signal?.aborted) throw new ComputerPreparationError("cancelled");
        let row = await this.store.current(key);
        if (row?.state === "READY") {
          const inspectSignal = AbortSignal.timeout(this.options.cleanupMs);
          const inspected = await bounded(this.provider.inspect(row, inspectSignal), inspectSignal);
          if (inspected.state === "READY" && inspected.fingerprint === key.fingerprint && inspected.templateId === row.templateId) {
            await this.event(row.id, "template.resolve.warm");
            return row;
          }
          await this.cleanup(row, "invalid_template");
          continue;
        }
        if (row?.state === "PREPARING" || row?.state === "CLEANING") {
          if (row.deadline <= Date.now()) await this.cleanup(row, "timeout");
          else await pause(this.options.pollMs, signal);
          continue;
        }
        if (row && row.retryAfter > Date.now()) throw new ComputerPreparationError(row.failure ?? "provider_unavailable");
        row = await this.store.claim(key, Date.now() + this.options.prepareMs);
        if (!row) { await pause(this.options.pollMs, signal); continue; }
        await this.event(row.id, "template.resolve.cold");
        await this.prepare(row);
      }
      throw new ComputerPreparationError("preparing");
    } catch (error) {
      if (error instanceof ComputerPreparationError) throw error;
      throw new ComputerPreparationError(this.provider.classify(error));
    } finally { signal?.removeEventListener("abort", cancel); await this.store.leave(waiterId); }
  }

  private async prepare(row: Preparation): Promise<void> {
    const started = Date.now(), controller = new AbortController();
    let failure: TemplateFailure = "timeout";
    const timer = setTimeout(() => controller.abort(), Math.max(1, row.deadline - Date.now()));
    let checking = false;
    const monitor = setInterval(() => {
      if (checking) return;
      checking = true;
      void this.store.hasWaiters(row).then(has => { if (!has) { failure = "cancelled"; controller.abort(); } })
        .catch(() => { controller.abort(); }).finally(() => { checking = false; });
    }, this.options.pollMs);
    const work = Promise.resolve().then(() => this.provider.prepare(row, controller.signal));
    try {
      await this.event(row.id, "template.prepare.started");
      const result = await bounded(work, controller.signal);
      const inspection = await bounded(this.provider.inspect({ ...row, templateId: result.templateId }, controller.signal), controller.signal);
      if (inspection.state !== "READY" || inspection.fingerprint !== row.fingerprint || inspection.templateId !== result.templateId) throw new ComputerPreparationError("invalid_template");
      if (!(await this.store.hasWaiters(row))) throw new ComputerPreparationError("cancelled");
      if (!(await this.store.ready(row.id, result.templateId, result.costUsd))) throw new ComputerPreparationError("timeout");
      await this.event(row.id, "template.prepare.ready", undefined, Date.now() - started);
    } catch (error) {
      failure = controller.signal.aborted ? failure : error instanceof ComputerPreparationError ? error.code as TemplateFailure : this.provider.classify(error);
      controller.abort();
      await this.event(row.id, "template.prepare.failed", failure, Date.now() - started);
      await this.cleanup(row, failure);
      // A late provider completion cannot publish READY after its durable lease was revoked.
      void work.then(() => this.cleanup(row, failure)).catch(() => {});
      throw new ComputerPreparationError(failure);
    } finally { clearTimeout(timer); clearInterval(monitor); }
  }

  async cleanup(row: Preparation, failure: TemplateFailure): Promise<boolean> {
    const token = await this.store.cleaning(row.id, failure);
    if (!token) return false;
    await this.event(row.id, "template.cleanup.started");
    let success = false;
    try {
      const signal = AbortSignal.timeout(this.options.cleanupMs);
      success = await bounded(this.provider.cleanup(row, signal, templateId => this.store.identifySnapshot(row.id, token, templateId)), signal);
    } catch { /* Recovery retries the durable owned preparation. */ }
    const retryMs = failure === "invalid_template" ? 0 : ["authentication", "quota"].includes(failure) ? 86_400_000 : this.options.retryMs;
    await this.store.cleaned(row.id, token, success, Date.now() + retryMs);
    await this.event(row.id, success ? "template.cleanup.completed" : "template.cleanup.failed", success ? undefined : "cleanup");
    return success;
  }

  private async event(id: string, name: string, failure?: TemplateFailure, durationMs?: number) {
    // Telemetry failure must never delete a published template or skip cleanup.
    await bounded(this.store.event(id, name, failure, durationMs), AbortSignal.timeout(this.options.cleanupMs)).catch(() => {});
  }

  async recover(scope: string): Promise<number> {
    const rows = await this.store.recoverable(scope, 10);
    let recovered = 0;
    for (const row of rows) {
      if (await this.cleanup(row, row.failure ?? "timeout")) {
        if (row.state !== "CLEANED") {
          recovered++;
          await this.event(row.id, "template.orphan.recovered");
        }
      }
    }
    return recovered;
  }
}
