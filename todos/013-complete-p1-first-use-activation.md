---
status: complete
priority: p1
issue_id: "013"
tags: [activation, onboarding, first-use, ux]
dependencies: ["012"]
---

# Add a bounded first-use activation flow

## Problem Statement

MyEve exposed powerful product areas but did not help a new owner confirm access boundaries or reach a first useful result. Setup was distributed across Manage sections, capabilities were presented as infrastructure, and there was no safe path from configuration to one concrete trial.

## Recommended Action

Add one Getting started surface that composes the existing identity, Connections, Computer health, review delivery, and Agent policy controls. Discover connected accounts without mutation, recommend exactly five bounded starter jobs, and launch each job as a reviewable chat draft with an explicit finish line.

## Acceptance Criteria

- [x] Setup guides identity, connected accounts, browser readiness, notification delivery, and risk boundaries.
- [x] Connected-account discovery is read-only and degrades safely when no account is connected.
- [x] Exactly five starter jobs explain required access, operating boundary, and finish line.
- [x] Try once creates a normal chat with the complete bounded prompt prefilled but unsent.
- [x] The flow uses owner-facing language and does not expose framework terminology.
- [x] Completed work continues into the existing Run again, Save as skill, and Make routine actions in Results.
- [x] Empty, loading, unavailable, and configured states are represented without blocking the rest of setup.
- [x] Tests, typecheck, production build, interaction test, and visual verification pass.

## Work Log

### 2026-09-17 - Completed

**By:** Codex

**Actions:**

- Added Getting started as the first Manage section.
- Composed live capability, connection, and review-delivery state into five setup cards that deep-link to the existing source of truth.
- Added five deterministic starter jobs that adapt connected-account and browser copy without broadening permissions.
- Wired Try once into the existing thread flow so the owner reviews the full prompt before sending it.
- Reused the existing Results actions after verified completion rather than creating a duplicate success flow.

**Verification:**

- 126 Node tests and 318 Vitest tests passed.
- All 13 migrations validated; TypeScript, capability registry, and skill routing passed.
- The 70-route production build passed.
- Browser verification confirmed the complete setup surface and all five jobs render, then confirmed Try once creates a titled thread with the bounded prompt prefilled and unsent.
- The desktop dark-theme layout was visually inspected.
