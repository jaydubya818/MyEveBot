import { StaticArtifactCandidate, type StaticSourcePins } from "../../../../packages/myapps/src/static-artifact.ts";
import { verifyStaticBuildClaim, type StaticBuildBinding, type StaticBuildIssuer } from "../../../../packages/myapps/src/static-build-claim.ts";
import { bareSha256, observeServedDelivery, type DeliveryObserverConfig, type RetainedBuild } from "./delivery-observer.ts";
import type { MyAppsPort } from "./wiring.ts";

/**
 * MyApps port over the EXISTING canonical contracts: StaticArtifactCandidate
 * (exact-byte retention) and verifyStaticBuildClaim (signature of a configured
 * producer over the retained artifact digest). The build identity the verifier
 * attests is the retained artifact's `artifactDigest`; the delivery observer
 * re-derives it from the served files. No new signer, route, install or authority;
 * a claim is provenance only and never replaces the independent verdict.
 */
export class StaticBuildRefused extends Error {
  constructor(readonly code: string) { super(code); }
}
/** Trusted host inputs for one accepted stage-3 candidate (from Work/Result custody and issuer policy, never a model). */
export type StaticBuildSource = {
  inventory: unknown; claim: string; load(path: string): Promise<Uint8Array>;
  lockSha256: string; binding: StaticBuildBinding; issuer: StaticBuildIssuer;
};
export type StaticBuildPortConfig = {
  source(candidate: { commit: string; tree: string }): Promise<StaticBuildSource>;
  delivery: DeliveryObserverConfig; now?: () => number;
};

export class StaticBuildMyAppsPort implements MyAppsPort {
  private retained: (RetainedBuild & { commit: string; tree: string }) | null = null;
  constructor(private readonly c: StaticBuildPortConfig) {}

  async retainBuild(candidate: { commit: string; tree: string }): Promise<{ buildArtifactSha256: string }> {
    const src = await this.c.source(candidate);
    // The claim must be for exactly this accepted candidate, never a different commit/tree.
    if (src.binding.candidateCommit !== candidate.commit || src.binding.candidateTree !== candidate.tree) throw new StaticBuildRefused("QDEV_BUILD_CANDIDATE_MISMATCH");
    const pins: StaticSourcePins = { sourceCommit: candidate.commit, sourceTree: candidate.tree, lockSha256: src.lockSha256 };
    const artifact = await StaticArtifactCandidate.retain(src.inventory, pins, src.load);
    verifyStaticBuildClaim(src.claim, artifact, src.binding, src.issuer, this.c.now?.());
    this.retained = { inventory: src.inventory, pins, candidate: artifact, commit: candidate.commit, tree: candidate.tree };
    return { buildArtifactSha256: bareSha256(artifact.artifactDigest) };
  }

  /** The retained, claim-verified artifact for exactly this candidate, for the separately authorized publish host. */
  retainedArtifact(candidate: { commit: string; tree: string }): StaticArtifactCandidate {
    const r = this.retained;
    if (!r || r.commit !== candidate.commit || r.tree !== candidate.tree) throw new StaticBuildRefused("QDEV_BUILD_NOT_RETAINED");
    return r.candidate;
  }

  /** The exact retained inventory, pins and bytes for the accepted candidate, for the verifier staging upload (a detached inventory copy; no authority). */
  stagingSource(candidate: { commit: string; tree: string }): { inventory: unknown; pins: StaticSourcePins; artifact: StaticArtifactCandidate } {
    const r = this.retained;
    if (!r || r.commit !== candidate.commit || r.tree !== candidate.tree) throw new StaticBuildRefused("QDEV_BUILD_NOT_RETAINED");
    return { inventory: structuredClone(r.inventory), pins: { ...r.pins }, artifact: r.candidate };
  }

  async observe(candidate: { commit: string; tree: string }): Promise<unknown> {
    const r = this.retained;
    if (!r || r.commit !== candidate.commit || r.tree !== candidate.tree) throw new StaticBuildRefused("QDEV_BUILD_NOT_RETAINED");
    return observeServedDelivery(this.c.delivery, candidate, r);
  }
}
