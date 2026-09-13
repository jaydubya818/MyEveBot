---
status: complete
priority: p1
issue_id: "005"
tags: [outcomes, goals, reviews, risk, notifications, postgres, eve, ui]
dependencies: ["004"]
---

# Ship the Outcomes, Daily Brief, and Weekly Review loop

## Problem Statement

Goal OS records intent and execution state, but it cannot yet say whether completed work was effective, surface a canonical daily operating view, or identify stalled and at-risk goals without reconstructing conversation history.

## Findings

- Goal, Task, QA Run, Evidence, and immutable Event records already provide the canonical inputs.
- Focus already provides deterministic ranking and concise `whyNow` reasons.
- Outcomes need their own owner-scoped record because execution completion and real-world effectiveness are different facts.
- Briefs, reviews, and risk signals can begin as deterministic read models; a parallel execution runtime is unnecessary.
- Existing web push is delivery infrastructure, but Phase 2 only needs a small delivery classification contract.

## Proposed Solutions

### Option 1: Extend Goal OS with one Outcome record and deterministic projections

**Approach:** Persist Outcomes and review checkpoints, add delivery classification to shared events, and compute briefs/reviews/risk from existing canonical records.

**Pros:** Reuses current primitives, stays explainable, supports agent/UI parity, and creates a clean seam for later scheduling.

**Cons:** Requires coordinated schema, repository, API, tool, UI, and qualification work.

**Effort:** Large vertical slice.

**Risk:** Medium.

### Option 2: Generate narrative digests from chat history

**Approach:** Ask the model to reconstruct progress and recommendations from conversations.

**Pros:** Smaller initial schema change.

**Cons:** Non-canonical, difficult to test, weakly auditable, and prone to missing or inventing state.

**Effort:** Medium.

**Risk:** High.

## Recommended Action

Implement Option 1. Keep manual brief/review generation first, compute risk with explicit rules, and defer schedules, preferences, persistent agents, workspace, routines, and learning mutations.

## Technical Details

- Add migration `0006_outcomes_and_review_loop.sql`.
- Add owner-scoped Outcome persistence linked to Goal, Task, Run, and evidence references.
- Add deterministic stalled/deadline/dependency/capability risk analysis.
- Add Daily Brief and Weekly Review read models plus persisted generation checkpoints.
- Add `silent | activity | digest | push | urgent` delivery classification without a settings subsystem.
- Add authenticated APIs, Eve tools, builder manifest ownership, and a first-class Review UI.

## Acceptance Criteria

- [x] Outcomes support all approved result and owner-feedback states.
- [x] Outcomes link to Goal, Task, Run, and Evidence where supplied and remain owner scoped.
- [x] Daily Brief uses canonical persisted state and every recommendation includes `whyNow`.
- [x] Weekly Review reports progress, completions, stalls, blockers, commitments, outcomes, and proposed priorities without mutating preferences or skills.
- [x] Risk detection is deterministic and avoids treating inactive long-horizon goals as stalled by default.
- [x] Shared delivery classification and review checkpoints are minimal and reusable.
- [x] Agent tools and web UI use the same repositories.
- [x] Builder/update pruning remains complete and owner/agent display names remain configurable.
- [x] Unit, integration, browser, migration, typecheck, build, dependency, and diff gates pass.
- [x] A fresh branch Preview passes identity/navigation and Phase 2 critical-path qualification.

## Work Log

### 2026-09-12 - Baseline accepted and Phase 2 designed

**By:** Codex

**Actions:**
- Created `feat/outcomes-daily-weekly-loop` from baseline `4c72fe4ddaf6f870d2733ee183f237ae5c2988a6`.
- Audited Goal OS, QA Run/Evidence, Focus, events, proactive delivery, builder, and Eve schedule patterns.
- Selected the single-Outcome-record plus deterministic-read-model approach.

**Learnings:**
- No new execution model is required.
- Scheduled delivery should remain deferred until manual generation, canonical state coverage, and timezone/dedup semantics are proven.

### 2026-09-13 - Phase 2 implemented and qualified locally

**By:** Codex

**Actions:**
- Added migration 0006, owner-scoped Outcome persistence, review checkpoints, and event delivery classification.
- Added deterministic Daily Brief, Weekly Review, stalled-work, deadline, dependency, and capability risk projections.
- Added shared authenticated APIs, Eve tools/instructions, builder ownership, and the first-class `/review` UI.
- Passed 42 unit tests, database integration tests, migration validation, typecheck, manifest/capability checks, production build, dependency audit, and desktop/mobile browser checks.

**Learnings:**
- An explicit blocked goal must surface even when it has no tasks.
- Local identity and navigation remain coherent: the configured agent name appears in the shared shell and Review is directly reachable beside Goals and Manage.

### 2026-09-13 - Fresh preview qualified

**By:** Codex

**Actions:**
- Deployed fresh preview `dpl_98d7c7ASzwCgQYxXBnsLbKR5aFs3` with disposable deployment-scoped auth; saved project environment was not changed.
- Confirmed authenticated owner-session mode and HTTP 200 for Home, Goals, Review, Manage, Daily Brief, Weekly Review, Outcomes, and manual generation.
- Confirmed the configured `Sofie` document identity is consistent on every navigation route; the login UI identifies the owner as `Jay` and agent as `Sofie`.

**Learnings:**
- The project has Database/Blob preview configuration but no saved preview web-auth variables, so ordinary previews fail closed until auth is supplied by the deployment workflow.
- Vercel team deployment protection remains enabled; authenticated CLI/browser context is required before the app's own owner session can be exercised.

### 2026-09-13 - Final integrity hardening

**By:** Codex

**Actions:**
- Added agent parity for explicit owner feedback and required replay-safe outcome idempotency keys.
- Replaced per-goal review loading with bounded owner-scoped batch queries.
- Tightened outcome lineage, evidence, timestamp, and duplicate-feedback validation.
- Requalified Daily and Weekly Review states, checkpoint confirmation, build, typecheck, migrations, and database integration behavior.

**Learnings:**
- Review generation needs bounded bulk reads; otherwise a large goal set creates avoidable query fan-out.

## Notes

- Explicitly excluded: persistent user-created agents, scoped memory, Workspace, Routines, autonomous learning/preferences, and skill mutation.
