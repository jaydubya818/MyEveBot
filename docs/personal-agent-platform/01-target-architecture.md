# Target architecture

## Product boundary

MyEve is the deployable personal-agent platform. Sofie is its reference/default agent instance. Relay is the internal governed capability layer that one or more authorized agents may share. A deployment serves one owner by default, but code and data do not assume the owner is Jay or the only agent is Sofie. The complete identity and tenancy rules are normative in [Product identity and tenancy](./07-product-identity-and-tenancy.md).

A personal agent accepts owner intent through chat or UI, turns durable objectives into goals and executable tasks, chooses only available and authorized capabilities, records observable progress, and preserves owner authority. The product loop is:

`Intent → Context → Goal → Plan → Task → Capability selection → Run → Evidence → Outcome → Governed learning`

Goal OS V1 implements through capability selection and observable goal activity. Outcomes and governed learning build on the same records in later releases.

## Layers

1. **Experience** — Chat, Goals/Focus, Activity, and Manage.
2. **Personal agent** — Sofie or an owner-created primary agent performing intent recognition, proportionate planning, task selection, and concise rationale.
3. **Relay capability registry** — definitions plus runtime availability for tools, integrations, channels, storage, models, specialists, and platform services. Availability is distinct from future principal authorization.
4. **Goal domain** — goals, versioned plans, optional milestones, tasks, dependencies, progress, next action, and relationships.
5. **Execution adapters** — Eve sessions and the existing QA task ledger. Adapters link back to a Goal task without redefining Goal state.
6. **Shared events** — immutable, owner-scoped facts used by timelines, Activity, future Daily Briefs, and audit.
7. **Infrastructure** — Neon, Blob, Supermemory, Composio, Vercel, and sandbox providers.

Dependencies point downward. UI and agent tools call the same goal repository. Provider adapters do not own goal state.

## Core boundaries

- Conversation is an interface, not the source of truth for a goal.
- A Goal represents an owner outcome; a Task represents concrete work.
- A Milestone is optional grouping and never required for a small goal.
- A Plan is immutable by version. Replanning creates a new version.
- Next Action is computed from tasks and dependencies, not stored as a competing entity.
- A Run records execution. The current QA run remains specialized and may link to a Goal task.
- An Event is an immutable fact. It is not a command queue or a mutable status record.
- Memory, observations, approved preferences, and active skills remain different concepts.

## Goal OS V1 request flow

1. The owner expresses durable intent in chat or selects Create goal.
2. Their primary agent creates a Goal and, when useful, a plan, milestones, and tasks using atomic tools.
3. The repository writes the state mutation and a matching event in one database transaction.
4. `/goals` reads the same owner-scoped records and shows Focus or a goal detail.
5. Focus ranking selects the highest-value unblocked task using deterministic inputs and returns a concise `whyNow` explanation.
6. Completing a task recalculates derived progress; completing a goal remains an explicit decision after success criteria are satisfied.
7. Existing QA runs can be associated with a Goal task and continue appearing in Activity with their original evidence contract intact.

## Planning modes

| Mode | Use | Persistence |
| --- | --- | --- |
| instant | One action such as a reminder | No Goal by default |
| simple | Short outcome with a few tasks | Goal and tasks |
| structured | Multi-area objective | Goal, versioned plan, optional milestones, tasks |
| complex | Long-running work with dependencies and governed execution | Same primitives plus later specialists, approvals, budgets, and workspace |

Planning complexity is an agent judgment informed by the objective; the storage model does not fork by mode.

## Compatibility strategy

- Existing deployments keep working when Goals is excluded.
- Existing `/api/capabilities` status consumers retain their response shape while gaining registry detail.
- Builder feature pruning removes Goal agent tools when Goals is disabled.
- Database changes are additive and preserve existing rows.
- No current thread, reminder, webhook, receipt, or QA lifecycle is rewritten for V1.

## Architecture checks

- UI/agent parity: both use the same repository operations.
- Atomicity: state and event writes share a transaction.
- Idempotency: creation accepts a stable client/request key where an external retry is plausible.
- Explainability: priority decisions expose stored facts, never chain-of-thought.
- Authority: high-impact execution remains outside Goal CRUD and routes through later approval policy.
- Bounded scope: Inbox, full autonomous execution, workspace, and learning application are not prerequisites for Goal OS V1.
- Identity neutrality: names are display configuration; authorization uses stable owner/principal identifiers.
- Multi-agent seam: all future agents reuse Relay and the canonical Goal-to-Outcome execution model.
