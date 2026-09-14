# Outcomes and review loop

## Scope

Phase 2 closes the loop between work performed and whether it helped. It adds Outcomes, Daily Brief, Weekly Review, deterministic stalled/risk detection, a minimal notification classification, and only the checkpoint state required to resume future delivery safely.

It does not add user-created agents, scoped memory, Workspace, Routines, autonomous learning, skill mutation, or scheduled review delivery.

## Canonical flow

```text
Goal → Task → Run → Evidence
  └───────────────→ Outcome
Persisted Goal state + Outcomes → deterministic analysis → Daily Brief / Weekly Review
                                                └──────→ Review checkpoint
```

An Outcome is an observation over the existing execution graph, not a second execution system. A successful Run proves that execution completed according to its contract; it does not prove the result was effective. Outcome status and owner feedback therefore remain explicit, separate fields.

## Outcome contract

An Outcome links to a Goal or Run and may additionally link to a Goal Task and existing evidence. The repository validates every supplied link against the same owner before writing it. Supported status values are:

- `successful`
- `partially_successful`
- `blocked`
- `failed`
- `abandoned`
- `ineffective`
- `unknown`

Owner feedback is one of `helpful`, `neutral`, `unhelpful`, or `unknown`. Agent-created outcomes default to `unknown`; agent instructions prohibit inferring it. The Review UI and `update_outcome_feedback` tool both use the same owner-scoped repository, so Sofie can apply only feedback the owner states directly.

## Deterministic review rules

Daily and weekly reviews load Goals, Tasks, events, capabilities, Runs, Evidence links, and Outcomes from owner-scoped persisted repositories. They do not reconstruct state from chat history.

Focus uses the existing deterministic ranker. All recommendations retain at least one concise `whyNow` reason. Risk signals are explicit:

- deadline approaching (goal within seven days; task within three)
- deadline overdue
- explicitly blocked goals or tasks
- failed tasks awaiting recovery
- unfinished critical task
- incomplete dependency when the dependent work is current, urgent, or high priority
- unavailable required capability
- no recent progress after fourteen days only when work is actively expected

The active-work requirement prevents ordinary, long-horizon goals from being labeled stalled solely because they have not changed recently. An explicitly blocked goal is still surfaced.

## Notification and resume foundation

Every event now has one internal delivery classification: `silent`, `activity`, `digest`, `push`, or `urgent`. Existing events default to `activity`. This is classification only; it is not a user-facing notification settings system.

Manual brief/review generation upserts an owner-and-kind checkpoint with its period and the latest observed event cursor. This supplies the minimum idempotency/resume seam for a future scheduler. Scheduled delivery is deferred until timezone, cadence, quiet-hour, and duplicate-delivery policy are explicit and tested.

## Distribution

The Outcome and review tools belong to the existing `goals` builder feature. Models and persistence remain owner-generic. Template release 25 allows existing generated deployments to receive the slice through the current update path.
