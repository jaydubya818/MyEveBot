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

/** Integration composition: the authority owner supplies an exact, owner-scoped effective-state read.
 * A bounded list scan is intentionally insufficient for historical response replay. */
export function canonicalApprovals(readExact: CanonicalApprovals["get"]): CanonicalApprovals {
  return {
    get: readExact,
    async decide(input) { return (await import("../approvals.ts")).decideApproval(input); },
  };
}
