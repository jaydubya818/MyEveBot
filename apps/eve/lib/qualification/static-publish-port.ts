import { bareSha256 } from "./delivery-observer.ts";
import type { MyAppsRevisionReader } from "./myapps-revisions.ts";
import { planRollback, type InstallationIdentity } from "./rollback.ts";
import type { StaticBuildMyAppsPort } from "./static-build.ts";
import { StaticPublishRefused, type StaticReleaseController } from "./static-publish.ts";
import type { Verdict } from "./verdict.ts";
import type { MyAppsPort } from "./wiring.ts";

/**
 * MyAppsPort that DELIVERS, not merely observes: after the independent verdict is re-verified as a signed PASS for exactly the retained
 * artifact, it captures the prior installation state once, publishes the exact retained bytes through the release controller, and then
 * observes the served files with the existing delivery observer. A failed or mismatching observation restores the captured prior revision
 * (or authenticated absence) by compare-and-swap against the exact state it published, so a rejected delivery never stays served and a
 * newer release is never undone.
 *
 * It adds no authority: publish and rollback still require the controller's host-injected activation permit, and a verdict never grants it.
 */
export class StaticPublishingMyAppsPort implements MyAppsPort {
  constructor(private readonly c: {
    build: StaticBuildMyAppsPort; controller: StaticReleaseController; reader: MyAppsRevisionReader; installation: InstallationIdentity;
    /** Host-bound: fetch the signed verdict (a pure read) and verify it with verifyVerdict against the pinned keys and expectations. */
    gate(candidate: { commit: string; tree: string; buildArtifactSha256: string }): Promise<Verdict>;
  }) {}

  retainBuild(candidate: { commit: string; tree: string }) { return this.c.build.retainBuild(candidate); }

  async observe(candidate: { commit: string; tree: string }): Promise<unknown> {
    const artifact = this.c.build.retainedArtifact(candidate), bare = bareSha256(artifact.artifactDigest);
    const verdict = await this.c.gate({ ...candidate, buildArtifactSha256: bare });
    if (verdict?.outcome !== "PASS" || verdict.candidateCommit !== candidate.commit || verdict.candidateTree !== candidate.tree || verdict.buildArtifactSha256 !== bare)
      throw new StaticPublishRefused("QDEV_PUBLISH_UNVERIFIED");
    await this.c.reader.capture();
    const published = await this.c.controller.publish(artifact);
    try { return await this.c.build.observe(candidate); }
    catch (error) { await this.restorePrior({ seq: published.seq, version: published.version, digest: published.digest }); throw error; }
  }

  /**
   * Compensates exactly the publication this port made: the restore applies only while the committed state is still the one this
   * delivery produced (sequence, version and digest). A newer release from any other publisher is never undone; that case reports
   * QDEV_PUBLISH_COMPENSATION_SUPERSEDED and leaves the newer release served.
   */
  async restorePrior(expected: { seq: number; version: number; digest: string }): Promise<void> {
    try {
      const plan = planRollback({ environment: this.c.installation.environment, priorRevision: await this.c.reader.priorRevision(), rollbackRestorePointId: await this.c.reader.restorePointId() }, this.c.installation);
      await this.c.controller.rollback(plan, expected);
    } catch (error) {
      if (error instanceof StaticPublishRefused && error.code === "QDEV_PUBLISH_COMPENSATION_SUPERSEDED") throw error;
      throw new StaticPublishRefused("QDEV_PUBLISH_ROLLBACK_FAILED");
    }
  }
}
