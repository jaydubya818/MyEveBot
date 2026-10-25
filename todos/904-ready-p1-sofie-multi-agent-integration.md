---
status: ready
priority: p1
issue_id: "904"
tags: [sofie, engineering, integration, qualification]
dependencies: []
---
# Complete the isolated Sofie multi-agent integration

## Problem
7028439b exposes sessions but does not provide concurrent productive roles or durable handoff/recovery. Reconcile it onto current unified beta without activating execution or changing deployments.

## Findings
Base: Myeve 95cbd216 (draft #101 successor of serving 5895b129). MyFactory CI pin: 39b68666. Relay CI pin: f05a5639. GoalWork already owns task planning/assignment/links. MyFactory owns execution/workspaces/verification and currently has a global single Run slot. Six Jev assertions fail identically on the base.

## Recommended action
Manually port the session facade preserving current gates. Extend existing GoalWork and bounded Factory execution; qualify in disposable environments. Keep registration/activation disabled pending all release gates.

## Acceptance
- [ ] Nine runtime branch conflict dispositions recorded
- [ ] Session facade reconciled without removing current guards
- [ ] Concurrent isolated productive roles and exact artifacts demonstrated
- [ ] Durable fenced handoff, interruption and recovery tested
- [ ] Independent combined-tree verification demonstrated
- [ ] Owner/authorization/accounting/evidence negative tests pass
- [ ] PostgreSQL, integration, TypeScript, governance and browser evidence recorded
- [ ] Exact final source independently reviewed
- [ ] Candidate pins and limitations recorded; no deployment/merge

## Work log
2026-10-25: Selected existing isolated worktree, created nondeploying integration branch from current unified-beta successor. Baseline six SDK failures reproduced. No production/beta mutations.
