/** Capsule-owned ports. Canonical Memory owns policy, source facts and activation.
 * This envelope is NOT wire format 1.1 and is never accepted from a browser upload. */
import { z } from "zod";
import { byteSize, digest, validateItem } from "./format";
import { CapsuleError, digestSchema, itemSchema } from "./schema";
import { scanStructure } from "./security";

const reference = z.string().min(1).max(255);
export const portableScopeSchema = z.object({
  ownerRef: digestSchema, projectId: reference.nullable(), repository: reference.nullable(),
  workType: z.enum(["research", "implementation", "review"]).nullable(), workId: reference.nullable(),
}).strict();
export type PortableScope = z.infer<typeof portableScopeSchema>;
export const portableExperienceSchema = z.object({
  contractVersion: z.literal(1), item: itemSchema, scope: portableScopeSchema,
  truth: z.enum(["CURRENT", "UNCERTAIN", "CONFLICTING", "STALE", "HISTORICAL", "SUPERSEDED"]),
  supersedesId: reference.nullable(), supersededById: reference.nullable(),
  provenance: z.array(z.object({ sourceId: reference, revision: reference, contentHash: digestSchema,
    origin: z.enum(["OWNER", "INFERENCE", "OBSERVATION"]), reference }).strict()).min(1).max(20),
  classification: z.enum(["PRIVATE_PORTABLE", "PRIVATE_NONPORTABLE", "SHAREABLE", "WORK_SCOPED", "CORPORATE_RESTRICTED", "UNKNOWN"]),
  learning: z.object({ familyId: reference, version: z.number().int().positive(), hash: digestSchema,
    status: z.enum(["CANDIDATE", "EVALUATING", "PROMOTED", "REJECTED", "SUPERSEDED", "ROLLED_BACK"]),
    scope: portableScopeSchema,
    evaluation: z.object({ evaluatorVersion: reference, candidateHash: digestSchema, result: z.enum(["PASS", "FAIL"]),
      evidenceRefs: z.array(reference).min(1).max(20) }).strict(),
  }).strict().nullable(),
}).strict();
export type PortableExperience = z.infer<typeof portableExperienceSchema>;
export interface ExportContext {
  authenticatedOwnerRef: string; destinationEveRef: string; targetScope: PortableScope;
  selectedIds: readonly string[]; purpose: "capsule_export";
}
export type ExportVerdict = { allowed: boolean; policyRevision: string; reason: string; itemDigest: string; contextDigest: string };
/** Must read authoritative policy on every export, not uploaded privacy assertions.
 * Bind the answer to the complete representation and destination/selection. */
export interface CanonicalExportPolicy {
  canExport(item: Readonly<PortableExperience>, context: Readonly<ExportContext>): Promise<ExportVerdict>;
}
const scopeFacets = ["projectId", "repository", "workType", "workId"] as const;
export function preservesScope(source: PortableScope, target: PortableScope): boolean {
  return source.ownerRef === target.ownerRef && scopeFacets.every(key => source[key] === null || source[key] === target[key]);
}
export function validatePortableExperience(input: unknown): PortableExperience {
  scanStructure(input);
  const record = portableExperienceSchema.parse(input);
  validateItem(record.item);
  if (record.item.scope.type === "project" && record.item.scope.id !== record.scope.projectId ||
      record.item.scope.type === "owner" && record.item.scope.id !== record.scope.ownerRef) throw new CapsuleError("scope", "Portable source scope is inconsistent.");
  if (record.item.kind === "learning" !== (record.learning !== null)) throw new CapsuleError("learning", "Learning metadata must match the item kind.");
  if (record.learning && (!preservesScope(record.learning.scope, record.scope) || !preservesScope(record.scope, record.learning.scope))) throw new CapsuleError("scope", "Learning scope must be preserved exactly in the representation.");
  return record;
}
export function portableDigest(record: PortableExperience) { return digest(validatePortableExperience(record)); }
export function activeSource(record: PortableExperience): boolean {
  return record.truth === "CURRENT" && record.supersededById === null &&
    (!record.learning || record.learning.status === "PROMOTED" && record.learning.evaluation.result === "PASS" && record.learning.hash === record.learning.evaluation.candidateHash);
}
/** Defensive consumer checks; this does not grant policy permission. */
export async function checkCanonicalExport(policy: CanonicalExportPolicy, input: unknown, context: ExportContext): Promise<ExportVerdict> {
  const record = validatePortableExperience(input);
  portableScopeSchema.parse(context.targetScope);
  const itemDigest = portableDigest(record), contextDigest = digest(context);
  const deny = (reason: string): ExportVerdict => ({ allowed: false, policyRevision: "capsule-consumer-v1", reason, itemDigest, contextDigest });
  if (context.authenticatedOwnerRef !== record.scope.ownerRef || !context.selectedIds.includes(record.item.id)) return deny("Explicit authenticated owner selection required.");
  if (!preservesScope(record.scope, context.targetScope)) return deny("Scope cannot broaden.");
  if (["PRIVATE_NONPORTABLE", "CORPORATE_RESTRICTED", "UNKNOWN"].includes(record.classification)) return deny("Source classification does not permit this export.");
  if (!activeSource(record)) return deny("Historical, superseded and unpromoted learning cannot be exported as current experience.");
  const verdict = await policy.canExport(record, context);
  if (!verdict.allowed || !verdict.policyRevision || verdict.itemDigest !== itemDigest || verdict.contextDigest !== contextDigest) return deny("Canonical policy denied export or returned an unbound decision.");
  return verdict;
}

export interface ActivationSnapshot {
  revision: string; ownerRef: string; eveRef: string; scope: PortableScope;
  current: PortableExperience[];
}
export interface QualificationEvidence {
  itemDigest: string; destinationEveRef: string; targetScopeDigest: string;
  qualifierVersion: string; result: "PASS" | "FAIL";
}
export interface ActivationRequest {
  id: string; records: PortableExperience[]; targetScope: PortableScope; expectedRevision: string;
  /** Explicitly chosen exact item digests, not a bulk overwrite flag. */
  selectedDigests: string[];
}
export function validateActivationRequest(input: unknown): ActivationRequest {
  const request = z.object({ id: reference, records: z.array(portableExperienceSchema).min(1).max(100), targetScope: portableScopeSchema,
    expectedRevision: reference, selectedDigests: z.array(digestSchema).max(100) }).strict().parse(input);
  if (byteSize(request) > 1_048_576) throw new CapsuleError("size", "Integration batches must be no larger than 1 MiB.");
  request.records.forEach(validatePortableExperience);
  return request;
}
export interface ActivationPreview {
  request: ActivationRequest; reviewDigest: string;
  rows: Array<{ itemDigest: string; state: "eligible" | "conflict" | "inactive" | "qualification_required" | "unsupported" | "duplicate" }>;
}
export interface ActivationReceipt { id: string; revision: string; count: number; result: "active" | "rolled_back" }
/** Trusted destination service supplies evidence. Capsule text cannot supply it. */
export interface CanonicalQualification {
  read(record: PortableExperience, destination: ActivationSnapshot, scope: PortableScope): Promise<QualificationEvidence | null>;
}
export async function previewActivation(request: ActivationRequest, snapshot: ActivationSnapshot, qualification: CanonicalQualification): Promise<ActivationPreview> {
  request = validateActivationRequest(request);
  if (!request.id || request.records.length < 1 || request.records.length > 100 || request.expectedRevision !== snapshot.revision) throw new CapsuleError("stale_preview", "Refresh the destination activation preview.");
  const records = request.records.map(validatePortableExperience);
  const meanings = records.map(r => `${r.item.kind}:${r.item.key}`);
  if (new Set(meanings).size !== meanings.length || new Set(records.map(r => r.item.id)).size !== records.length) throw new CapsuleError("corrections", "Resolve multiple incoming corrections before activation.");
  const hashes = records.map(portableDigest);
  if (new Set(request.selectedDigests).size !== request.selectedDigests.length || request.selectedDigests.some(h => !hashes.includes(h))) throw new CapsuleError("selection", "Activation selections must bind exact records.");
  portableScopeSchema.parse(request.targetScope);
  if (request.targetScope.ownerRef !== snapshot.ownerRef || !preservesScope(snapshot.scope, request.targetScope)) throw new CapsuleError("scope", "Destination scope cannot broaden.");
  const rows: ActivationPreview["rows"] = [];
  for (const record of records) {
    const itemDigest = portableDigest(record);
    let state: ActivationPreview["rows"][number]["state"] = "eligible";
    const existing = snapshot.current.filter(r => r.item.kind === record.item.kind && r.item.key === record.item.key &&
      (preservesScope(r.scope, request.targetScope) || preservesScope(request.targetScope, r.scope)));
    if (!preservesScope(record.scope, request.targetScope) || !/^1\.\d+\.\d+$/.test(record.item.version)) state = "unsupported";
    else if (!activeSource(record) || ["PRIVATE_NONPORTABLE", "CORPORATE_RESTRICTED", "UNKNOWN"].includes(record.classification)) state = "inactive";
    else if (existing.length) state = existing.length === 1 && portableDigest(existing[0]) === itemDigest ? "duplicate" : "conflict";
    else if (["skill", "role", "pack", "procedure", "learning"].includes(record.item.kind)) {
      const evidence = await qualification.read(record, snapshot, request.targetScope);
      if (!evidence || evidence.result !== "PASS" || !evidence.qualifierVersion || evidence.itemDigest !== itemDigest || evidence.destinationEveRef !== snapshot.eveRef || evidence.targetScopeDigest !== digest(request.targetScope)) state = "qualification_required";
    }
    rows.push({ itemDigest, state });
  }
  return { request, rows, reviewDigest: digest({ request, snapshot, rows }) };
}
/** Required transaction semantics: re-read policy/qualification and Current Truth under
 * the canonical lock; CAS revision; commit all selected eligible rows and receipt in
 * one transaction. Any denied row aborts the WHOLE batch. No grant-bearing fields.
 * Recover returns committed receipt or null. Rollback atomically removes only this
 * batch's unchanged records; if later state changed, refuse and require new review. */
export interface CanonicalActivation {
  stage(request: ActivationRequest): Promise<void>;
  validate(id: string): Promise<void>;
  preview(id: string): Promise<ActivationPreview>;
  activate(id: string, reviewedDigest: string): Promise<ActivationReceipt>;
  recover(id: string): Promise<ActivationReceipt | null>;
  rollback(id: string): Promise<ActivationReceipt>;
}
