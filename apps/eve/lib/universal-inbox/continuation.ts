import { z } from "zod";
import { goalLinkSchema, type OwnerResponse } from "./contracts.ts";
import type { ResponseConsumer } from "./service.ts";
const ref = z.string().min(1).max(255);
export const continuationSchema = z.object({
  version: z.literal("myeve.attention-continuation.v1"), responseId: ref, ownerId: ref,
  workId: ref.nullable(), workGeneration: z.number().int().positive().nullable(), workVersion: z.number().int().positive().nullable(),
  attentionId: ref, correlationId: ref, episode: z.number().int().positive(),
  actionId: ref, actionBinding: z.string().regex(/^[a-f0-9]{64}$/),
  decisionClass: z.enum(["APPROVAL", "DECISION", "CLARIFICATION", "RECOVERY", "ACCOUNT_ACTION"]),
  answer: z.string().min(1).max(4000), answeredAt: z.string().datetime(),
  goal: goalLinkSchema.nullable(), evidenceRef: ref,
  canonicalApproval: z.object({ id: ref, bindingHash: z.string().regex(/^[a-f0-9]{64}$/), decision: z.enum(["approved", "denied"]) }).strict().nullable(),
}).strict().superRefine((value, ctx) => {
  if ((value.decisionClass === "APPROVAL") !== Boolean(value.canonicalApproval)) ctx.addIssue({ code: "custom", message: "Approval authority binding required only for formal approval." });
  if (value.workId && (!value.workGeneration || !value.workVersion)) ctx.addIssue({ code: "custom", message: "Continuation requires the exact Work generation/version." });
  if (!value.workId && !value.goal) ctx.addIssue({ code: "custom", message: "No canonical continuation target." });
});
export type Continuation = z.infer<typeof continuationSchema>;
export interface ContinuationReceipt { status: "accepted" | "stale"; receipt: string }
export interface CanonicalContinuationPort {
  /** MUST atomically validate owner, generation/version, exact dependency/action and dedupe
   * responseId; persist historical stale answers too. Accepted = eligible, never executed. */
  record(input: Continuation): Promise<ContinuationReceipt>;
}
export function continuationInput(response: OwnerResponse): Continuation {
  const action = response.action;
  return continuationSchema.parse({ version: "myeve.attention-continuation.v1", responseId: response.id, ownerId: response.ownerId,
    workId: response.workId, workGeneration: response.workGeneration, workVersion: response.workVersion,
    attentionId: response.itemId, correlationId: response.correlationId, episode: response.episode,
    actionId: action.id, actionBinding: response.actionBinding,
    decisionClass: action.kind === "approval" ? "APPROVAL" : action.kind === "account_action" ? "ACCOUNT_ACTION" : action.kind === "recovery" ? "RECOVERY"
      : ["missing_information", "ambiguous_requirement"].includes(action.reason) ? "CLARIFICATION" : "DECISION",
    canonicalApproval: action.approval ? { id: action.approval.id, bindingHash: action.approval.bindingHash, decision: response.answer } : null,
    answer: response.answer, answeredAt: response.createdAt, goal: response.goal, evidenceRef: response.id });
}
export function continuationConsumer(port: CanonicalContinuationPort): ResponseConsumer {
  return { async accept(response) { return port.record(continuationInput(response)); } };
}
/** Exact structural DependencySignal at Goals candidate b9b46c4; no Goal OS mutation. */
export function goalDependencySignal(input: Continuation) {
  if (!input.goal || !["DECISION", "CLARIFICATION"].includes(input.decisionClass)) throw new Error("NOT_A_GOAL_DECISION");
  return { ownerId: input.ownerId, ...input.goal, eventId: input.responseId, kind: "owner" as const,
    evidenceRef: input.evidenceRef, option: input.answer };
}
