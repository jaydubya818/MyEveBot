import { PersistentApps } from "./runtime.ts";
import type { Principal } from "../../../../packages/myapps/src/store.ts";
import type { AppPackage } from "../../../../packages/myapps/src/contracts.ts";
export interface DeterministicFactoryPort {
  factoryVersion: AppPackage["factoryVersion"];
  emptyCommit: string;
  /** Existing custody/controller must recheck apps.authorize before each step. */
  build(input: { creationIntent: string; pkg: AppPackage }): Promise<unknown>;
  verify(owner: string, run: unknown): Promise<unknown>;
  result(
    pkg: AppPackage,
    run: unknown,
    verification: unknown,
  ): Promise<unknown>;
}
/** Explicit, recoverable stages. Verification never installs, publishes or deploys. */
export class AppWorkCoordinator {
  constructor(
    readonly apps: PersistentApps,
    readonly factory: DeterministicFactoryPort,
  ) {}
  async request(principal: Principal, requestId: string, request: string) {
    const prepared = await this.apps.prepareWork(
      principal,
      requestId,
      request,
      this.factory.factoryVersion,
      this.factory.emptyCommit,
    );
    const run = await this.factory.build(prepared);
    const verification = await this.factory.verify(principal.ownerId, run);
    const signed = await this.factory.result(prepared.pkg, run, verification);
    await this.apps.retain(prepared.creationIntent, prepared.pkg, signed);
    const preview = await this.apps.preview(
      principal,
      prepared.pkg.appId,
      prepared.pkg.version,
    );
    return {
      status: "PREVIEW_READY",
      work: prepared.pkg.work,
      appId: prepared.pkg.appId,
      version: prepared.pkg.version,
      previewId: preview.id,
      message:
        "Your verified CRM candidate is ready to preview. Installation needs your approval.",
    };
  }
}
