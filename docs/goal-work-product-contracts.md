# Goal Work product contracts (version 1)

`GoalWorkQueries(ownerId, database)` is a server-only projection service. Consumers
must obtain `ownerId` from authenticated server context. No infrastructure logs are
needed to render the default owner experience. This does not replace the existing
Goal UI until candidate schema and runtime adapters are integrated.

| Method | Contract |
| --- | --- |
| `goal(goalId)` | Objective, criteria, status, priority, target, outcome/task counts, blockers, plan/history, tasks, current Work, Needs You, Results, next action, useful history, explicit truncation |
| `task(goalId, taskId)` | Objective, criteria, status/control, dependencies, waiting categories, owner/agent, due time, current Work, Result/evidence, blocker, next action and history |
| `today(afterGoalId, pageSize)` | Goals, admission candidates, Work in progress, waiting/blocked tasks, Needs You, recent completions and next Goal cursor |
| `brief(since, until, cursor)` | Fixed time window, ordered changes, progress changes, completions, Results, new blockers, newly eligible tasks, current Today page/Needs You, upcoming scheduled dependencies and cursor |
| `attentionSnapshot(goalId)` | Owner, Goal, durable revision and current bounded decision items |

`eligibleForAdmission` means dependencies permit an admission check; it does **not**
mean authority or budget has been granted. `currentWork` and Result/evidence references
are links for drill-down. Optional operator views may expose correlation and generations;
owner surfaces should show meaningful outcomes, waiting reason and next action.

Progress separates `completedOutcomes / requiredOutcomes` from Task counts and blocker
count. It deliberately has no percent field. A Task list reaching 100% is not Goal
success. Historical completed outcomes are kept but only the current Goal generation's
evidence counts toward completion.

## Bounds and cursor rules

- Today: default ten Goals, maximum twenty, ordered by Goal ID with explicit cursor.
- Goal detail: fifty Tasks, 1,000 typed dependencies and 100 continuation records;
  candidate writes enforce fifty Tasks, twenty dependencies per Task, 100 intents.
- History: newest 100 events and twenty plan revisions. This is a recent window;
  full audit export is a future operator contract, not silently deleted history.
- Brief: 200 changes per page, 100 upcoming schedule items, seven-day lookahead.
  Keep `since` and `until` fixed while paging. Retain timestamp microsecond precision
  in the `(occurred_at, id)` cursor; converting it to a JavaScript Date loses progress.
- `current.nextCursor` in Brief is independent from its event cursor. Consumers must
  page current Goals to obtain all current Needs You items.
- Empty lists are valid; inaccessible/missing Goal/Task throws “not found.” Views do
  not turn unavailable adapters or unverified output into successful states.

Live host authentication, final UI integration, browser journey, notification delivery,
provider semantics and production-scale query tuning remain integration qualifications.
