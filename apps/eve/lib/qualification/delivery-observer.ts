import { createHash } from "node:crypto";
import { deliveryObservationSchema, type DeliveryObservation } from "./delivery.ts";

/**
 * MyApps delivery observer. It does not deploy anything: it reads what is actually
 * SERVED at the delivered application URL and hashes the exact bytes, so that
 * acceptDelivery can compare them with the verifier's build artifact digest. Prior
 * revision and rollback restore point come from injected MyApps readers (the real
 * MyApps API on activation). Disabled by default; https only; no redirects.
 */
export class DeliveryObservationError extends Error {
  constructor(readonly code: string) { super(code); }
}
export type DeliveryObserverConfig = {
  enabled: boolean; environment: "myeve-qdev-20261029"; servedUrl: string;
  projectSha256: string; sourceSha256: string;
  priorRevision(): Promise<DeliveryObservation["priorRevision"]>; restorePointId(): Promise<string>;
  fetcher?: typeof fetch; maxBytes?: number; now?: () => Date;
};

export async function observeServedDelivery(config: DeliveryObserverConfig, candidate: { commit: string; tree: string }): Promise<DeliveryObservation> {
  if (!config.enabled) throw new DeliveryObservationError("QDEV_DELIVERY_OBSERVER_DISABLED");
  const url = new URL(config.servedUrl);
  if (url.protocol !== "https:" || url.username || url.password) throw new DeliveryObservationError("QDEV_DELIVERY_URL");
  const max = config.maxBytes ?? 16 * 1024 * 1024;
  let bytes: Buffer;
  try {
    const response = await (config.fetcher ?? fetch)(url, { redirect: "error", signal: AbortSignal.timeout(20000), headers: { "cache-control": "no-cache" } });
    if (!response.ok) throw new Error("status");
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > max) throw new Error("size");
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > max) throw new Error("size");
  } catch { throw new DeliveryObservationError("QDEV_DELIVERY_UNAVAILABLE"); }
  const observation = {
    schema: "myeve.qualification-delivery/v1" as const, environment: config.environment,
    projectSha256: config.projectSha256, sourceSha256: config.sourceSha256,
    candidateCommit: candidate.commit, candidateTree: candidate.tree,
    servedBytesSha256: createHash("sha256").update(bytes).digest("hex"),
    priorRevision: await config.priorRevision(), rollbackRestorePointId: await config.restorePointId(),
    observedAt: (config.now?.() ?? new Date()).toISOString(),
  };
  const parsed = deliveryObservationSchema.safeParse(observation);
  if (!parsed.success) throw new DeliveryObservationError("QDEV_DELIVERY_INVALID");
  return parsed.data;
}
