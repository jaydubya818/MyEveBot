import { createHash, randomUUID } from "node:crypto";
import { capsuleSchema, itemSchema, CapsuleError, CAPSULE_LIMITS, CAPSULE_EXCLUSIONS, type Capsule, type CapsuleItem, type ExportCandidate } from "./schema";
import { parseBoundedJson, scanStructure } from "./security";

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export const digest = (value: unknown): string => `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
export const ownerReference = (ownerId: string): string => digest({ ownerId });
export const byteSize = (value: unknown): number => Buffer.byteLength(canonicalJson(value));

export function validateItem(input: unknown): CapsuleItem {
  scanStructure(input);
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) throw new CapsuleError("item_format", "An item has unsupported fields or content. Only bounded, readable experience is supported.");
  const item = parsed.data;
  if (Buffer.byteLength(item.text) > CAPSULE_LIMITS.textBytes) throw new CapsuleError("item_size", "Each item must contain at most 16 KiB of text.");
  if (item.kind === "file" && !item.mediaType) throw new CapsuleError("file_type", "Files must declare plain text or Markdown. Executable and binary files are not supported.");
  if (item.kind !== "file" && item.mediaType) throw new CapsuleError("file_type", "Only file items can declare a media type.");
  if (item.kind === "learning" && (item.provenance.sourceType !== "qualified_learning" || !item.provenance.qualificationRef)) throw new CapsuleError("learning", "Learning requires promoted-source qualification provenance.");
  if (item.kind === "file" && /\b(?:myeve-memory-capsule|MYEVE_EXPERIENCE_CAPSULE)\b/.test(item.text)) throw new CapsuleError("nested_capsule", "Nested Capsules are not supported.");
  return item;
}

export function exclusionReason(candidate: ExportCandidate, ownerRef: string): string | null {
  if (candidate.policy.ownerRef !== ownerRef) return "Outside the authenticated owner's scope.";
  if (candidate.policy.sourceCategory !== "experience") return "Live authority, credentials, sessions and active Work cannot transfer.";
  if (candidate.policy.classification !== "personal") return "Corporate and third-party private data require a separate source-policy integration.";
  if (candidate.policy.portability !== "allowed") return "Source policy has not authorized portability.";
  if (candidate.item.kind === "learning" ? candidate.policy.state !== "promoted" : candidate.policy.state !== "active") return "Only active experience and promoted learning are eligible.";
  return null;
}

export function exportPreview(candidates: ExportCandidate[], selectedIds: string[], ownerRef: string) {
  if (!selectedIds.length || selectedIds.length > CAPSULE_LIMITS.items || new Set(selectedIds).size !== selectedIds.length) throw new CapsuleError("selection", "Choose 1–100 distinct items to export.");
  if (new Set(candidates.map(c => c.item.id)).size !== candidates.length) throw new CapsuleError("source_ids", "The source adapter returned ambiguous item identities.");
  const items = selectedIds.map(id => {
    const candidate = candidates.find(c => c.item.id === id);
    if (!candidate) throw new CapsuleError("selection", "A selected source is no longer available. Refresh the preview.");
    const reason = exclusionReason(candidate, ownerRef);
    if (reason) throw new CapsuleError("source_policy", reason);
    return validateItem(candidate.item);
  }).sort((a, b) => a.id < b.id ? -1 : 1);
  return {
    items, reviewDigest: digest(items), payloadBytes: byteSize(items),
    excluded: candidates.filter(c => !selectedIds.includes(c.item.id)).map(c => ({ id: c.item.id, reason: exclusionReason(c, ownerRef) ?? "Not selected by the owner." })),
    authorityExclusions: CAPSULE_EXCLUSIONS,
    warnings: ["The Capsule contains private experience. Store it privately; delete downloaded copies when no longer needed.", "A checksum detects changes; it does not verify who authored the Capsule."],
  };
}

export function exportCapsule(input: { candidates: ExportCandidate[]; selectedIds: string[]; reviewedDigest: string; ownerRef: string; eveRef: string; now?: string; capsuleId?: string }): Capsule {
  const preview = exportPreview(input.candidates, input.selectedIds, input.ownerRef);
  if (preview.reviewDigest !== input.reviewedDigest) throw new CapsuleError("stale_preview", "Source content or selection changed. Review the export again.");
  const body = {
    manifest: {
      format: "myeve-memory-capsule" as const, formatVersion: "1.1" as const,
      capsuleId: input.capsuleId ?? randomUUID(), createdAt: input.now ?? new Date().toISOString(),
      source: { ownerRef: input.ownerRef, eveRef: input.eveRef },
      compatibility: { minimumReader: "1.0" as const, activation: "review_required" as const },
      inventory: preview.items.map(item => ({ id: item.id, digest: digest(item), bytes: byteSize(item) })),
    }, items: preview.items,
  };
  return inspectCapsule(canonicalJson({ ...body, digest: digest(body) }));
}

export function inspectCapsule(raw: string): Capsule {
  const value = parseBoundedJson(raw);
  const parsed = capsuleSchema.safeParse(value);
  if (!parsed.success) throw new CapsuleError("format", "Unsupported Capsule format, version or fields. Supported versions: 1.0 and 1.1.");
  const capsule = parsed.data;
  const { digest: claimed, ...body } = capsule;
  if (claimed !== digest(body)) throw new CapsuleError("integrity", "Capsule integrity failed. Obtain an unchanged copy from its owner.");
  if (Date.parse(capsule.manifest.createdAt) > Date.now() + 60_000) throw new CapsuleError("time", "Capsule creation time is in the future.");
  const ids = new Set<string>();
  const keys = new Set<string>();
  if (capsule.items.length !== capsule.manifest.inventory.length) throw new CapsuleError("inventory", "Capsule inventory is inconsistent.");
  for (const [index, input] of capsule.items.entries()) {
    const item = validateItem(input);
    if (item.scope.type === "owner" && item.scope.id !== capsule.manifest.source.ownerRef || item.scope.type === "agent" && item.scope.id !== capsule.manifest.source.eveRef) throw new CapsuleError("scope", "Item scope does not match its source identity.");
    const key = `${item.kind}:${item.key}:${item.scope.type}:${item.scope.id}`;
    if (ids.has(item.id) || keys.has(key)) throw new CapsuleError("duplicate_item", "Capsule contains duplicate item identities or meanings.");
    ids.add(item.id); keys.add(key);
    const entry = capsule.manifest.inventory[index];
    if (entry.id !== item.id || entry.digest !== digest(item) || entry.bytes !== byteSize(item)) throw new CapsuleError("integrity", "An item or its provenance failed integrity validation.");
    if (Date.parse(item.provenance.observedAt) > Date.parse(capsule.manifest.createdAt)) throw new CapsuleError("time", "Item provenance is newer than this Capsule.");
    if (capsule.manifest.formatVersion === "1.0" && ["file", "learning"].includes(item.kind)) throw new CapsuleError("version", "File and learning items require Capsule format 1.1.");
  }
  return capsule;
}
