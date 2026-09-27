import { z } from "zod";

export const CAPSULE_LIMITS = { bytes: 1_048_576, items: 100, textBytes: 16_384, depth: 16 } as const;
export const CAPSULE_EXCLUSIONS = ["Credentials", "Sessions", "Connected apps", "Permissions and grants", "Approvals", "Active Work and Runs", "Writer leases", "Provider, billing, publication, Factory and Relay authority"] as const;
const ref = z.string().min(1).max(160).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/);
export const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const scopeSchema = z.object({ type: z.enum(["owner", "agent", "project"]), id: ref }).strict();
export const itemSchema = z.object({
  id: ref,
  kind: z.enum(["memory", "knowledge", "preference", "project", "procedure", "skill", "role", "pack", "example", "learning", "file"]),
  key: z.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9._-]*$/),
  title: z.string().min(1).max(160),
  text: z.string().min(1).max(CAPSULE_LIMITS.textBytes),
  version: z.string().regex(/^\d+\.\d+\.\d+$/).max(32),
  scope: scopeSchema,
  privacy: z.literal("private"),
  provenance: z.object({
    sourceRef: ref, sourceType: z.enum(["owner_statement", "knowledge", "skill", "role", "pack", "file", "historical_work", "qualified_learning"]),
    revision: ref, observedAt: z.string().datetime(), policyRef: ref,
    qualificationRef: ref.optional(),
  }).strict(),
  mediaType: z.enum(["text/plain", "text/markdown"]).optional(),
}).strict();
export type CapsuleItem = z.infer<typeof itemSchema>;
export type CapsuleScope = z.infer<typeof scopeSchema>;
export const manifestSchema = z.object({
  format: z.literal("myeve-memory-capsule"), formatVersion: z.enum(["1.0", "1.1"]),
  capsuleId: z.string().uuid(), createdAt: z.string().datetime(),
  source: z.object({ ownerRef: digestSchema, eveRef: ref }).strict(),
  compatibility: z.object({ minimumReader: z.literal("1.0"), activation: z.literal("review_required") }).strict(),
  inventory: z.array(z.object({ id: ref, digest: digestSchema, bytes: z.number().int().positive() }).strict()).min(1).max(CAPSULE_LIMITS.items),
}).strict();
export const capsuleSchema = z.object({
  manifest: manifestSchema, items: z.array(itemSchema).min(1).max(CAPSULE_LIMITS.items), digest: digestSchema,
}).strict();
export type Capsule = z.infer<typeof capsuleSchema>;

/** Trusted adapter facts. Never populate these from uploaded Capsule assertions. */
export interface ExportCandidate {
  item: CapsuleItem;
  policy: {
    ownerRef: string;
    classification: "personal" | "corporate" | "third_party_private";
    portability: "allowed" | "denied" | "unknown";
    sourceCategory: "experience" | "credential" | "session" | "authority" | "active_work";
    state: "active" | "promoted" | "candidate" | "rejected";
  };
}
export class CapsuleError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = "CapsuleError"; }
}
