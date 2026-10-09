import { z } from "zod";

export const CONTRACT_VERSION = "myeve.attention.v1" as const;
const ref = z.string().trim().min(1).max(255);
const time = z.string().datetime({ offset: true }).transform(value => new Date(value).toISOString());
export const kinds = ["MESSAGE", "REQUEST", "DECISION", "APPROVAL", "BLOCKER", "FOLLOW_UP", "REMINDER", "RESULT", "EXCEPTION"] as const;
export const statuses = ["NEW", "SEEN", "NEEDS_ACTION", "WAITING", "RESOLVED", "DISMISSED", "SUPERSEDED"] as const;
export const actionSchema = z.object({
  id: ref,
  kind: z.enum(["decision", "approval", "account_action", "recovery"]),
  reason: z.enum(["approval", "choice", "missing_information", "account_action", "ambiguous_requirement", "exception_recovery", "internal_coordination"]),
  involvement: z.enum(["NECESSARY_JUDGMENT", "AVOIDABLE_COORDINATION"]),
  prompt: z.string().trim().min(1).max(2000),
  options: z.array(ref).max(20).default([]),
  expiresAt: time.nullable().default(null),
  approval: z.object({ id: ref, bindingHash: z.string().regex(/^[a-f0-9]{64}$/), why: ref, scope: ref, effects: z.array(ref).min(1).max(20) }).strict().optional(),
}).strict().superRefine((value, ctx) => {
  if ((value.kind === "approval") !== Boolean(value.approval)) ctx.addIssue({ code: "custom", message: "Approval actions require an exact canonical binding." });
  if (value.kind === "approval" && (value.reason !== "approval" || !value.expiresAt || value.options.join(",") !== "approved,denied")) ctx.addIssue({ code: "custom", message: "Approval requires expiry and canonical choices." });
  if (value.reason === "internal_coordination" && value.involvement !== "AVOIDABLE_COORDINATION") ctx.addIssue({ code: "custom", message: "Internal coordination cannot be necessary judgment." });
  if (new Set(value.options).size !== value.options.length) ctx.addIssue({ code: "custom", message: "Duplicate options." });
});
export type OwnerAction = z.infer<typeof actionSchema>;
export const sourceSchema = z.object({
  system: z.enum(["relay", "email", "slack", "work", "approval", "reminder", "notification", "webhook"]),
  accountId: ref, eventId: ref, sender: ref, threadId: ref.nullable().default(null),
  occurredAt: time, reference: ref, grantId: ref.nullable().default(null),
  attachments: z.array(z.object({ id: ref, name: ref, reference: ref }).strict()).max(30).default([]),
  // References to source-owned evidence only. No credentials or private peer state.
  evidence: z.array(ref).max(30).default([]),
}).strict();
export const goalLinkSchema = z.object({
  goalId: ref, taskId: ref, goalGeneration: z.number().int().positive(), taskGeneration: z.number().int().positive(),
  dependencyId: ref, reference: ref,
}).strict();
export const eventSchema = z.object({
  kind: z.enum(kinds), title: z.string().trim().min(1).max(500),
  summary: z.string().max(4000), source: sourceSchema,
  // Assigned by trusted local adapters, never accepted as authority from peer content.
  correlationId: ref, episode: z.number().int().min(1).max(1_000_000).default(1),
  sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  workId: ref.nullable().default(null),
  workGeneration: z.number().int().positive().nullable().default(null),
  workVersion: z.number().int().positive().nullable().default(null),
  goal: goalLinkSchema.nullable().default(null),
  relation: z.enum(["request", "reply", "update"]).default("update"),
  waitingFor: z.enum(["external", "owner", "schedule", "provider"]).nullable().default(null),
  action: actionSchema.nullable().default(null),
  disposition: z.enum(["update", "waiting", "resolve", "supersede"]).default("update"),
  priority: z.object({ blockingActiveWork: z.boolean().default(false), deadlineAt: time.nullable().default(null),
    urgency: z.enum(["normal", "urgent"]).default("normal"), ownerRequested: z.boolean().default(false),
    dependencyCount: z.number().int().min(0).max(1000).default(0), sourceImportance: z.number().int().min(0).max(3).default(0),
  }).strict().default({ blockingActiveWork: false, deadlineAt: null, urgency: "normal", ownerRequested: false, dependencyCount: 0, sourceImportance: 0 }),
  followUpAt: time.nullable().default(null),
}).strict().superRefine((event, ctx) => {
  if ((event.workGeneration !== null || event.workVersion !== null) && !event.workId) ctx.addIssue({ code: "custom", message: "Work generation/version require Work identity." });
  if ((event.workGeneration === null) !== (event.workVersion === null)) ctx.addIssue({ code: "custom", message: "Work generation/version must be bound together." });
  if (event.action && event.disposition !== "update") ctx.addIssue({ code: "custom", message: "Settlement/waiting events cannot request action." });
  if (event.action && ["MESSAGE", "RESULT", "FOLLOW_UP", "REMINDER"].includes(event.kind)) ctx.addIssue({ code: "custom", message: "Informational events cannot request owner action." });
  if (event.priority.blockingActiveWork && !event.workId) ctx.addIssue({ code: "custom", message: "Blocking priority requires Work." });
});
export type AttentionEvent = z.infer<typeof eventSchema>;
export interface AttentionItem {
  version: typeof CONTRACT_VERSION;
  id: string; ownerId: string; correlationId: string; episode: number; workId: string | null;
  kind: typeof kinds[number]; status: typeof statuses[number]; title: string; summary: string;
  revision: number; sourceSequence: number; createdAt: string; updatedAt: string;
  seenAt: string | null; notification: "UNREAD" | "READ";
  source: AttentionEvent["source"]; priority: AttentionEvent["priority"]; priorityScore: number;
  action: OwnerAction | null; actionBinding: string | null; followUpAt: string | null;
  responseId: string | null;
  workGeneration: number | null; workVersion: number | null; goal: z.infer<typeof goalLinkSchema> | null;
  waitingFor: AttentionEvent["waitingFor"];
  actionRequiredAt: string | null; resolvedAt: string | null; supersededAt: string | null;
  lastExternalReplyAt: string | null; lastMessageAt: string | null;
}
export interface AttentionView extends AttentionItem {
  needsYou: boolean;
  availableActions: Array<"mark_read" | "mark_unread" | "dismiss" | "respond">;
}
export const responseSchema = z.object({
  itemId: ref, actionId: ref, actionBinding: z.string().regex(/^[a-f0-9]{64}$/),
  expectedRevision: z.number().int().positive(), idempotencyKey: ref,
  answer: z.string().trim().min(1).max(4000),
}).strict();
export type OwnerResponseInput = z.infer<typeof responseSchema>;
export interface OwnerResponse {
  id: string; ownerId: string; itemId: string; workId: string | null;
  action: OwnerAction; actionBinding: string; answer: string; createdAt: string;
  correlationId: string; episode: number; workGeneration: number | null; workVersion: number | null;
  goal: z.infer<typeof goalLinkSchema> | null;
  status: "PENDING" | "DELIVERED" | "CANCELLED" | "STALE"; receipt: string | null;
}
export interface Evidence {
  id: string; itemId: string; ownerId: string; digest: string;
  event: AttentionEvent; receivedAt: string; deliveries: number;
}
export interface InboxPage { version: typeof CONTRACT_VERSION; items: AttentionView[]; nextCursor: string | null }
export interface InboxQuery {
  view?: "inbox" | "needs_you" | "waiting" | "archive" | "decision_history" | "thread";
  limit?: number; cursor?: string; workId?: string; correlationId?: string;
  bucket?: "new_needs_you" | "unresolved_important" | "important" | "resolved" | "external_replies" | "follow_up" | "blocked";
  since?: string; until?: string;
}
