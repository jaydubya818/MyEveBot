# Integration dependencies and activation crosswalk

No owning branch is modified. Accepted Inbox base: `36675bd5c64fa848b32f7dfbbb349957b5853498`. Source contracts inspected at Beta `ed0f6b5dad0e3a131a9f5332139e627245cbd4e8`, Digital Worker `21973e5bf646ceec4c68dc90625ff020d405d7a9`, Goals `b9b46c41480f0859d44683346bd24d7ce9f2b7c9`.

| Owner | Exact existing contract | Inbox package / owning integration action |
| --- | --- | --- |
| Canonical Work | `lib/engineering/types.ts`: `Work.id,scopeId,version,generation,lifecycle`; `WorkPrincipal` | Implement `CanonicalContinuationPort.record`. Under canonical transaction validate owner/scope, exact generation/version, expected decision and current lifecycle. Persist answer and response-ID receipt, then mark eligible. No direct executor call. |
| Goals/Tasks | `lib/goal-work/contracts.ts`: `NeedsYouItem`, `NeedsYouPort.reconcile`, `DependencySignal`, `SignalPort`, `WorkPort` | `goalBlocker` accepts the structural NeedsYouItem and adds existing Goal/Task generations. `goalDependencySignal` emits the exact owner decision signal with response provenance. Canonical `SignalPort.verify` validates it; Goal OS owns dependency resolution and Work admission. |
| Relay | `lib/relay/transport.ts`: Envelope; `lib/relay/inbox.ts`: authenticated ingress and local permissions | Normalize only after current grant/audience/owner checks. Supply stable local mapping/projection hash via `SourceAuthority`; no local grant minted. Recheck retained evidence visibility on reads. |
| Canonical approvals | `lib/approvals.ts`: ApprovalRequestView, decideApproval | Inject exact owner-scoped effective-state `get(ownerId,id)` into `canonicalApprovals`. No historical lookup through a capped list. Display canonical view; delegate exact ID/hash and approved/denied; reconcile unknown outcomes from canonical read. |
| Beta Product Experience | `components/owner/{projection,data,decisions,experience}.tsx` at candidate SHA | Add an attention data slot and owner-action UI through product integration. See [exact UI crosswalk](beta-ux-crosswalk.md). |
| Reminders/schedules | `agent/lib/reminders-db.ts`, `agent/schedules/reminders.ts`, `lib/reminder-execution.ts`; Goal ReminderPort | Consume existing due-occurrence identity. `followUpIntent` requests an existing scheduler wakeup with a stable key. No Inbox timers, recurrence engine or delivery route. |
| Notifications | `lib/execution-delivery.ts`, `review_deliveries` | `notificationPolicy` yields a policy candidate and stable notification key. Existing dispatcher enforces channel permissions and durable delivery dedupe; no push is sent here. |
| Email/Slack/webhooks | `agent/channels/email.ts`, `agent/lib/agentmail.ts`, `agent/channels/slack.ts`, `agent/channels/hooks.ts` | Inject normalized already verified/fetched events. Gmail is an intended metadata adapter only. Do not enable blocked Slack delivery or acquire provider credentials. |

## Source admission

`ingestAuthorized` requires a canonical `Admission`: owner, audience owner, account, system/event, visibility, current grant state, grant ID, local correlation/episode/sequence, Work generation/version, optional Goal context, and a hash of the entire normalized projection. Neither an event body nor a UI request may supply these authority facts. The backend's exact source lookup supplies them. Local triage decides whether a request requires human judgment; sender text cannot set an actionable classification.

Provider adapters perform source event → normalized contract only. AgentMail uses its existing Message type and preserves attachment references. Gmail consumes fetched id/threadId/internalDate/snippet/header metadata, not raw MIME/attachment retrieval. Slack supports ordinary message/reply events; edit/delete/bot variants reject until the connector owner adds version semantics. Generic webhook events require a stable provider ID; never dedupe by subject or text when equivalence is unproven. Relay supports peer message/reply and Work-request presentation, with zero local authority.

`createInboxApi` now requires `sourceAuthority`. Read and mutation paths recheck the entire bounded evidence history before serializing content. Revoked/private histories fail closed even if the latest event came from Work. Histories of 100 or more distinct evidence records fail closed until a source-owned compact entitlement summary is integrated; they are not silently truncated into an authorization decision. `authorizedReader` is the mandatory wrapper when composing feeds. This is an explicit integration limit, not a live-provider qualification.

## Continuation and stale history

Version: `myeve.attention-continuation.v1`. Inputs: owner, response ID, attention ID, correlation/episode, Work ID/generation/version, Goal/Task/dependency generations, action ID/hash, decision class, answer/time, evidence reference, and canonical approval ID/hash/choice only for formal approvals.

The canonical receiver must atomically record either `{status:"accepted",receipt}` or `{status:"stale",receipt}` keyed by response ID and input digest. Reusing the response ID with changed content fails. Accepted means the matching dependency is satisfied/Work is eligible, **not** that Work resumed or an effect executed. The next Work/Goal dispatcher revalidates its normal budgets, permissions and lifecycle.

A generation-3 answer arriving after generation 4 is recorded as stale historical context and yields no eligibility. The Inbox retains the response as STALE and supersedes the episode. The durable fixture receiver proves this behavior; the canonical executor is untouched. Version mismatches also fail closed, even within a generation, unless the Work owner explicitly supplies a more stable decision revision contract later.

## Goals snapshot reconciliation

The existing Goals adapter's `myeve.attention.v1` event remains parseable. It does not carry Goal generations in its event yet; `goalBlocker` supplies them from the structural NeedsYouItem. Do not manufacture TaskRunView or duplicate Goal state.

The owner of snapshot delivery must serialize each owner/Goal snapshot, persist its accepted revision, reject older snapshots, and derive explicit supersession events for missing prior items. Apply a supersession/new request pair using `inbox.replace`; it commits atomically. Never turn “missing from a truncated list” into supersession. A snapshot must be complete for its declared scope. Informational Goal updates must omit action or stay in the existing Goal activity feed. Task scheduling and dependency eligibility remain entirely in Goal OS.
