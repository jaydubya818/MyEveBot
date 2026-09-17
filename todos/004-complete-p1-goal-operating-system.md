---
status: complete
priority: p1
issue_id: "004"
tags: [goals, capabilities, events, postgres, eve, ui]
dependencies: ["002"]
---

# Ship Goal Operating System V1

## Problem Statement

The personal agent could remember facts and execute audited QA work, but owner intent was trapped in conversations. There was no durable goal, milestone, or general task model that could identify what matters now, show progress, resume work, or connect outcomes back to the owner's objectives.

## Findings

- The owner approved Goal OS as the next product slice and required architecture documentation before large implementation.
- Existing capability status, task-run evidence, ordered migrations, owner auth, and activity UI are reusable foundations.
- The current task ledger is deliberately QA-specific and should be linked to, not silently repurposed as, the general goal model.
- Governed learning is sequenced after Goal OS; autonomous skill or policy mutation is explicitly out of scope.

## Proposed Solutions

### Option 1: Extend the existing platform with shared goal/event primitives

**Approach:** Add an owner-scoped Goal OS model and a bounded capability registry, then relate existing and future runs through stable references.

**Pros:** Preserves working QA execution, creates agent/UI parity, and supports later outcomes and learning.

**Cons:** Requires coordinated migration, APIs, agent tools, UI, and tests.

**Effort:** Large vertical slice.

**Risk:** Medium.

### Option 2: Rebrand the QA task ledger as Goals

**Approach:** Reuse current QA tables directly for all goals and tasks.

**Pros:** Less initial schema work.

**Cons:** Couples everyday goals to specialist/evidence invariants and creates confusing lifecycle semantics.

**Effort:** Medium.

**Risk:** High.

## Recommended Action

Implement Option 1. First document and reconcile the architecture, then ship the minimum Capability Registry and Goal OS V1 vertical slice: goals, optional milestones, tasks, dependencies, deterministic focus ranking, events, owner-scoped APIs, agent tools, UI parity, activity linkage, and qualification.

## Technical Details

**Affected areas:**

- `docs/personal-agent-platform/` — current and target architecture.
- `apps/eve/migrations/` — additive Goal OS and event schema.
- `apps/eve/lib/` — capability registry, goal repository, transitions, progress, focus ranking, events.
- `apps/eve/app/api/` — owner-scoped Goal OS endpoints.
- `apps/eve/agent/tools/` — complete Goal OS agent capability.
- `apps/eve/app/goals/` and focused components — Goals and Focus UI.
- `apps/eve/components/task-runs-panel.tsx` — goal/activity relationships.
- `apps/builder/lib/manifest.ts` — deployable tool registration.
- `apps/eve/test/` — contracts, transitions, ranking, API, migration, and parity tests.

## Acceptance Criteria

- [x] Eight architecture documents classify existing systems and establish the MyEve/Sofie/Relay identity hierarchy.
- [x] Capability registry supports goal-planning discovery without advertising unavailable features.
- [x] Ordered additive migrations create owner-scoped goals, milestones, tasks, dependencies, relationships, and events.
- [x] The owner and deployed personal agent both have complete goal, milestone, and task management capability.
- [x] Goal progress and next action are deterministic and explainable.
- [x] `/goals` provides Focus, Active, Waiting, Blocked, Completed, and Archived views plus goal detail.
- [x] Goal state and events connect to existing Activity/task runs without creating a second execution engine.
- [x] The persistent goal creation/dependency/Focus golden path is covered end to end through chat and UI.
- [x] Migration check, clean/upgrade migration tests, unit/integration tests, typecheck, build, and local browser qualification pass.
- [x] Documentation and builder manifest are updated.
- [x] Fresh isolated-Preview qualification passes before promotion.

## Work Log

### 2026-09-12 - Approved specification and architecture audit started

**By:** Codex

**Actions:**

- Read the Personal Agent Platform plan and Goal OS/Governed Learning amendment completely.
- Selected the shared-primitives approach and began repository architecture mapping on the existing feature branch.

**Learnings:**

- Capability status already exists but is section-oriented rather than a complete planning registry.
- The QA task ledger contains valuable run/evidence primitives, but its fixed-specialist completion contract must remain isolated.

### 2026-09-12 - Architecture gate completed

**By:** Codex

**Actions:**

- Created the seven required architecture documents under `docs/personal-agent-platform/`.
- Defined additive Goal OS records, deterministic Focus ranking, shared event semantics, capability discovery, security boundaries, and the QA-run linkage strategy.

**Learnings:**

- Next Action should remain derived state so tasks and dependencies stay the single source of truth.
- Goal mutations and event emission must share one transaction; events are facts, not a second command system.

### 2026-09-12 - Goal OS implementation and local qualification completed

**By:** Codex

**Actions:**

- Added owner-scoped Goal, plan, milestone, task, dependency, thread-link, event, and QA-run linkage persistence in migration 0003.
- Added deterministic progress/Focus logic, authenticated APIs, seven agent tools, dynamic Goal instructions, Goals UI, shell/command navigation, and Activity links.
- Added the `goals` builder feature, capability definitions, pruning ownership, and template release 24.
- Qualified 27 unit contracts, a real Neon lifecycle test, clean/repeat migration application, repository typecheck, production build, desktop/mobile browser flows, and a current-build chat-to-Goal tool loop.
- Removed the exact UI, agent, database, thread, and disposable Postgres qualification fixtures.

**Learnings:**

- Neon's date-only results require explicit normalization rather than timestamp parsing.
- Eve tool schemas must expose a root object to the Anthropic Gateway; action variants belong behind explicit runtime validation.
- Display names are configuration, not authority. MyEve now uses generic auth identities with legacy Sofie compatibility.
- The migration runner is Neon-specific; clean ordinary-Postgres testing currently uses the same SQL through `psql`.

### 2026-09-12 - Multi-owner/multi-agent design invariant added

**By:** Codex

**Actions:**

- Defined MyEve as the platform, Sofie as the reference/default agent, and Relay as the shared governed capability layer.
- Preserved single-owner-per-deployment as the V1 security default while removing literal agent/owner names from auth, QA assertions, tools, and owner action reasons.
- Added configurable builder identity coverage and documented the deferred persisted agent/grant model without introducing a speculative second runtime.

## Notes

- Out of scope for this release: Universal Inbox, Slack, SMS, Voice, knowledge-graph visualization, full multi-agent orchestration, and autonomous skill mutation.
- The code is a locally qualified release candidate. Keep this todo open until a fresh isolated Preview replaces the historical NO-GO evidence.
- Do not expose chain-of-thought; explain focus and recommendations using concise stored decision evidence.

### 2026-09-17 - Superseded Preview gate reconciled

**By:** Codex

**Actions:**

- Closed the stale Preview gate using work order 008's merged-main production qualification, including authenticated chat, Goal-linked Runs, Results, and Computer evidence.
- Preserved the work order as history and moved current priorities to `docs/roadmap.md`.

**Learnings:**

- Historical release gates must be reconciled after a later, stronger production gate or they become false backlog signals.
