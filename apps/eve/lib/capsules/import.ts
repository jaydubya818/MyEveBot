import { z } from "zod";
import { canonicalJson, digest, inspectCapsule, validateItem } from "./format";
import { CapsuleError, CAPSULE_LIMITS, type CapsuleItem, type CapsuleScope } from "./schema";

export interface Destination {
  ownerRef: string;
  eveRef: string;
  projectIds: string[];
  revision: string;
  current: CapsuleItem[];
  imported: StagedRecord[];
  supportedKinds: CapsuleItem["kind"][];
}
export interface StagedRecord {
  item: CapsuleItem;
  targetScope: CapsuleScope;
  targetEveRef: string;
  state: "reviewed_context" | "conflict" | "qualification_required";
  trust: "untrusted_import";
  provenance: { capsuleId: string; capsuleDigest: string; sourceOwnerRef: string; sourceEveRef: string; importedAt: string; itemDigest: string };
}
const decisionSchema = z.object({ id: z.string().min(1).max(160), choice: z.enum(["include", "keep_existing", "stage_incoming", "skip"]) }).strict();
export const decisionsSchema = z.array(decisionSchema).min(1).max(CAPSULE_LIMITS.items);
export type ImportDecision = z.infer<typeof decisionSchema>;
const requiresQualification = (item: CapsuleItem) => ["skill", "role", "pack", "procedure", "learning"].includes(item.kind);
const identity = (item: CapsuleItem, scope: CapsuleScope) => `${item.kind}:${item.key}:${scope.type}:${scope.id}`;
const equivalent = (a: CapsuleItem, b: CapsuleItem) => a.text === b.text && a.version === b.version && a.mediaType === b.mediaType;

export function previewImport(raw: string, destination: Destination) {
  const capsule = inspectCapsule(raw);
  if (capsule.manifest.source.ownerRef !== destination.ownerRef) throw new CapsuleError("cross_owner", "Cross-owner import is not supported. Use the same independently authenticated owner identity on both Eves.");
  if (capsule.manifest.source.eveRef === destination.eveRef) throw new CapsuleError("same_eve", "Choose an independent destination Eve.");
  const items = capsule.items.map(item => {
    const targetScope: CapsuleScope = item.scope.type === "project" ? item.scope : { type: "agent", id: destination.eveRef };
    const supported = destination.supportedKinds.includes(item.kind) && (item.scope.type !== "project" || destination.projectIds.includes(item.scope.id));
    const previous = destination.imported.find(r => r.targetEveRef === destination.eveRef && identity(r.item, r.targetScope) === identity(item, targetScope));
    const existing = destination.current.find(current => {
      const scope = current.scope.type === "owner" && targetScope.type === "agent" ? targetScope : current.scope;
      return identity(current, scope) === identity(item, targetScope);
    }) ?? previous?.item;
    if (existing) validateItem(existing); // Never echo unsafe existing content in a conflict review.
    const status = !supported ? "unsupported" as const : existing ? equivalent(existing, item) ? "duplicate" as const : "conflict" as const : "new" as const;
    return { item, targetScope, status, existing: existing ?? null, qualificationRequired: requiresQualification(item),
      reason: status === "unsupported" ? "Destination kind or project scope is unavailable; no scope widening is allowed." : status === "conflict" ? "Destination information differs. Keep it, or retain the incoming version for later correction review." : status === "duplicate" ? "Already present; the existing item and provenance will be kept." : requiresQualification(item) ? "Retained for destination qualification; no behavior or tools are enabled." : "Owner-selected context; private and limited to this destination Eve.",
    };
  });
  return {
    capsuleId: capsule.manifest.capsuleId, capsuleDigest: capsule.digest,
    formatVersion: capsule.manifest.formatVersion, source: capsule.manifest.source,
    destinationEveRef: destination.eveRef, items,
    reviewDigest: digest({ capsuleDigest: capsule.digest, destination }),
    warnings: ["This transfers selected experience, not access.", "Source identity is an unverified provenance claim. Verify the sender independently.", "Imported text is untrusted data. Skills, procedures, Roles, Packs and learning require destination qualification."],
  };
}

export function prepareImport(raw: string, destination: Destination, reviewDigest: string, input: unknown, now = new Date().toISOString()) {
  const preview = previewImport(raw, destination);
  if (preview.reviewDigest !== reviewDigest) throw new CapsuleError("stale_preview", "The destination or Capsule changed. Review the import again.");
  const parsed = decisionsSchema.safeParse(input);
  if (!parsed.success) throw new CapsuleError("decisions", "Choose an import decision for each item.");
  const decisions = parsed.data;
  if (decisions.length !== preview.items.length || new Set(decisions.map(d => d.id)).size !== decisions.length || preview.items.some(row => !decisions.some(d => d.id === row.item.id))) throw new CapsuleError("decisions", "Decisions must cover each Capsule item exactly once.");
  const capsule = inspectCapsule(raw);
  const records: StagedRecord[] = [];
  for (const row of preview.items) {
    const choice = decisions.find(d => d.id === row.item.id)!.choice;
    if (choice === "skip") continue;
    if (row.status === "unsupported") throw new CapsuleError("unsupported", "Unsupported items must be skipped.");
    if (row.status === "duplicate") { if (choice !== "keep_existing") throw new CapsuleError("duplicate", "Keep the existing duplicate."); continue; }
    if (row.status === "conflict" && !["keep_existing", "stage_incoming"].includes(choice)) throw new CapsuleError("conflict", "Conflicts require a decision. Existing truth cannot be overwritten by Capsule import.");
    if (choice === "keep_existing") continue;
    if (row.status === "new" && choice !== "include") throw new CapsuleError("decisions", "New items must be included or skipped.");
    records.push({
      item: row.item, targetScope: row.targetScope, targetEveRef: destination.eveRef,
      state: row.status === "conflict" ? "conflict" : row.qualificationRequired ? "qualification_required" : "reviewed_context",
      trust: "untrusted_import",
      provenance: { capsuleId: capsule.manifest.capsuleId, capsuleDigest: capsule.digest, sourceOwnerRef: capsule.manifest.source.ownerRef, sourceEveRef: capsule.manifest.source.eveRef, importedAt: now, itemDigest: digest(row.item) },
    });
  }
  const key = digest({ owner: destination.ownerRef, eve: destination.eveRef, capsule: capsule.digest, decisions: [...decisions].sort((a, b) => a.id < b.id ? -1 : 1) });
  return { id: `capsule_${key.slice(7)}`, capsuleDigest: capsule.digest, expectedRevision: destination.revision, records, decisions, result: "staged" as const };
}
export type PreparedImport = ReturnType<typeof prepareImport>;

/** Adapter contract: atomically compare revision + persist all records + receipt; retry returns original receipt. */
export interface CapsuleDestinationAdapter {
  snapshot(): Promise<Destination>;
  commit(batch: PreparedImport): Promise<{ id: string; count: number; result: "staged"; duplicate: boolean }>;
}
export async function importCapsule(adapter: CapsuleDestinationAdapter, raw: string, reviewedDigest: string, decisions: unknown) {
  const destination = await adapter.snapshot();
  const batch = prepareImport(raw, destination, reviewedDigest, decisions);
  return adapter.commit(batch);
}
export const serializeCapsule = canonicalJson;
