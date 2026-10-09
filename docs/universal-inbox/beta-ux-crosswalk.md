# Beta UX crosswalk — ed0f6b5dad0e3a131a9f5332139e627245cbd4e8

Crosswalk: PASS. Beta UI contract: READY. This is a handoff package, not a claim that the candidate consumes the Inbox today. No Beta branch or presentation source is modified.

Pinned source inspected with `git show <SHA>:apps/eve/components/owner/<file>`: `projection.ts`, `data.ts`, `decisions.tsx`, `experience.tsx`.

| UI expectation | Already compatible | Required integration / missing backend data |
| --- | --- | --- |
| `OwnerSnapshot.approvals: ApprovalRequestView[]` | Canonical approval ID/hash, prompt, requested time/by, expiry, scope and effects are preserved. | Inbox item alone is not a full ApprovalRequestView. Join by exact owner-scoped ID/hash with canonical approval service. `betaApproval` validates the join and returns the original canonical view. |
| `DecisionCard.item.action,prompt,risk,expiresAt,resource,effects,estimatedCostUsd,parameters,provider,actionClass` | Prompt/expiry/effects/scope map to item action metadata. | Risk, cost, parameters, provider and action class must come from canonical approval view. No defaults/fabrication. |
| `pendingApprovals` filters status pending and expiry | Same expiry boundary for formal approvals. | Needs You includes decisions/clarifications/account actions/recovery too. They must use `AttentionView.needsYou`, not pendingApprovals. |
| DecisionCard PATCH `/api/approvals/:id` with `{decision,bindingHash}` | Existing canonical approval path remains authoritative. | Inbox response path is POST with item/action/revision/binding/idempotency key and returns 202 WAITING. Product integration must choose one command path per action, then reconcile canonical state. Never submit both. |
| `OwnerSnapshot.tasks`, `taskState`, `projectWork` | Work reference and title can link to existing details. | Inbox has no complete TaskRunView and must not synthesize one. `waiting_for_owner`, blocked and failed status alone do not establish a valid owner action. |
| `experience.tsx` exceptions include Needs you / Blocked / Recovery | Useful presentation labels. | Use the Inbox predicate for actionable cards; keep informational Work exceptions distinct. Remove duplicate cards by canonical attention/correlation identity, not title. |
| `data.ts` resources list | Existing auth/no-store/error handling fits unmounted Inbox API. | Add attention resource only after production persistence/admission/continuation cutover. No attention slot exists in this candidate. |
| Today | Existing page can display bounded lists and counts. | Add `todayContribution(authorizedReader(...))`; count is explicit `{value,capped}` and renders 100+ if capped, never a fabricated exact total. |
| Daily Brief | Existing DailyBriefView remains composition-owned. | Merge the Inbox contribution by stable IDs and exclusive/inclusive window; do not replace DailyBriefView with InboxPage. |
| Source evidence, thread, read/unread and response binding | Available on AttentionView. | Add rendering/interaction under product ownership; the old Work/approval projection has no corresponding fields. |

`betaAttention` supplies a proposed additive `attention` entry: id, title, prompt, state, Work/correlation IDs, needsYou, availableActions and response binding. It deliberately cannot be assigned to the old tasks/approvals arrays. [Generated joined fixtures](../verification/universal-inbox/integration-preparation/beta-feed-fixtures.json) include both the canonical approval array and the separate attention projection.

Fixture-only assumptions: frozen clock, synthetic accounts/references, fixture SQL store, synthetic canonical approval, no real provider entitlements, no actual Work continuation. The Beta candidate's preview mode updates local sample approvals; that behavior is not canonical approval acknowledgment. Live UI must show 202 as “answer recorded; awaiting canonical handling,” refresh after 409, retain idempotency keys across uncertain retries, and never interpret a failed load as an authoritative empty state.
