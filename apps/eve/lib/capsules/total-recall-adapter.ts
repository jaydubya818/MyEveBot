/** Read-only boundary for Total Recall projections.ts:portableMemoryRecord (v1).
 * No canonical implementation/persistence is copied. No visibility-to-consent inference.
 * DTO parser deliberately fails closed on contract drift. See integration-crosswalk.md. */
import { z } from "zod";
import { ownerReference } from "./format";
import { CapsuleError } from "./schema";
import type { PortableScope } from "./integration-contract";
const ref = z.string().min(1).max(255);
const sourceHash = z.string().regex(/^[a-f0-9]{64}$/);
const representation = z.object({
  contractVersion: z.literal(1), type: z.literal("MEMORY_REPRESENTATION"), identity: ref,
  kind: z.enum(["memory", "knowledge"]), text: z.string().min(1).max(20000), ownerId: ref,
  scope: z.object({ kind: z.enum(["OWNER", "WORK"]), workId: z.string().uuid().nullable(), repository: ref.nullable() }).strict(),
  privacy: z.enum(["PRIVATE", "WORK_SCOPED"]),
  provenance: z.array(z.object({ sourceId: ref, type: ref, reference: ref, contentHash: ref.nullable(),
    origin: z.enum(["OWNER", "INFERENCE", "OBSERVATION"]), relation: ref }).strict()).min(1).max(20),
  currentTruth: z.object({ status: z.enum(["CURRENT", "UNCERTAIN", "CONFLICTING", "STALE", "HISTORICAL"]), supersedesId: ref.nullable(), supersededById: ref.nullable() }).strict(),
  confidence: z.number().min(0).max(1),
  learningVersion: z.object({ id: sourceHash, version: z.number().int().positive(), hash: sourceHash }).strict().nullable(),
  contentHash: sourceHash,
  portability: z.object({ eligible: z.literal(false), reason: z.string().min(1).max(1000) }).strict(),
  authorityGrants: z.tuple([]),
}).strict();
export function inspectTotalRecallRepresentation(input: unknown, authenticatedOwnerId: string) {
  const source = representation.parse(input);
  if (source.ownerId !== authenticatedOwnerId) throw new CapsuleError("cross_owner", "Canonical representation is outside the authenticated owner scope.");
  if (source.scope.kind === "WORK" && (!source.scope.workId || !source.scope.repository) || source.scope.kind === "OWNER" && (source.scope.workId !== null || source.scope.repository !== null)) throw new CapsuleError("scope", "Canonical scope is inconsistent; do not flatten it.");
  if (source.scope.kind === "WORK" && source.privacy !== "WORK_SCOPED") throw new CapsuleError("scope", "Work-scoped data must retain Work privacy.");
  const scope: PortableScope = { ownerRef: ownerReference(source.ownerId), projectId: null, repository: source.scope.repository, workType: null, workId: source.scope.workId };
  return {
    sourceIdentity: source.identity, sourceContentHash: source.contentHash, kind: source.kind, text: source.text,
    scope, privacy: source.privacy, currentTruth: source.currentTruth, provenance: source.provenance,
    learningVersion: source.learningVersion,
    classification: source.privacy === "WORK_SCOPED" ? "WORK_SCOPED" as const : "UNKNOWN" as const,
    exportAllowed: false as const, activationAllowed: false as const,
    blockers: [source.portability.reason, "Canonical export policy and explicit selection are required.",
      ...(source.scope.kind === "WORK" ? ["Capsule 1.1 cannot encode Work/repository restrictions; never flatten to owner scope."] : []),
      ...(source.learningVersion ? ["Resolve the canonical learning family, exact scope, status, hash and evaluation evidence; a version reference is insufficient."] : [])],
  };
}
