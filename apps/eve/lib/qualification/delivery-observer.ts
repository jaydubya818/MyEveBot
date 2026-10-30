import { StaticArtifactCandidate, STATIC_ARTIFACT_LIMITS, type StaticSourcePins } from "../../../../packages/myapps/src/static-artifact.ts";
import { deliveryObservationSchema, type DeliveryObservation } from "./delivery.ts";

/**
 * MyApps delivery observer. It deploys nothing. It reads the files actually SERVED
 * at the delivered application origin and re-derives the canonical MyApps static
 * artifact identity from those served bytes (StaticArtifactCandidate.retain over
 * the retained inventory, whose loader is the served response). The resulting
 * artifactDigest is the same identity the verifier attested, so acceptDelivery
 * compares like with like and any changed, missing or unavailable file fails
 * closed. Prior revision and rollback restore point come from injected MyApps
 * readers. Disabled by default; https only; no redirects.
 *
 * Limit: the observer can only prove the inventoried files are served unchanged;
 * it cannot enumerate unrelated files an origin might also serve.
 */
/** MyApps digests are "sha256:<hex>"; qualification evidence carries the same digest as bare hex. Lossless, prefix-checked. */
export function bareSha256(artifactDigest: string): string {
  if (!/^sha256:[a-f0-9]{64}$/.test(artifactDigest)) throw new DeliveryObservationError("QDEV_DELIVERY_INVALID");
  return artifactDigest.slice("sha256:".length);
}
export class DeliveryObservationError extends Error {
  constructor(readonly code: string) { super(code); }
}
export type DeliveryObserverConfig = {
  enabled: boolean; environment: "myeve-qdev-20261029"; servedOrigin: string;
  projectSha256: string; sourceSha256: string;
  priorRevision(): Promise<DeliveryObservation["priorRevision"]>; restorePointId(): Promise<string>;
  fetcher?: typeof fetch; maxFileBytes?: number; now?: () => Date;
};
/** The retained, claim-verified build this delivery must serve (trusted host state, never a model value). */
export type RetainedBuild = { inventory: unknown; pins: StaticSourcePins; candidate: StaticArtifactCandidate };

export async function observeServedDelivery(config: DeliveryObserverConfig, candidate: { commit: string; tree: string }, retained: RetainedBuild): Promise<DeliveryObservation> {
  if (!config.enabled) throw new DeliveryObservationError("QDEV_DELIVERY_OBSERVER_DISABLED");
  const origin = new URL(config.servedOrigin);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.origin !== config.servedOrigin) throw new DeliveryObservationError("QDEV_DELIVERY_URL");
  if (retained.pins.sourceCommit !== candidate.commit || retained.pins.sourceTree !== candidate.tree
    || retained.candidate.source.sourceCommit !== candidate.commit || retained.candidate.source.sourceTree !== candidate.tree)
    throw new DeliveryObservationError("QDEV_DELIVERY_CANDIDATE");
  const max = config.maxFileBytes ?? STATIC_ARTIFACT_LIMITS.fileBytes;
  let unavailable = false;
  const load = async (path: string): Promise<Uint8Array> => {
    try {
      const response = await (config.fetcher ?? fetch)(new URL("/" + path.slice("dist/".length), origin), {
        redirect: "error", signal: AbortSignal.timeout(20000), headers: { "cache-control": "no-cache" } });
      if (!response.ok) throw new Error("status");
      if (Number(response.headers.get("content-length") ?? 0) > max) throw new Error("size");
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > max) throw new Error("size");
      return bytes;
    } catch { unavailable = true; throw new Error("unavailable"); }
  };
  let served: StaticArtifactCandidate;
  try { served = await StaticArtifactCandidate.retain(retained.inventory, retained.pins, load); }
  catch { throw new DeliveryObservationError(unavailable ? "QDEV_DELIVERY_UNAVAILABLE" : "QDEV_DELIVERY_SERVED_BYTES_MISMATCH"); }
  if (served.inventoryDigest !== retained.candidate.inventoryDigest || served.artifactDigest !== retained.candidate.artifactDigest)
    throw new DeliveryObservationError("QDEV_DELIVERY_SERVED_BYTES_MISMATCH");
  const observation = {
    schema: "myeve.qualification-delivery/v1" as const, environment: config.environment,
    projectSha256: config.projectSha256, sourceSha256: config.sourceSha256,
    candidateCommit: candidate.commit, candidateTree: candidate.tree,
    servedBytesSha256: bareSha256(served.artifactDigest),
    priorRevision: await config.priorRevision(), rollbackRestorePointId: await config.restorePointId(),
    observedAt: (config.now?.() ?? new Date()).toISOString(),
  };
  const parsed = deliveryObservationSchema.safeParse(observation);
  if (!parsed.success) throw new DeliveryObservationError("QDEV_DELIVERY_INVALID");
  return parsed.data;
}
