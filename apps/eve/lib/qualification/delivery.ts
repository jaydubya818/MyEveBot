import { z } from "zod";
import { QDEV_BASELINE } from "../external-alpha/qualification-accounting.ts";
import { digest } from "../engineering/contract.ts";
import type { Verdict } from "./verdict.ts";

/**
 * MyApps delivery contract for the isolated journey. It joins what was SERVED
 * to what was VERIFIED: served bytes must equal the verifier's build artifact
 * digest for the same candidate, and a rollback target must exist before the
 * delivery counts. This is a pure contract check over an observed delivery; it
 * deploys nothing and grants no installation or release authority.
 */
const hex = (n: number) => z.string().regex(new RegExp("^[a-f0-9]{" + n + "}$"));
export const deliveryObservationSchema = z.object({
  schema: z.literal("myeve.qualification-delivery/v1"),
  environment: z.literal("myeve-qdev-20261029"),
  projectSha256: hex(64), sourceSha256: hex(64),
  candidateCommit: hex(40), candidateTree: hex(40),
  servedBytesSha256: hex(64),
  // Either the exact prior MyApps revision or an authenticated absence.
  priorRevision: z.union([z.object({ kind: z.literal("REVISION"), id: z.string().min(1).max(200), sha256: hex(64) }).strict(),
    z.object({ kind: z.literal("ABSENT"), authenticationSha256: hex(64) }).strict()]),
  rollbackRestorePointId: z.string().min(1).max(200),
  observedAt: z.string().datetime(),
}).strict();
export type DeliveryObservation = z.infer<typeof deliveryObservationSchema>;

export class DeliveryRejected extends Error {
  constructor(readonly code: string) { super(code); }
}

export function acceptDelivery(input: {
  observation: unknown; verdict: Verdict; projectSha256: string; sourceSha256: string; outputBranch?: string;
}) {
  const parsed = deliveryObservationSchema.safeParse(input.observation);
  if (!parsed.success) throw new DeliveryRejected("QDEV_DELIVERY_INVALID");
  const d = parsed.data;
  if (input.verdict.outcome !== "PASS") throw new DeliveryRejected("QDEV_DELIVERY_UNVERIFIED");
  if (d.projectSha256 !== input.projectSha256 || d.sourceSha256 !== input.sourceSha256
    || d.projectSha256 !== input.verdict.projectSha256 || d.sourceSha256 !== input.verdict.sourceSha256)
    throw new DeliveryRejected("QDEV_DELIVERY_BINDING_MISMATCH");
  if (d.candidateCommit !== input.verdict.candidateCommit || d.candidateTree !== input.verdict.candidateTree)
    throw new DeliveryRejected("QDEV_DELIVERY_CANDIDATE_MISMATCH");
  // Served bytes are compared byte-for-byte (by digest) with the verified build; no inference.
  if (d.servedBytesSha256 !== input.verdict.buildArtifactSha256) throw new DeliveryRejected("QDEV_DELIVERY_SERVED_BYTES_MISMATCH");
  if (d.candidateCommit === QDEV_BASELINE.inputCommit) throw new DeliveryRejected("QDEV_DELIVERY_BASELINE_IS_NOT_A_BUILD");
  return { acceptedDeliverySha256: digest(d), delivery: d, authority: "NONE" as const };
}
