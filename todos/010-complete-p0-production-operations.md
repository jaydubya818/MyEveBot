---
status: complete
priority: p0
issue_id: "010"
tags: [operations, reliability, observability, canary, production]
dependencies: ["009"]
---

# Add production monitoring, cleanup, canaries, and incident procedures

## Problem Statement

MyEve can pass an isolated release smoke test while later turns, Runs, Computer sessions, routines, or artifact delivery fail silently. The owner needs a small, privacy-safe operating surface and automatic cleanup before additional product scope is added.

## Recommended Action

Persist runtime failure signals into the existing event ledger, derive a compact Operations report from canonical product tables, run cleanup and alert evaluation every five minutes, expose that report in Manage → System, add production canaries for the five named flows, and check in a rollback/incident runbook.

## Acceptance Criteria

- [x] Failed turns, stuck Runs, orphaned Computer state, routine failures, model limits, and artifact failures are visible in one operator report.
- [x] Runtime hooks record sanitized failure signals without risking a second failure cascade.
- [x] Stale Computer sessions/actions and over-deadline Runs are cleaned automatically.
- [x] Optional alerts are deduplicated and contain no prompts, credentials, or artifact content.
- [x] Manage → System includes a compact operator dashboard with healthy, warning, and critical states.
- [x] Production canaries cover chat, browser, Goals, Results, and routines.
- [x] Rollback triggers and incident procedures are checked in.
- [x] Tests, typecheck, build, live canaries, and visual verification pass.

## Work Log

### 2026-09-17 - Implementation started

**By:** Codex

**Actions:**

- Reused the existing event ledger, canonical Run/session/delivery tables, Eve hooks, and Eve schedules instead of introducing a separate observability datastore.
- Scoped alerts to an optional private webhook with count-only payloads.

**Learnings:**

- Computer expiry already existed but only ran opportunistically on session reads; an operations schedule makes cleanup deterministic.

### 2026-09-17 - Completed

**By:** Codex

**Actions:**

- Added sanitized Eve hooks for turn/session, model-limit, and artifact failure signals.
- Added a five-minute monitor that expires Computer sessions, times out abandoned actions, fails over-deadline Runs, and evaluates alert delivery.
- Added an authenticated Operations API and a compact healthy/watch/act-now dashboard to Manage → System.
- Added deduplicated, count-only webhook alerts through `MYEVE_ALERT_WEBHOOK_URL`.
- Added core and browser production canaries covering chat, browser, Goals, Results, routines, and the operator API.
- Added the production incident and rollback runbook.

**Verification:**

- 124 Node tests and 315 Vitest tests passed.
- Operations database integration passed and removed its isolated fixtures.
- TypeScript, capability registry, skill routing, and the 70-route production build passed.
- The five-minute schedule executed successfully against the configured local database.
- The complete live canary suite passed all product surfaces and clean browser shutdown.
- The rendered operator dashboard was visually checked with all six signals healthy.
