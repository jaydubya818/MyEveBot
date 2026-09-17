---
status: ready
priority: p0
issue_id: "011"
tags: [operations, monitoring, canary, cleanup, incident]
dependencies: ["010"]
---

# Add production operations and recovery controls

## Problem Statement

The production release documented required monitoring but did not expose one owner-facing health view or schedule stale Computer cleanup.

## Findings

- Failure evidence already exists across Agent Runs, task Runs, routine delivery, Computer actions, and artifacts.
- Computer expiry was opportunistic; stalled provisioning or running state needed forced reconciliation.

## Proposed Solutions

Aggregate owner-scoped signals and schema canaries in System status, reconcile stale sessions on a schedule, emit a structured operator alert, and document release canaries and rollback.

## Recommended Action

Use the existing ledgers as source of truth. Do not add a second observability database.

## Technical Details

- `/api/operator-health` returns six owner-scoped signals and five product canaries.
- a CRON-secret-protected route reconciles stale sessions every ten minutes.
- forced cleanup closes browser state, times out unfinished actions, and emits an audit event.

## Acceptance Criteria

- [x] Failed turns, stuck Runs, Computer failures, routine failures, limits, and artifact failures are visible.
- [x] Stale Computer provisioning and running sessions are cleaned automatically.
- [x] Chat, Browser, Goals, Results, and Routines have production canary indicators.
- [x] System status provides a compact operator dashboard.
- [x] Structured alerts and incident/rollback procedures are documented.
- [ ] Deploy the exact revision with `CRON_SECRET` and confirm the scheduled cleanup job executes successfully.
- [ ] Run and record the live Chat, Browser, Goals, Results, and Routines release canaries in production.

## Work Log

### 2026-09-17 - Implemented

**By:** Codex

**Actions:** Added operator aggregation, System UI, stale-session reconciliation, scheduled cleanup, structured alert logging, and the production operations runbook.

**Learnings:** Existing lifecycle tables are sufficient for an initial operator view when queries stay owner-scoped and thresholds remain explicit.

## Notes

- Configure a hosting alert for `[operator-alert]` messages.
- Canaries are safe control-plane probes; the release runbook retains one bounded live browser test.
- Keep this work order open until the deployed dashboard, cron, alerts, and live release canaries are verified.
