import type { ApprovalRequestView } from "../approvals.ts";
import type { AttentionView } from "./contracts.ts";
/** Beta ed0f6b5 expects full canonical ApprovalRequestView. Never fabricate missing authority fields. */
export function betaApproval(item: AttentionView, canonical: ApprovalRequestView): ApprovalRequestView {
  if (!item.needsYou || item.action?.kind !== "approval" || item.action.approval?.id !== canonical.id ||
      item.action.approval.bindingHash !== canonical.bindingHash || canonical.status !== "pending" ||
      canonical.expiresAt !== item.action.expiresAt) throw new Error("BETA_APPROVAL_PROJECTION_STALE");
  return canonical;
}
/** Proposed additive data slot; does not synthesize fake TaskRunView or formal approvals. */
export function betaAttention(item: AttentionView) {
  return { id: item.id, title: item.title, prompt: item.action?.prompt ?? item.summary,
    state: item.needsYou ? "Needs you" : item.status === "WAITING" ? "Waiting" : item.status === "RESOLVED" ? "Complete" : "Informational",
    workId: item.workId, correlationId: item.correlationId, needsYou: item.needsYou, availableActions: item.availableActions,
    responseBinding: item.action ? { actionId: item.action.id, actionBinding: item.actionBinding, expectedRevision: item.revision, options: item.action.options } : null };
}
