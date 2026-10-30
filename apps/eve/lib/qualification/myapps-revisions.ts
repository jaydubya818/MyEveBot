import { createHash } from "node:crypto";
import type { DeliveryObserverConfig } from "./delivery-observer.ts";

/**
 * Prior-revision and restore-point readers for the delivery observer, over the existing MyApps installation state
 * (installedVersion / installedDigest / retained history, as exposed by the owner-scoped MyApps state read).
 *
 * The prior state is captured ONCE, before the candidate is delivered, and then retained immutably: a later read
 * can never describe the post-delivery state as "prior". A first installation records an authenticated absence
 * bound to the app, owner and project. A restore point is only reported when the prior revision is actually
 * retained for rollback (it appears in the restorable history); otherwise the readers refuse, they never invent one.
 * Read-only: no install, enable, rollback or deployment authority.
 */
export interface InstallationStateSource {
  read(appId: string): Promise<{ installedVersion: number | null; installedDigest: string | null; restorableVersions: number[] }>;
}
export class MyAppsRevisionError extends Error { constructor(readonly code: string) { super(code); } }
const sha = (t: string) => createHash("sha256").update(t).digest("hex");

export class MyAppsRevisionReader {
  private captured?: { prior: Awaited<ReturnType<DeliveryObserverConfig["priorRevision"]>>; restorePointId: string };
  private capturePromise?: Promise<void>;
  constructor(private readonly s: { source: InstallationStateSource; appId: string; ownerId: string; projectSha256: string }) {}

  /** Must be called before delivery. All callers share the first attempt, including its failure. */
  capture(): Promise<void> {
    this.capturePromise ??= this.captureOnce();
    return this.capturePromise;
  }

  private async captureOnce(): Promise<void> {
    const state = await this.s.source.read(this.s.appId);
    const { installedVersion: v, installedDigest: d } = state;
    if (v === null || d === null) {
      if (v !== null || d !== null) throw new MyAppsRevisionError("QDEV_MYAPPS_STATE_INCONSISTENT");
      const authenticationSha256 = sha(JSON.stringify({ kind: "ABSENT", appId: this.s.appId, ownerId: this.s.ownerId, projectSha256: this.s.projectSha256 }));
      this.captured = { prior: { kind: "ABSENT", authenticationSha256 }, restorePointId: "myapps-absent:" + authenticationSha256.slice(0, 32) };
      return;
    }
    if (!Number.isInteger(v) || v < 1 || !/^sha256:[a-f0-9]{64}$/.test(d)) throw new MyAppsRevisionError("QDEV_MYAPPS_STATE_INVALID");
    if (!state.restorableVersions.includes(v)) throw new MyAppsRevisionError("QDEV_MYAPPS_RESTORE_UNAVAILABLE");
    const bare = d.slice("sha256:".length);
    this.captured = { prior: { kind: "REVISION", id: `${this.s.appId}@${v}`, sha256: bare }, restorePointId: `myapps-restore:${this.s.appId}@${v}:${bare.slice(0, 16)}` };
  }
  private get(): NonNullable<typeof this.captured> {
    if (!this.captured) throw new MyAppsRevisionError("QDEV_MYAPPS_PRIOR_NOT_CAPTURED");
    return this.captured;
  }
  priorRevision = async () => structuredClone(this.get().prior);
  restorePointId = async () => this.get().restorePointId;
}
