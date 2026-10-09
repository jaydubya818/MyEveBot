---
status: complete
priority: p1
issue_id: "008"
tags: [reliability, delegation, results, routines, agents, computer, eve, ui]
dependencies: []
---

# Ship Sofie's colleague-first Computer experience

## Problem Statement

Sofie has strong primitives but the complete promise is fragmented: production chat needs a hard release gate, delegated work needs general progress and recovery, artifacts need a Results home, successful jobs need promotion into routines, specialist handoffs need one accountable parent, and Computer work needs an end-to-end supervised path.

## Findings

- Agent Runs, QA task runs, Goal OS, outcomes, schedules, persistent Agents, Blob artifacts, and isolated Computer sessions already exist.
- The existing colleague-first plan correctly prioritizes reliable completion over more roles or channels, but several checkboxes predate shipped foundations and need implementation-grounded reconciliation.
- The runtime-budget incident proved that unit/build success alone is not an adequate production gate.

## Proposed Solutions

### Option 1: Extend the existing ledgers and tools

Use the current stores as the source of truth, add missing lifecycle/artifact/routine/delegation seams, and expose the same operations through UI and agent tools.

Pros: smallest robust architecture, preserves owner scoping and audit history. Cons: coordinated schema, API, tool, and UI changes. Risk: medium.

### Option 2: Add a new general workflow platform

Pros: clean-slate model. Cons: duplicates Eve and existing ledgers, creates split truth, and increases launch risk. Risk: high.

## Recommended Action

Implement Option 1 in six independently verified vertical slices, then run the complete production qualification and deploy from `main`.

## Acceptance Criteria

- [x] Production release gate exercises authenticated multi-turn chat, catalog discovery, Run lifecycle, and an isolated Computer smoke task.
- [x] Stale Runs reconcile safely and runtime failures expose an actionable retry path.
- [x] Multi-step work has an explicit outcome, accountable Agent, meaningful milestones, stop/retry/resume, and evidence-backed completion.
- [x] Results Desk lists durable artifacts with source Run/thread/Agent, review state, provenance, retention, and revoke/delete controls.
- [x] Verified work supports Run again, Save as skill, and Make routine; routines support test, pause, edit, history, and quiet no-change behavior.
- [x] Chief-of-staff delegation uses typed briefs, bounded specialist matching, inherited permissions, cycle/depth/time/cost limits, and one parent result.
- [x] Sofie can start, inspect, operate, stop, reconnect to, and recover isolated Computer sessions using browser, terminal, and files.
- [x] MFA, CAPTCHA, credentials, sensitive inputs, and consequential external actions pause for owner takeover or approval.
- [x] Every new UI action has agent capability parity and every agent write is reflected in the UI.
- [x] Loading, empty, error, blocked, approval, success, and recovery states are complete on desktop and mobile.
- [x] Unit, integration, migration, parity, typecheck, build, browser, and local agent E2E checks pass; production is covered by the final release gate below.
- [x] All changes are committed and merged to `main`, pushed, deployed to production, and post-deploy health is verified.

## Work Log

### 2026-09-14 - Product approval and architecture decision

**By:** Codex

**Actions:**

- Product Owner approved the full colleague-first sequence and required Computer capability.
- Selected extension of the existing shared ledgers over a new execution engine.
- Defined supervised, isolated Computer execution as the trust boundary.

**Learnings:**

- Existing shipped foundations reduce the task from six greenfield systems to integration and lifecycle completion.
- Production E2E must be a release requirement, not an optional post-deploy check.

### 2026-09-14 - Colleague workflow implementation

**By:** Codex

**Actions:**

- Added bounded general work contracts with parent/child lineage and evidence-backed completion.
- Added Results review, reuse, retention, and deletion controls with matching Agent tools.
- Added named routines with explicit approval boundaries and test/pause/resume/edit controls.
- Added Computer takeover, pause/resume, durable reconnect guidance, and terminal recovery.
- Corrected the task hook so general workers no longer collide with the fixed QA specialist contract.

**Verification:**

- 117 unit/source-contract tests pass.
- TypeScript compilation and ordered migration validation pass.

### 2026-09-14 - Pre-release qualification

**By:** Codex

**Actions:**

- Exercised authenticated multi-turn chat and complete Role/Solution Pack discovery against the running app.
- Ran a live Computer work contract that wrote and read a sandbox file, rejected an unsafe shell command, completed its result, and stopped cleanly.
- Reviewed Results and Computer activity on desktop and mobile, then corrected mobile navigation spacing and clarified Run linkage in the computer tool contract.

**Verification:**

- 117 unit tests and all 8 database integration tests pass.
- Full monorepo typecheck, 102-capability parity validation, 93 skill-routing checks, 13 ordered migrations, and the production Webpack build pass.

### 2026-09-14 - Production release completed

**By:** Codex

**Actions:**

- Merged the colleague-first workflow and follow-up Computer attribution fix into `main`, pushed the tracked repository, and deployed the linked Vercel production project.
- Ran authenticated multi-turn production chat, complete Role/Solution Pack discovery, a bounded work Run, and a real isolated Vercel Computer session.
- Verified the Computer wrote and read `/workspace/production-check.txt` with exact content `sofie-production-computer-ok`, completed its work Run, stopped cleanly, and appeared in Results and Computer activity with Agent/Run/thread attribution.

**Verification:**

- Production health reports ready and the canonical production alias serves the release.
- Production Computer session `computer_738e642c-5332-404f-8832-f9b1b615d3bd` completed two audited actions with no network domains and stopped.
- Production Result links Sofie, `task_670a79d7-6c0d-42ca-aafe-1ca9fae2519a`, and thread `40928874-ac0d-4f90-86d9-d9276e163f6d`.

## Post-Deploy Monitoring & Validation

- Monitor `turn.failed`, runtime/step/cost limit errors, stale running records, failed routine dispatches, specialist handoff failures, Computer orphan/timeout states, and artifact delivery errors.
- Healthy: multi-turn chat completes, every active Run advances or waits explicitly, Computer sessions terminate or expire cleanly, and accepted Results retain valid evidence.
- Rollback: cross-owner access, false completion, permission expansion through delegation, duplicate consequential action, or unrecoverable Computer orphan.
- Validation window: first 24 hours after production deployment; owner: application maintainer.
