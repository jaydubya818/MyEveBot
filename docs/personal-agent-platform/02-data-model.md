# Data model

## Migration strategy

Goal OS uses an additive ordered migration after `0002_trustworthy_delegation.sql`. New repositories never mutate schema at runtime. All owner-facing queries include `owner_id`, common list paths have supporting indexes, and destructive cascades are limited to records wholly owned by the parent Goal.

`owner_id` is a tenancy and authorization partition, not an agent identifier. A Goal belongs to its owner and may later involve multiple agent principals. V1 does not add speculative agent tables, but no schema may encode the literal reference identities Sofie or Jay. See [Product identity and tenancy](./07-product-identity-and-tenancy.md).

## Canonical records

### `goals`

- `id text` — generated `goal_…` identifier.
- `owner_id text` — required authorization partition.
- `title`, `description`, `motivation`.
- `status` — `draft | active | paused | blocked | waiting | completed | abandoned | archived`.
- `priority` — `low | normal | high | critical`.
- `planning_mode` — `instant | simple | structured | complex` (Goals normally use simple or above).
- `success_criteria jsonb` — ordered strings for V1.
- `target_date date`, `started_at`, `completed_at`, `archived_at`.
- `source`, `source_reference`, optional future `workspace_id`.
- `created_at`, `updated_at`.
- Optional `idempotency_key`, unique within an owner.

### `goal_plans`

- `id`, `goal_id`, `version`, `status`, `summary`, `strategy`.
- `created_at`, `superseded_at`.
- Unique `(goal_id, version)`.

Updating a plan creates a new row and marks the previous active version superseded.

### `goal_milestones`

- `id`, `goal_id`, `title`, `description`.
- `status` — `pending | in_progress | completed | skipped`.
- `target_date`, `completed_at`, `position`, `success_criteria`, timestamps.

Milestones are optional and ordered. Deleting one sets its tasks' `milestone_id` to null.

### `goal_tasks`

- `id`, `goal_id`, optional `milestone_id`, optional `parent_task_id`.
- `title`, `description`.
- `status` — `todo | ready | in_progress | waiting | blocked | verification | completed | cancelled | failed`.
- `priority`, `due_at`, `assigned_to` (opaque future principal key; never a display-name authorization check).
- `required_capabilities jsonb`, `success_criteria jsonb`.
- `estimated_effort_minutes`, `estimated_cost_usd`.
- `position`, `started_at`, `completed_at`, `created_at`, `updated_at`.

### `goal_task_dependencies`

- `task_id`, `depends_on_task_id`, `created_at`.
- Composite primary key.
- Database check prevents self-dependency; repository validation prevents cross-goal links and graph cycles.

### `goal_thread_links`

- `goal_id`, `thread_id`, `owner_id`, `created_at`.
- Composite primary key.

The owner column makes relationship queries fail closed even while legacy thread storage remains single-owner.

### `eve_events`

- `id`, `owner_id`, `type`, `source_type`, optional `source_id`.
- Optional `goal_id`, `goal_task_id`, `run_id`.
- `severity` — `info | attention | warning | critical`.
- `summary`, `rationale jsonb`, `payload jsonb`, `occurred_at`.
- Optional `idempotency_key`, unique per owner when present.

Payloads contain bounded metadata, not secrets, raw messages, or hidden reasoning.

Future principal attribution should add stable initiator/executor references to runs and events without changing Goal ownership. Agent grants and external account bindings belong to Relay, not to Goal tables.

## Existing execution linkage

`task_runs` receives nullable `goal_id` and `goal_task_id` foreign keys. It remains the product-QA run adapter with its current status and evidence invariants. Goal OS does not introduce a second executable runtime in V1; general `Run`, `Action`, and `Outcome` records arrive when non-QA autonomous execution is implemented.

## Derived values

- Goal progress = completed non-cancelled tasks divided by all non-cancelled tasks. A goal with no tasks reports 0% unless completed, when it reports 100%.
- Milestone progress uses the same rule over its tasks.
- A task is executable when status is `todo` or `ready`, all dependencies are completed, and required capabilities are available.
- Next Action is the highest-ranked executable task. It is calculated, not persisted.

## Deletion and retention

- Goals use `abandoned` and `archived`; V1 has no hard-delete operation.
- Tasks and milestones may be deleted only before consequential run/evidence linkage exists; otherwise cancel or archive through the parent.
- Events are append-only and retained for audit. Later retention work may redact payloads without deleting the event identity.
- Existing Blob artifact deletion remains separate from metadata deletion.
