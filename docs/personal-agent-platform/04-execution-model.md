# Execution model

## Canonical vocabulary

`Goal → Plan → Milestone → Task → Assignment → Run → Action → Evidence → Verification → Outcome`

Only the first four plus relationships and events are newly executable product scope in Goal OS V1. Eve remains the runtime for model turns, tools, schedules, and subagents.

## Existing adapter

The product-QA ledger is a specialized Run adapter:

- `task_runs` is the run envelope.
- `task_specialists` are assignments/executors.
- `task_acceptance_checks` are verification contracts.
- `task_artifacts` are evidence.
- `task_transitions` and `task_milestones` are audit facts.
- Eve session IDs connect durable runtime execution.

These records may link to a Goal and Goal task. Their fixed roster, retry, cost, duration, step, and evidence completion rules remain unchanged.

## Goal lifecycle

Legal transitions are explicit:

- `draft → active | abandoned | archived`
- `active → paused | blocked | waiting | completed | abandoned | archived`
- `paused → active | abandoned | archived`
- `blocked → active | waiting | abandoned | archived`
- `waiting → active | blocked | completed | abandoned | archived`
- `completed → archived`
- `abandoned → archived`
- `archived` is terminal in V1.

Task transitions similarly prevent silent resurrection of completed or cancelled work. Resume is an explicit action from paused/blocked/waiting states.

## Next Action and Focus

Candidate tasks must be executable. Ranking is deterministic in this order:

1. critical/high/normal/low priority;
2. overdue, then nearest due date;
3. active/in-progress work before ready/todo;
4. goal priority and target date;
5. oldest task update as a staleness tie-breaker;
6. stable ID tie-breaker.

The response includes concise rationale facts such as “due tomorrow,” “high-priority goal,” or “all dependencies complete.” It never stores chain-of-thought.

## Shared events

Every Goal OS mutation appends an `eve_events` row in the same transaction. Initial types include:

- `GOAL_CREATED`, `GOAL_UPDATED`, `GOAL_STATUS_CHANGED`;
- `PLAN_CREATED`;
- `MILESTONE_CREATED`, `MILESTONE_UPDATED`, `MILESTONE_DELETED`;
- `TASK_CREATED`, `TASK_UPDATED`, `TASK_STATUS_CHANGED`, `TASK_DELETED`;
- `TASK_DEPENDENCY_ADDED`, `TASK_DEPENDENCY_REMOVED`;
- `GOAL_THREAD_LINKED`, `RUN_LINKED`.

Later reminders, automation runs, approvals, messages, and outcomes migrate into the same contract incrementally.

## Failure and concurrency

- Invalid transitions return a conflict and emit no event.
- Cross-owner and cross-goal relationships behave as not found.
- Mutations use transactions and current-state predicates.
- Client retries use idempotency keys for creation and external event ingestion.
- Dependency cycles are rejected before commit.
- Consequential run actions remain governed by their adapter and future approval policy.
