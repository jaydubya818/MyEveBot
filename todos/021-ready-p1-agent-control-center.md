---
status: ready
priority: p1
issue_id: "021"
tags: [agents, control-plane, approvals, computer, trust]
dependencies: ["018"]
---

# Agent Control Center and Modular Execution Control Plane

## Problem Statement

MyEve has durable Tasks, Agent Runs, Computer sessions, evidence, outcomes, and events, but the owner cannot supervise them from one coherent surface. Execution state and controls are spread across Activity, Agents, Computer, Goals, and chat. That makes waiting reasons, authority boundaries, costs, failures, and recovery harder to understand than they should be.

## Decision

Build the Control Center as an owner-scoped projection and control layer over the existing canonical records. Do not create another execution engine or duplicate task, run, evidence, outcome, capability, or computer state. Add storage only for control concepts that do not exist yet, such as exact approval bindings and exclusive Human Takeover ownership.

## Work Order

### Enhancement 1 — Control Center foundation

- [x] Add one normalized, owner-scoped read model over Task Runs and their linked Agent, Goal, and Computer records.
- [x] Add Working, Waiting, Needs Approval, Failed, Completed, and All views with bounded server-side search and filters.
- [x] Show objective, executor, current state/action, explicit waiting reason, elapsed time, provider/session, cost, progress, and linked resources without fabricating unavailable values.
- [x] Add safe View, Pause, Resume, Cancel, and Retry controls using the canonical Task transition ledger.
- [x] Ensure Pause cooperatively cancels active Eve work before recording the paused checkpoint; Resume returns work to a queued checkpoint rather than pretending execution restarted.
- [x] Cover loading, empty, error, success, stale-state, and invalid-transition behavior.

### Enhancement 2 — Approval Center

- [x] Extend the existing task approval ledger into the canonical owner-scoped Approval Request contract.
- [x] Bind approval to exact run, resource, action, safe parameters, and expiry; changed actions require fresh approval.
- [x] Resolve ALLOW, REQUIRE_APPROVAL, and DENY deterministically from capability and policy data.
- [x] Add pending, approved, denied, expired, and invalidated states with auditable owner decisions and no stored secrets.

### Enhancement 3 — Human Takeover and execution safety

- [ ] Add exclusive AGENT, OWNER, PAUSED, and NONE controller ownership for Computer sessions.
- [ ] Implement Take Over, Return Control, Stop, and disconnect-to-PAUSED behavior without concurrent control.
- [ ] Require re-observation and replanning before an Agent resumes after owner control.
- [ ] Add leases, heartbeats, and idempotency enforcement for consequential actions.

### Enhancement 4 — Run explorer, recovery, and provider seams

- [ ] Add a detailed Run explorer with actions, attempts, approvals, evidence, artifacts, cost, result, outcome, and delegation lineage without chain-of-thought.
- [ ] Add normalized failure taxonomy, PARTIALLY_COMPLETED and RESULT_UNKNOWN recovery paths, checkpoint summaries, and safe retry/recover controls.
- [ ] Expose current execution, computer, browser, model, tool, connector, evidence, approval, notification, relay, and audit provider identities only where implemented.

## Acceptance Criteria

- [ ] Existing Task, Agent Run, Computer, Goal, Outcome, Evidence, Capability, and Event records remain authoritative.
- [ ] All reads and mutations are owner scoped and fail closed.
- [ ] Every consequential control action records an immutable, secret-free audit event.
- [ ] State transitions are deterministic and reject stale or illegal mutations.
- [ ] Unknown provider, cost, progress, or health data is shown as unknown, never inferred.
- [ ] Tests, migration validation, typecheck, production build, and browser qualification pass for each enhancement before it is committed.

## Post-Deploy Monitoring & Validation

- Monitor `Control Center read failed`, `Control Center action failed`, invalid transition, approval binding, takeover conflict, stale lease, and result-unknown events.
- Healthy: owner-scoped lists load, counts match canonical records, pause/cancel settle active work, and stale actions return conflicts.
- Roll back an enhancement if controls mutate the wrong owner, execution continues after a recorded pause, approvals apply to changed actions, or Agent and owner can control one Computer concurrently.
- Validation window: 72 hours after each enhancement. Owner: technical owner.
