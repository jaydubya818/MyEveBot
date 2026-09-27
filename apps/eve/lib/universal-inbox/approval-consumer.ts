import type { ApprovalRequestView, decideApproval } from "../approvals.ts";
import type { OwnerResponse } from "./contracts.ts";
import type { ResponseConsumer } from "./service.ts";

export interface CanonicalApprovals {
  get(ownerId: string, id: string): Promise<ApprovalRequestView | null>;
  decide: typeof decideApproval;
}
/** No approval rows, grants, execution routes, or Work states are written by the Inbox. */
export function approvalConsumer(authority: CanonicalApprovals, work: ResponseConsumer): ResponseConsumer {
  return {
    async accept(response: OwnerResponse) {
      const binding = response.action.approval;
      if (response.action.kind !== "approval" || !binding) return work.accept(response);
      if (response.answer !== "approved" && response.answer !== "denied") throw new Error("INVALID_APPROVAL_CHOICE");
      const matching = (approval: ApprovalRequestView | null) => approval?.id === binding.id && approval.bindingHash === binding.bindingHash;
      let current = await authority.get(response.ownerId, binding.id);
      if (!matching(current)) throw new Error("CANONICAL_APPROVAL_CHANGED");
      if (current!.status === "pending") {
        try {
          current = await authority.decide({ ownerId: response.ownerId, id: binding.id, bindingHash: binding.bindingHash,
            decision: response.answer, decidedBy: response.ownerId, reason: `Inbox response ${response.id}` });
        } catch (error) {
          // The canonical write may have committed before the connection failed.
          current = await authority.get(response.ownerId, binding.id);
          if (!matching(current) || current!.status !== response.answer) throw error;
        }
      }
      if (!matching(current) || current!.status !== response.answer) throw new Error("CANONICAL_APPROVAL_NOT_APPLIED");
      // Canonical Work must recheck approval authority, expiry and current Work generation.
      // Retrying here uses response.id; it must never blindly execute the approved effect.
      return work.accept(response);
    },
  };
}

/** Production authority adapter. Lazy imports keep fixture/browser contracts dependency-free. */
export function canonicalApprovals(): CanonicalApprovals {
  return {
    async get(ownerId, id) {
      const { listApprovalRequests } = await import("../approvals.ts");
      // Existing owner-scoped API is bounded to 100. Missing historical records fail closed.
      return (await listApprovalRequests(ownerId)).find(approval => approval.id === id) ?? null;
    },
    async decide(input) { return (await import("../approvals.ts")).decideApproval(input); },
  };
}
