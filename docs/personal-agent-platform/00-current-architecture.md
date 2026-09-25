# Current architecture

## Scope

This audit reflects `apps/eve` and `apps/builder` on 2026-09-12. Sofie is a single-owner Next.js application with an Eve agent mounted on the same origin. Neon holds application records, Vercel Blob holds durable private artifacts, and optional providers add memory and connected-app capability.

## Runtime map

| Area | Current implementation | Assessment |
| --- | --- | --- |
| Agent runtime | Filesystem-authored Eve agent under `apps/eve/agent`; tools, instructions, schedules, channels, hooks, subagents, and sandbox are auto-discovered. | REUSE |
| Web experience | `app/chat.tsx` owns chat, thread sidebar, model controls, command palette, and Manage switching. | EXTEND, then extract incrementally |
| Owner boundary | Signed seven-day `sofie_session`, same-origin mutation checks, fail-closed production configuration, and matching Eve channel auth. | REUSE |
| Database | Ordered checksum-protected SQL migrations with Neon serverless access. | REUSE; remove remaining runtime DDL gradually |
| Conversation storage | `web_chat_threads` stores metadata and the Eve event snapshot as JSONB. | EXTEND; older rows are implicitly single-owner |
| Automations | Neon reminders/webhooks, lease-based reminder claiming, run history, and proactive Eve delivery. | REUSE; later emit shared events |
| Memory | Supermemory profile/search/list/delete with a short SWR cache. | REUSE as memory; do not treat provider memories as approved preferences |
| Skills | Authored skills on disk plus user-created skills in a private Blob JSON document. | REUSE; versioning is V1.2 work |
| Browser/computer | Vercel Sandbox plus preinstalled agent-browser extension and tools. | REUSE |
| Finance | Receipt tools and integer-cent Neon storage. | REUSE |
| Connected apps | One Composio MCP connection with dynamic app/tool discovery. | REUSE |
| QA delegation | `task_runs` and related tables enforce exactly three specialists, evidence, lifecycle rules, and Balanced limits. | REUSE as a specialized execution adapter |
| Capability status | Eight UI-oriented statuses derived from builder feature flags and environment presence. | EXTEND into a planning registry |
| Readiness | Provider probes and setup guidance for auth, AI, database, memory, connections, and Blob. | REUSE; feed health into registry |
| Builder | Deterministic template assembly, feature pruning, env provisioning, monotonic release, update preservation, and manifest completeness. | REUSE |
| Tests/CI | Node contract tests, migration validation, manifest validation, typecheck, and production builds. | EXTEND with Goal OS integration/browser coverage |

## Current persistence

- `web_chat_threads`: thread metadata and event snapshot.
- `reminders`, `webhooks`, `automation_runs`: proactive scheduling and delivery history.
- `push_subscriptions`: browser push targets.
- `receipts`: finance records.
- `task_runs` plus sessions, specialists, acceptance checks, artifacts, milestones, approvals, and transitions: the fixed product-QA contract.
- `sofie_schema_migrations`: ordered migration ledger with checksums.

Large QA artifacts and runtime-created skills use private Vercel Blob storage. Supermemory remains a separate provider-owned store.

## Important constraints

1. `task_runs` is not a general task table. Its `kind`, specialist count, guardrails, and evidence completion gate encode the QA pilot.
2. Legacy thread, reminder, webhook, receipt, and automation tables predate explicit `owner_id`. The product is currently single-owner, but new tables must scope every query by owner. Owner Data marks routine/webhook and Finance exports as `single_owner_legacy`; they must not be represented as row-level multi-owner safe until their repositories are migrated.
3. Several legacy repositories still create or alter tables at runtime. New Goal OS code must depend only on checked-in migrations.
4. `lib/capabilities.ts` reports section availability; it does not describe individual tools, permissions, risk, evidence, or dependencies.
5. There is no shared event ledger. Automation runs and QA milestones are useful source records but cannot power a unified activity stream alone.
6. `chat.tsx` and `manage-panel.tsx` are already large. Goal UI belongs in focused components, mounted by the shared shell rather than embedded in Manage.

## Reuse and change classification

| Concern | Classification | Decision |
| --- | --- | --- |
| Eve sessions, tools, schedules, hooks | REUSE | Keep Eve as the execution runtime. |
| Owner auth and API guards | REUSE | Apply the same guard to all Goal APIs. |
| Ordered migrations | REUSE | Add an additive `0003` migration. |
| QA evidence and artifacts | REUSE | Link existing runs to goals/tasks; do not weaken their rules. |
| Capability status | EXTEND | Preserve existing callers while adding a richer registry. |
| Activity UI | EXTEND | Add goal events and related-goal links. |
| Thread storage | EXTEND | Add goal/thread relationships without rewriting chat persistence. |
| Existing QA task vocabulary | MIGRATE gradually | Treat as a specialized run adapter; converge on shared execution contracts later. |
| Runtime DDL | MIGRATE gradually | Do not add more; remove as affected repositories are touched. |
| Goal, milestone, plan, general task, dependency, event models | NEW | Owner-scoped platform primitives. |
| Universal Inbox, autonomous learning, groups | NEW later | Explicitly outside Goal OS V1. |

## Audit conclusion

The repository already has strong runtime, persistence, authentication, evidence, and deployment foundations. Goal OS should be an additive domain with narrow links to conversations, capabilities, and QA runs. A rewrite would add risk without creating user value.
