# Goal OS: outcomes, tasks and Work

> **Integration status superseded-by:** [integration-preparation crosswalk](goal-work-integration-crosswalk.md) and [current evidence](verification/goals-proactive-work/integration-preparation/README.md). The core contract below remains historical context.

Status: locally qualified orchestration candidate. **Not enabled for design partners.**
The current UI and agent tools still use the existing Goal repository. The new service
is server-only, unregistered, and requires the candidate schema and canonical adapters.
See [qualification and integration blockers](verification/goals-proactive-work/README.md).

A **Goal** states an outcome and explicit success criteria. A **Plan** records the
current approach, its reason, and prior versions. A **Task** is a bounded actionable
outcome within a Goal. **Work** owns execution, route selection, authority, budgets,
cancellation and Results. A task requests Work; it never calls Factory or an executor.

The implementation extends `goals`, `goal_plans`, `goal_tasks`, the existing dependency
relationships and `eve_events`. It does not create another Goal database or Memory
system. Typed waiting dependencies, correlation records and outcome evidence are
additional Goal-owned state. Existing task dependencies remain respected. The legacy
UI does not yet render typed dependencies, pause state or these new projections.

`apps/eve/lib/goal-work/service.ts` provides:

- Goal/Task creation, owner revisions, deterministic eligibility and bounded Plans.
- Goal and Task pause/resume, Task cancellation, Goal reopen and archival.
- Exact dependency correlation for Task, external reply, file requirement, owner
  choice, schedule, provider capability and Work dependencies.
- Durable Task-to-Work correlation and canonical Result-to-Task completion.
- Owner-scoped meaningful progress: verified Goal outcomes and completed Tasks are
  separate counts. Activity does not count as outcome evidence.
- Bounded follow-ups with Goal/Plan/Result provenance, at most 50 tasks per Goal,
  Result depth 4, and 100 Work intents per Goal. These are conservative candidate
  limits; reaching them requires plan review, never an automatic budget increase.

Owner and agent principals are supplied by a **trusted authenticated server adapter**.
The `actor` and `ownerId` constructor parameters must never come from model arguments
or unverified request bodies. There is deliberately no public route/tool yet.

## Completion and current truth

Task completion requires a canonical, current, verified `SUCCEEDED` Result, matching
owner, Work correlation, Goal generation, Task generation, every Task criterion,
and nonempty evidence references. `PARTIAL`, `FAILED`, absent verification, stale
proof and incomplete criteria do not complete the Task. The Result is retained and
the current task is blocked for review. A retry requires a bounded explicit revision;
there is no autonomous infinite retry loop.

Goal completion additionally requires evidence for every explicit Goal criterion,
no unfinished Task and no unresolved Work intent. Finishing the current task list is
insufficient. Canonical Results may attest Goal criteria; an authenticated owner may
explicitly confirm an outcome with a decision reference. Agent text cannot provide
that owner confirmation. The candidate SQL fences legacy direct status updates too.

Reopening increments the Goal generation. Completion events and prior evidence remain
in history; old evidence does not silently satisfy the new generation. Revised Goal
objectives/criteria affect future Work; saved Work requests retain prior context.
Archival removes a Goal from active dispatch and preserves history. No destructive
Goal deletion or new retention policy is introduced. Linked Work prevents task deletion.

## Plans and owner control

Plans retain version, summary and reason. Supply a stable plan command ID to deduplicate replay; Goal/Task IDs also reject changed creation payloads. Agent-driven replanning must cite a retained
Result in that Goal. Result-driven task creation must cite a retained Result and use
the parent's depth plus one. New tasks do not inherit executor or provider authority.
The owner can cancel unnecessary tasks and create the newly required bounded step.

Pause is durable. Productive admission checks Goal and Task pause under the same Goal
row lock used for owner control. A pending Result can still be recorded while paused;
Goal completion and new productive Work wait until resume. Resume re-evaluates current
criteria, dependencies and canonical authority. Task cancellation stops new admission
and records linked Work state, reason and time; active Work cancellation remains a
canonical Work responsibility.

## Source inventory

| Existing area | Decision | Treatment |
| --- | --- | --- |
| Goals, tasks, plans, milestones | IMPROVE | Reuse existing tables; add orchestration service and candidate fences |
| Task dependencies | IMPROVE | Respect existing edges; typed exact-source dependencies add waiting semantics |
| Task Runs | REUSE | Existing execution history remains owned by Runs; no duplicate run model |
| Evidence and activity | IMPROVE | Reuse `eve_events`; consume canonical Results and retain references |
| Focus ranking | REUSE / IMPROVE | Keep existing UI ranking; candidate dispatch uses explicit priority/deadline, cursor fairness |
| Reminders and reviewed routines | REUSE | Reference-only idempotent adapter; original review, recurrence and timezone ownership remain |
| Schedules | IMPROVE | Callable bounded dispatcher and eligibility qualification; host wiring blocked |
| Webhooks / reply / file events | IMPROVE | Authenticated Signal port and exact requirement matching; provider wiring blocked |
| Task-to-Work correlation | MISSING → candidate implemented | Prepared intent + persistent canonical key |
| Proactive continuation / recovery | MISSING → candidate qualified | Real PostgreSQL, duplicate delivery and SIGKILL fixtures |
| Canonical Work / Result | DEFER integration | Unmerged Digital Worker owns execution and verification |
| Universal Inbox | DEFER integration | Structural `myeve.attention.v1` adapter, no competing Inbox |
| Memory / Relay / learning | REUSE contracts / DEFER new internals | Work owns collaboration; references only, no new persistence or access |
| Product UI / Daily Brief presentation | DEFER | Beta Product Experience owns presentation; versioned query contracts supplied |

Detailed continuation behavior is in [proactive work](proactive-work.md). Product data
contracts are in [Today and Daily Brief](goal-work-product-contracts.md).
