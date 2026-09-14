---
status: ready
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

- [ ] Production release gate exercises authenticated multi-turn chat, catalog discovery, Run lifecycle, and an isolated Computer smoke task.
- [ ] Stale Runs reconcile safely and runtime failures expose an actionable retry path.
- [ ] Multi-step work has an explicit outcome, accountable Agent, meaningful milestones, stop/retry/resume, and evidence-backed completion.
- [ ] Results Desk lists durable artifacts with source Run/thread/Agent, review state, provenance, retention, and revoke/delete controls.
- [ ] Verified work supports Run again, Save as skill, and Make routine; routines support test, pause, edit, history, and quiet no-change behavior.
- [ ] Chief-of-staff delegation uses typed briefs, bounded specialist matching, inherited permissions, cycle/depth/time/cost limits, and one parent result.
- [ ] Sofie can start, inspect, operate, stop, reconnect to, and recover isolated Computer sessions using browser, terminal, and files.
- [ ] MFA, CAPTCHA, credentials, sensitive inputs, and consequential external actions pause for owner takeover or approval.
- [ ] Every new UI action has agent capability parity and every agent write is reflected in the UI.
- [ ] Loading, empty, error, blocked, approval, success, and recovery states are complete on desktop and mobile.
- [ ] Unit, integration, migration, parity, typecheck, build, browser, agent E2E, and production checks pass.
- [ ] All changes are committed and merged to `main`, pushed, deployed to production, and post-deploy health is verified.

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

## Post-Deploy Monitoring & Validation

- Monitor `turn.failed`, runtime/step/cost limit errors, stale running records, failed routine dispatches, specialist handoff failures, Computer orphan/timeout states, and artifact delivery errors.
- Healthy: multi-turn chat completes, every active Run advances or waits explicitly, Computer sessions terminate or expire cleanly, and accepted Results retain valid evidence.
- Rollback: cross-owner access, false completion, permission expansion through delegation, duplicate consequential action, or unrecoverable Computer orphan.
- Validation window: first 24 hours after production deployment; owner: application maintainer.
