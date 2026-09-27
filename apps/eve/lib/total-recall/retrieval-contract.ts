import { z } from "zod";

const id = z.string().trim().min(1).max(255);
export const selectedKnowledgeSchema = z.object({ workId: z.string().uuid(), knowledgeId: id }).strict();
export const workRecallRequestSchema = z.object({
  contractVersion: z.literal(1), ownerId: id, workId: z.string().uuid(), workVersion: z.number().int().positive(),
  repository: id, projectId: z.null(), objective: z.string().min(1).max(4000),
  context: z.object({ query: z.string().trim().min(1).max(500), purpose: z.enum(["answer", "plan"]),
    workType: z.enum(["research", "implementation", "review"]), reference: z.string().trim().min(1).max(200) }).strict(),
  scope: z.object({ selectedKnowledge: z.array(selectedKnowledgeSchema).max(20), selectedOwnerMemoryIds: z.array(id).max(20) }).strict(),
  limits: z.object({ maxItems: z.number().int().min(1).max(12), maxCharacters: z.number().int().min(512).max(16000),
    minRelevance: z.number().min(0.1).max(1) }).strict(),
}).strict();
export type WorkRecallRequest = z.infer<typeof workRecallRequestSchema>;
export const recallItemSchema = z.object({
  identity: id, kind: z.enum(["memory", "knowledge"]), text: z.string().min(1).max(20000),
  ownerId: id, scope: z.object({ kind: z.enum(["OWNER", "WORK"]), workId: z.string().uuid().nullable(), repository: id.nullable() }).strict(),
  privacy: z.enum(["PRIVATE", "WORK_SCOPED"]), truth: z.enum(["CURRENT", "UNCERTAIN", "CONFLICTING", "STALE", "HISTORICAL"]),
  confidence: z.number().min(0).max(1), relevance: z.number().min(0).max(1),
  supersedesId: id.nullable(), supersededById: id.nullable(),
  provenance: z.array(z.object({ sourceId: id, type: id, reference: id, contentHash: id.nullable(),
    origin: z.enum(["OWNER", "INFERENCE", "OBSERVATION"]), relation: id }).strict()).min(1).max(20),
  reasonUsed: z.string().min(1).max(1000),
}).strict().refine(item => item.scope.kind === "WORK"
  ? item.scope.workId !== null && item.scope.repository !== null && item.privacy === "WORK_SCOPED"
  : item.scope.workId === null && item.scope.repository === null && item.privacy === "PRIVATE", "Recall scope and privacy must agree.");
export type RecallItem = z.infer<typeof recallItemSchema>;
export interface RecallBundle {
  contractVersion: 1; ownerId: string; workId: string; workVersion: number; repository: string; contextRef: string;
  items: RecallItem[]; sourceRefs: string[]; contentHash: string; characters: number;
  exclusions: Record<"irrelevant" | "stale" | "historical" | "duplicate" | "unsafe" | "budget", number>;
  trust: "EVIDENCE_ONLY"; authorityGrants: readonly [];
}
/** Supplied by the authenticated caller/selection store, never by the model or
 * a serialized recall request. Exact selected identities must be covered. */
export interface RecallSelectionPolicy {
  authorize(input: { ownerId: string; targetWorkId: string; repository: string;
    selectedKnowledge: WorkRecallRequest["scope"]["selectedKnowledge"]; selectedOwnerMemoryIds: string[] }): Promise<boolean>;
}
export const denyCrossWorkSelection: RecallSelectionPolicy = {
  async authorize(input) { return !input.selectedKnowledge.length && !input.selectedOwnerMemoryIds.length; },
};
