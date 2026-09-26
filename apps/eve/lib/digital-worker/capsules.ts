import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * M7's portable experience format. A capsule carries context, never a Work
 * Contract or an authority grant. Export selection and the trusted import facts
 * must come from authenticated MyEve services, not from capsule text.
 */
export const EXPERIENCE_CAPSULE_VERSION = 1 as const;
const reference = z.string().trim().min(1).max(400);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const timestamp = z.string().datetime({ offset: true });

const sourceRecord = {
  itemId: reference,
  sourceRef: reference,
  sourceRevision: reference,
  sourceScope: z.object({ type: z.enum(["owner", "agent"]), id: reference }).strict(),
  observedAt: timestamp,
  content: z.string().trim().min(1).max(4_000),
  contentHash: digest,
};

const experienceItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("MEMORY"), ...sourceRecord, sourceStatus: z.literal("ACTIVE") }).strict(),
  z.object({
    kind: z.literal("LEARNING"), ...sourceRecord, sourceStatus: z.literal("QUALIFIED"),
    qualificationRef: reference,
  }).strict(),
  z.object({
    kind: z.literal("PACK_REF"), itemId: reference, packKind: z.enum(["ROLE", "CAPABILITY"]),
    packId: reference, packVersion: z.number().int().positive(), sourceRef: reference,
    manifestHash: digest,
  }).strict(),
]);
export type ExperienceItem = z.infer<typeof experienceItemSchema>;

const lineageSchema = z.object({
  capsuleId: z.string().uuid(), capsuleVersion: z.number().int().positive(), digest,
}).strict();

const experienceCapsuleBodySchema = z.object({
  format: z.literal("MYEVE_EXPERIENCE_CAPSULE"),
  formatVersion: z.literal(EXPERIENCE_CAPSULE_VERSION),
  capsuleId: z.string().uuid(),
  capsuleVersion: z.number().int().positive(),
  kind: z.literal("ENGINEERING"),
  sourceOwnerId: reference,
  sourceAgentId: reference,
  scope: z.object({ kind: z.literal("personal"), id: reference }).strict(),
  createdAt: timestamp,
  exportReviewRef: reference,
  lineage: lineageSchema.nullable(),
  items: z.array(experienceItemSchema).min(1).max(50),
}).strict();
export type ExperienceCapsuleBody = z.infer<typeof experienceCapsuleBodySchema>;

const experienceCapsuleSchema = z.object({
  ...experienceCapsuleBodySchema.shape,
  digest,
}).strict();
export type ExperienceCapsule = z.infer<typeof experienceCapsuleSchema>;

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

/** Stable key ordering makes a digest independent of incoming object key order. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function bodyProblems(body: ExperienceCapsuleBody): string[] {
  const problems: string[] = [];
  if (body.scope.id !== body.sourceOwnerId) problems.push("Capsule scope does not match its owner.");
  if (body.capsuleVersion === 1 && body.lineage !== null) problems.push("A first-version capsule cannot claim lineage.");
  if (body.capsuleVersion > 1 && (!body.lineage || body.lineage.capsuleId !== body.capsuleId ||
      body.lineage.capsuleVersion !== body.capsuleVersion - 1))
    problems.push("Capsule lineage must identify the immediately preceding version.");
  const seen = new Set<string>();
  const seenSources = new Set<string>();
  for (const item of body.items) {
    if (seen.has(item.itemId)) problems.push(`Duplicate capsule item ${item.itemId}.`);
    seen.add(item.itemId);
    if (item.kind === "PACK_REF") continue;
    const sourceKey = `${item.kind}:${item.sourceRef}:${item.sourceRevision}`;
    if (seenSources.has(sourceKey)) problems.push(`Source ${item.sourceRef} is selected more than once.`);
    seenSources.add(sourceKey);
    const expectedScopeId = item.sourceScope.type === "owner" ? body.sourceOwnerId : body.sourceAgentId;
    if (item.sourceScope.id !== expectedScopeId) problems.push(`Item ${item.itemId} is outside the source owner and Agent.`);
    if (item.contentHash !== sha256(item.content)) problems.push(`Item ${item.itemId} failed content integrity.`);
    if (Date.parse(item.observedAt) > Date.parse(body.createdAt) + 5_000)
      problems.push(`Item ${item.itemId} was observed after the capsule was created.`);
  }
  return problems;
}

function capsuleDigest(body: ExperienceCapsuleBody): string {
  return sha256(canonicalJson(body));
}

/** The export review binds each selected item's content and provenance. */
export function digestExperienceItem(input: unknown): string {
  return sha256(canonicalJson(experienceItemSchema.parse(input)));
}

/** Supplied by the authenticated owner review flow, not by a model or capsule. */
export const experienceExportFactsSchema = z.object({
  ownerId: reference,
  sourceAgentId: reference,
  reviewRef: reference,
  reviewedAt: timestamp,
  reviewedItems: z.array(z.object({ itemId: reference, itemDigest: digest }).strict()).min(1).max(50),
}).strict();
export type ExperienceExportFacts = z.infer<typeof experienceExportFactsSchema>;

/** Build only from an explicitly selected, reviewed set of source records. */
export function buildExperienceCapsule(input: unknown, exportFactsInput: unknown): ExperienceCapsule {
  const body = experienceCapsuleBodySchema.parse(input);
  const facts = experienceExportFactsSchema.parse(exportFactsInput);
  const problems = bodyProblems(body);
  if (facts.ownerId !== body.sourceOwnerId || facts.sourceAgentId !== body.sourceAgentId ||
      facts.reviewRef !== body.exportReviewRef)
    problems.push("Export review does not match the source owner, Agent or review reference.");
  const reviewAge = Date.parse(body.createdAt) - Date.parse(facts.reviewedAt);
  if (reviewAge < -5_000 || reviewAge > 600_000)
    problems.push("Export selection review is not current.");
  if (new Set(facts.reviewedItems.map(item => item.itemId)).size !== body.items.length ||
      body.items.some(item => !facts.reviewedItems.some(reviewed =>
        reviewed.itemId === item.itemId && reviewed.itemDigest === digestExperienceItem(item))))
    problems.push("Export review does not cover exactly the selected item revisions.");
  if (problems.length) throw new Error(problems.join(" "));
  return experienceCapsuleSchema.parse({ ...body, digest: capsuleDigest(body) });
}

export type CapsuleInspection =
  | { ok: true; capsule: ExperienceCapsule; problems: [] }
  | { ok: false; capsule: null; problems: string[] };

/** A digest detects change; it does not authenticate the producer. */
export function inspectExperienceCapsule(input: unknown, now = Date.now()): CapsuleInspection {
  const parsed = experienceCapsuleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, capsule: null, problems: ["Capsule format is invalid or contains forbidden fields."] };
  const { digest: recordedDigest, ...body } = parsed.data;
  const problems = bodyProblems(body);
  if (recordedDigest !== capsuleDigest(body)) problems.push("Capsule digest does not match its contents.");
  if (Date.parse(body.createdAt) > now + 5_000) problems.push("Capsule creation time is in the future.");
  return problems.length ? { ok: false, capsule: null, problems } :
    { ok: true, capsule: parsed.data, problems: [] };
}

/** Human-readable review material; callers must restrict access to the owner. */
export function previewExperienceCapsule(input: unknown, now = Date.now()) {
  const inspection = inspectExperienceCapsule(input, now);
  if (!inspection.ok) return { ok: false as const, problems: inspection.problems };
  const { capsule } = inspection;
  return {
    ok: true as const,
    capsuleId: capsule.capsuleId,
    capsuleVersion: capsule.capsuleVersion,
    digest: capsule.digest,
    sourceAgentId: capsule.sourceAgentId,
    lineage: capsule.lineage,
    items: capsule.items.map(item => item.kind === "PACK_REF"
      ? { kind: item.kind, itemId: item.itemId, sourceRef: item.sourceRef,
        packKind: item.packKind, packId: item.packId, packVersion: item.packVersion }
      : { kind: item.kind, itemId: item.itemId, sourceRef: item.sourceRef,
        sourceScope: item.sourceScope, sourceRevision: item.sourceRevision,
        content: item.content, ...(item.kind === "LEARNING" ? { qualificationRef: item.qualificationRef } : {}) }),
  };
}

/**
 * These facts must be fetched from authenticated owner, source-record and
 * revocation services immediately before import. Never read them from the
 * capsule itself or accept a model's assertion in their place.
 */
export const experienceImportFactsSchema = z.object({
  ownerId: reference,
  targetAgentId: reference,
  targetIsNew: z.literal(true),
  approval: z.object({
    ownerId: reference, status: z.literal("APPROVED"), capsuleDigest: digest,
    approvedItemIds: z.array(reference).min(1).max(50), approvedAt: timestamp,
    approvalRef: reference,
  }).strict(),
  revocation: z.object({ capsuleId: z.string().uuid(), capsuleDigest: digest,
    state: z.literal("ACTIVE"), checkedAt: timestamp }).strict(),
  sourceRecords: z.array(z.object({ itemId: reference, sourceRevision: reference,
    sourceStatus: z.enum(["ACTIVE", "QUALIFIED"]), contentHash: digest,
    qualificationRef: reference.nullable() }).strict()).max(50),
  packManifests: z.array(z.object({ itemId: reference, packId: reference,
    packVersion: z.number().int().positive(), manifestHash: digest,
    status: z.literal("AVAILABLE") }).strict()).max(50),
}).strict();
export type ExperienceImportFacts = z.infer<typeof experienceImportFactsSchema>;

export type StagedExperience = {
  capsuleDigest: string;
  idempotencyKey: string;
  targetOwnerId: string;
  targetAgentId: string;
  approvalRef: string;
  records: Array<{
    kind: "MEMORY" | "LEARNING";
    itemId: string;
    content: string;
    targetScope: { type: "agent"; id: string };
    status: "STAGED";
    trust: "IMPORTED_CONTEXT";
    provenance: { capsuleDigest: string; sourceOwnerId: string; sourceAgentId: string;
      sourceRef: string; sourceRevision: string; sourceScope: { type: "owner" | "agent"; id: string };
      observedAt: string; qualificationRef: string | null };
  }>;
  packSuggestions: Array<{ packKind: "ROLE" | "CAPABILITY"; packId: string; packVersion: number;
    manifestHash: string; sourceRef: string; activation: "NONE" }>;
};

export type ExperienceImportResult =
  | { ok: true; staged: StagedExperience; problems: [] }
  | { ok: false; staged: null; problems: string[] };

/** No database write or pack activation occurs here. The caller owns staging. */
export function prepareExperienceImport(
  capsuleInput: unknown, factsInput: unknown, now = Date.now(),
): ExperienceImportResult {
  const inspection = inspectExperienceCapsule(capsuleInput, now);
  if (!inspection.ok) return { ok: false, staged: null, problems: inspection.problems };
  const parsedFacts = experienceImportFactsSchema.safeParse(factsInput);
  if (!parsedFacts.success) return { ok: false, staged: null, problems: ["Current import approval, revocation or source facts are unavailable."] };
  const capsule = inspection.capsule;
  const facts = parsedFacts.data;
  const problems: string[] = [];
  if (facts.ownerId !== capsule.sourceOwnerId || facts.approval.ownerId !== facts.ownerId)
    problems.push("Cross-owner capsule import is not supported.");
  if (facts.targetAgentId === capsule.sourceAgentId)
    problems.push("A capsule must be imported into a different new worker.");
  if (facts.approval.capsuleDigest !== capsule.digest)
    problems.push("Owner approval is for a different capsule digest.");
  if (facts.revocation.capsuleId !== capsule.capsuleId || facts.revocation.capsuleDigest !== capsule.digest)
    problems.push("Revocation check is for a different capsule.");
  const revocationAge = now - Date.parse(facts.revocation.checkedAt);
  if (revocationAge < -5_000 || revocationAge > 60_000)
    problems.push("Revocation status is not current.");
  if (Date.parse(facts.approval.approvedAt) > now + 5_000)
    problems.push("Owner approval is future-dated.");
  if (Date.parse(facts.approval.approvedAt) < Date.parse(capsule.createdAt) ||
      Date.parse(facts.revocation.checkedAt) < Date.parse(facts.approval.approvedAt))
    problems.push("Approval and revocation checks are out of order.");
  const ids = capsule.items.map(item => item.itemId);
  if (new Set(facts.approval.approvedItemIds).size !== ids.length ||
      ids.some(id => !facts.approval.approvedItemIds.includes(id)))
    problems.push("Owner approval does not cover exactly the selected items.");
  const records = capsule.items.filter(item => item.kind !== "PACK_REF");
  if (new Set(facts.sourceRecords.map(record => record.itemId)).size !== records.length ||
      records.some(item => !facts.sourceRecords.some(record =>
        record.itemId === item.itemId && record.sourceRevision === item.sourceRevision &&
        record.sourceStatus === item.sourceStatus && record.contentHash === item.contentHash &&
        record.qualificationRef === (item.kind === "LEARNING" ? item.qualificationRef : null))))
    problems.push("Source records are missing, superseded or outside the approved revision.");
  const packRefs = capsule.items.filter(item => item.kind === "PACK_REF");
  if (new Set(facts.packManifests.map(pack => pack.itemId)).size !== packRefs.length ||
      packRefs.some(item => !facts.packManifests.some(pack =>
        pack.itemId === item.itemId && pack.packId === item.packId &&
        pack.packVersion === item.packVersion && pack.manifestHash === item.manifestHash)))
    problems.push("A referenced pack is missing or changed in the trusted catalog.");
  if (problems.length) return { ok: false, staged: null, problems };

  return { ok: true, problems: [], staged: {
    capsuleDigest: capsule.digest,
    // The eventual database writer must enforce uniqueness on this key and
    // recheck revocation in its transaction; this pure function cannot do so.
    idempotencyKey: sha256(`${capsule.digest}\0${facts.targetAgentId}`),
    targetOwnerId: facts.ownerId,
    targetAgentId: facts.targetAgentId,
    approvalRef: facts.approval.approvalRef,
    records: records.map(item => ({
      kind: item.kind, itemId: item.itemId, content: item.content,
      targetScope: { type: "agent" as const, id: facts.targetAgentId },
      status: "STAGED" as const, trust: "IMPORTED_CONTEXT" as const,
      provenance: { capsuleDigest: capsule.digest, sourceOwnerId: capsule.sourceOwnerId,
        sourceAgentId: capsule.sourceAgentId, sourceRef: item.sourceRef,
        sourceRevision: item.sourceRevision, sourceScope: item.sourceScope,
        observedAt: item.observedAt,
        qualificationRef: item.kind === "LEARNING" ? item.qualificationRef : null },
    })),
    packSuggestions: capsule.items.filter(item => item.kind === "PACK_REF").map(item => ({
      packKind: item.packKind, packId: item.packId, packVersion: item.packVersion,
      manifestHash: item.manifestHash, sourceRef: item.sourceRef, activation: "NONE" as const,
    })),
  } };
}
