# Goal OS integration preparation crosswalk

**Supersedes** integration-gap descriptions in the first-tranche contracts, accepted
at `b9b46c41480f0859d44683346bd24d7ce9f2b7c9`. Local contracts are qualified; live
registration remains pending. See [evidence and statuses](verification/goals-proactive-work/integration-preparation/README.md).

## Pinned dependencies and ownership

| Owner | Read-only candidate / inspected files | Prepared Goal seam |
| --- | --- | --- |
| Canonical Work/Result | `21973e5bf646ceec4c68dc90625ff020d405d7a9`; `lib/engineering/types.ts`, `lib/digital-worker/contracts.ts` | `lib/goal-work/canonical-adapter.ts`; actual validators injected, no protected-verifier fork |
| Universal Inbox | `36675bd5c64fa848b32f7dfbbb349957b5853498`; `lib/universal-inbox/{contracts,domain,service,fixture-repository}.ts` | `attention-adapter.ts`, `inbox-adapter.ts`; actual pinned service exercised |
| Beta Product Experience | `ed0f6b5dad0e3a131a9f5332139e627245cbd4e8`; `components/owner/{data,projection}.ts` | `product-adapter.ts`, authenticated unmounted `api.ts` |
| Memory / governed learning | `4b31ddebe8235fc1efca154d41ee37061be2a444`; `lib/engineering/knowledge.ts`, `lib/total-recall/{store,learning}.ts` | `context-adapter.ts`; request descriptors and evidence-only references |
| Scheduler / event sources | This branch's inherited `agent/schedules/reminders.ts`, `lib/{reminder-execution,routine-review,routine-release}.ts`, existing event/source infrastructure | `event-adapters.ts`; callable adapters only |

All paths in this table are under `apps/eve`. The evidence `sources.json` records
exact Git object source-byte hashes for imported contracts and inspected Memory stores.
No sibling checkout, Factory/Gate B/C, protected execution or shared schema head changed.

## Task → canonical Work → router

`WorkRequest` retains `ownerId`, `goalId`, `taskId`, `goalGeneration`, `taskGeneration`,
`objective`, `goalObjective`, `criteria`, `goalCriteria`, `planVersion`, bounded required
capabilities, assignment, target time, dependencies (identity/kind/reference/evidence/
notBefore), owner decision references and `correlationKey`. This is durable intent,
not a canonical grant. The gateway persists it alongside the canonical Work binding.

| Canonical create field | Mapping |
| --- | --- |
| title / objective | Task objective (title bounded to canonical 160 characters) |
| criteria | Task criterion statement, UUIDv8 derived from correlation/index/statement; method from canonical policy |
| repository / maxCostUsd / maxDurationSeconds | Existing server policy; no Goal field can enlarge them |
| idempotencyKey | UUIDv8 from owner and Goal correlation key |
| canonical owner | Authenticated owner passed separately; personal Work scope must match |
| route hints | Optional enum DIRECT / DEEP_AGENT / EXECUTOR / MYFACTORY / RELAY / HUMAN, descriptive only |

`find` precedes `ensure`; replay uses the frozen binding even if current creation policy
has changed. The gateway must atomically deduplicate owner/correlation and canonical
UUID key, reject changed intent, persist the frozen create payload and independently
retain canonical admission policy. Eight concurrent eligibility deliveries, ten
lost-response replays and repeated schedule/event deliveries reuse one logical Work.
A MYFACTORY hint fixture retains canonical `allowedRoutes: [DIRECT]` and its fixed
budget. No Goal module imports or calls a Factory/provider executor.

Only the canonical router chooses execution after Work creation. Canonical execution
must recheck current authority even when this adapter recovers an existing Work.

## Canonical Result → Task → Goal

The authoritative reader returns receipt ID, immutable Work binding, current v2 Work
contract, v2 ProofOfWork, integrity verification/hash, Work generation and current Result
revision. The adapter invokes the actual canonical schemas and `proofLinkProblems`.
It checks owner/Work scope, exact criteria/method bindings, content hash and versions.
An integrity flag or proof from a caller is never acceptable input to a public API.

| Canonical outcome / condition | Core evaluation |
| --- | --- |
| COMPLETED, current, independently proven, matching criteria | SUCCEEDED + verified; current Task may complete |
| Evidence item PASS | A criterion state only; not a Work outcome or sufficient proof by itself |
| PARTIAL (including PASS evidence items) | Retain partial Result; Task stays unfinished |
| FAILED / BLOCKED / CANCELLED | Retain outcome and reason; Task stays unfinished for review |
| SUPERSEDED or wrong Work/criteria/Result revision | Not current; cannot complete |
| Missing independent evidence / bad integrity / changed criteria | Not verified; cannot complete |
| Result for old Task or Goal generation | Historical link retained; cannot complete current Task |
| Narrative `outcome: PASS` | Rejected by canonical v2 schema |

Goal evidence comes only from verified matching Goal criterion statements or explicit
authenticated owner criterion confirmation. Completing every Task is insufficient.
There must be no unfinished mandatory Task or outstanding Work; every required Goal
criterion needs current-generation evidence. Where policy requires, owner completion
confirmation is bound to the current Goal revision/generation. Owner reopen advances
current generation, invalidates current confirmation/evidence and retains history.
Automatic evidence-invalidation subscription remains an integration dependency.

## Inbox / Needs You / follow-up

An actionable unresolved owner dependency maps to `myeve.attention.v1` `DECISION`,
with a generation-bound action ID, exact prompt/options, owner correlation and source
sequence. Canonical `needsYou` and `availableActions` determine owner presentation.
Ordinary scheduled/external/file/Work waiting and informational outcomes are not owner
choices. External waiting can map to `FOLLOW_UP`, `action:null`, `disposition:waiting`
and `followUpAt`; Inbox owns follow-up timing. No duplicate reminder is created.

The authenticated `decision` command passes canonical `{itemId, actionId,
actionBinding, expectedRevision, idempotencyKey, answer}` to `Inbox.respond`.
202 means the response is retained, not that Work resumed. `Inbox.deliver` calls
`GoalInboxConsumer.accept`; it rereads the authoritative response, validates owner,
current action/item identity and binding, and resolves the exact dependency through
`SignalPort.verify`. The service then reevaluates eligibility. Canonical acknowledgment
settles delivery. Source reconciliation must not supersede an item with a response
already in delivery; let Inbox finish its own acknowledgment. Missing old actions
settle stale, cancelled responses do not act, conflicting bindings fail, and repeated
accepted delivery reuses the retained signal/Work.

## Beta Today, Brief and Work

The pinned Beta `OwnerSnapshot` expects `goals: GoalSummaryView[]`, `tasks: TaskRunView[]`,
`outcomes: OutcomeView[]`, `approvals: ApprovalRequestView[]`, `brief: DailyBriefView`.
Its fetch paths are `/api/goals`, `/api/task-runs`, `/api/outcomes`, `/api/approvals` and
`/api/reviews?kind=daily`. Goal Tasks are not TaskRuns; Inbox decisions are not approvals.
The adapter therefore maps compatible Goal summaries and Briefs, and supplies additive
Goal Task/Inbox projections for the Beta owner's eventual integration.

| Owner question / surface | Exact prepared field |
| --- | --- |
| Active Goals | `composeToday.activeGoals`: ID, objective, criterion count text |
| What Sofie is doing | `doing`: Work ID, Goal ID, Task title |
| What can proceed | `canProceed`: eligible Task plus current admission check |
| Waiting dependencies | `waiting`: title, reason, nextAction; no fabricated decision |
| Needs me | `needsYou`: canonical Inbox prompt/options/availableActions |
| What completed | `completed`: Task/title/time; Goal detail `recentResults` links Work/Result |
| Goal progress / Work listing | `betaGoal`: existing GoalSummaryView, criterion-based percent; actual `projectWork` tested |
| Active Tasks / next Work | Goal detail `tasks`, `currentWork`; Today `canProceed`; future Work remains an admission candidate |
| Brief changes | `details.goalProgressChanges`, `completedTasks`, `completedWork` |
| Brief blockers / cleared dependencies | `newBlockers`, `dependenciesCleared` |
| Brief owner/next/scheduled actions | `needsYou`, `newlyEligibleTasks`, `upcomingScheduledDependencies` |

`composeBrief.review` is the existing DailyBriefView with priorities, overdue,
approaching, blocked, pending owner actions and completed work. It does not invent
at-risk predictions. `today.json` and `brief.json` contain realistic nonempty examples
for every requested category. Preserve cursor/truncation semantics: these are bounded
pages, not a claim to list every Goal. Label progress as required outcomes; legacy
Task-count copy must not imply the percentage means Task completion.

The browser-safe authenticated API boundary passes the full fixture journey. Actual
Beta browser integration is **PARTIAL / pending**. No second UI/design system or
unconnected approval controls were introduced to claim a browser PASS.

## Authenticated API contract

`createGoalApi` is unmounted. Registration chooses the final path; tests use
`/api/goal-work`. Authentication uses the existing production signed session format,
without development bypass. Owner ID never comes from command JSON. Same-origin
writes, a 32 KiB streaming body cap, strict schemas and no-store responses apply.

| Request | Response / behavior |
| --- | --- |
| GET, optional `cursor`, `limit` | Bounded Today Goal list and next cursor |
| GET `goalId` | `{goal}` including plan/history/progress |
| GET `goalId`, `taskId` | `{task}` scoped to owner and Goal |
| GET `view=brief`, `since`, `until`, `cursorAt`, `cursorId` | Stable interval with bounded event cursor; both cursor fields required together |
| POST `operation:create`, `goal` | 201 with projection; repeated same ID/input is idempotent |
| `change`, `goal`, `expectedRevision` | Current revision required |
| `control`, `goalId`, `action`, `reason`, `expectedRevision` | pause/resume/reopen/archive; resume reevaluates eligibility |
| `plan`, `goalId`, `summary`, `reason`, UUID `commandId` | Stable replayable owner plan command |
| `task`, `goalId`, `task` | 201 Task projection with provenance |
| `confirm`, `goalId`, `criterion`, `decisionRef`, `expectedRevision` | Explicit owner criterion evidence; then reevaluate completion |
| `confirm_completion`, `goalId`, `decisionRef`, `expectedRevision` | Policy-required confirmation of current Goal; stale requests conflict |
| `decision`, canonical `response` | 202, Inbox delivery pending |

Unauthenticated 401; cross-origin 403; wrong owner/missing record 404; invalid 400;
stale/conflicting state 409; overlarge 413; unsupported method 405; recognized storage
outages 503. Error bodies omit raw SQL/evidence. Beta should preserve its existing
loading/empty/error behavior and distinguish pending delivery from confirmed continuation.

## Scheduler and event hosts

The existing reminder schedule calls reviewed occurrence admission, an execution worker
and delivery service. `ROUTINE_RELEASE.enabled` is false on this inherited baseline;
this tranche does not change it. The prepared wake adapter uses the trusted host clock
and exact owner/Goal/Task/generations/dependency/schedule reference. Before due time it
waits. At due time it reevaluates every dependency. Another blocker still prevents Work.
Manual and scheduled concurrent replay share correlation. Existing hosts own delivery
retries and the durable sweep cursor; no new cron, scheduler or routine activation.

`sourceEventSchema` has id/source/accountId/kind/subjectReference/evidenceRef/occurredAt.
Kinds: external_reply, webhook, file_arrival, provider_completion, capability_available.
An upstream authenticated resolver must bind a registered dependency and exact current
Goal/Task generations; a second SignalPort check verifies the retained receipt.
`occurredAt` does not advance the trusted scheduler clock. The adapter updates the
matched dependency; eligibility owns continuation. Wrong, stale, duplicate, paused and
cancelled cases are exercised. Real webhook signatures, source account grants and
provider completion receipts must be bound by their existing infrastructure at activation.

## Memory, learning and human intervention

`goalMemoryRequest` requires a canonical personal Work binding with matching owner.
It describes `EngineeringKnowledgeStore.list(workId, {limit:10,includeHistory:false})`
and `LearningStore.retrieve(workId, workType, contextRef)` from the pinned candidate.
These stores already resolve Work scope. Goal text/dependency evidence are context,
never scope credentials. Responses remain ADVISORY_ONLY. No Memory persistence or
broader retrieval API is added; no live retrieval is claimed.

`goalLearningReferences` exposes Goal/Task outcomes, Result IDs, owner feedback event
references, plan versions/reasons and intervention counts as EVIDENCE_ONLY. An owner
feedback fixture passes the actual governed `feedbackInput` schema. Goal completion
itself does not submit feedback or promote learning.

Owner commands and accepted Inbox choices append `HUMAN_INTERVENTION` in the same
transaction as the action, with NECESSARY_JUDGMENT and the action type. Query-only page
reads and replay deliveries add none. The golden journey records initial instruction
plus one choice = 2 necessary, 0 avoidable. Automatic planning, event receipt, Work
continuation and restart need no human command. The event projection also counts
AVOIDABLE_COORDINATION events if supplied by a future conversational boundary; no
conversational prompt recorder is installed here. Zero is a measured fixture property,
not a claim of production coordination telemetry or automatic intent classification.

## Integration conflicts and activation order

Likely conflicts: root README and executor inventory; `lib/goals.ts`/legacy Goal tools
and `/api/goals` cutover; canonical Work creation/binding/Result stores; shared migration
head and role policies; Inbox source registration/delivery; Beta owner data/projection/
experience and Goal-detail types; scheduler occurrence handlers and authenticated source
receipt correlation. Memory/learning store ownership remains unchanged.

New modules stay under `lib/goal-work`, tests under `test/goal-work*`, schema candidates
under `goal-work-activation`. Reconcile manifest entries by file hash; never overwrite
sibling classifications. Integrate persistence and canonical Work gateway first, then
Inbox/host adapters, then Beta consumption and authenticated real browser journey.
[Activation package](../apps/eve/goal-work-activation/README.md) supplies exact order,
registration dependencies, migration limits and reusable acceptance instructions.
