---
status: complete
priority: p1
issue_id: "009"
tags: [browser, computer, reliability, eve, production]
dependencies: ["008"]
---

# Make browser work start reliably on demand

## Problem Statement

Sofie can operate an isolated browser, but before a Computer session exists the runtime advertises browser tools as unavailable. Sofie can therefore tell the owner that browser access is disabled instead of starting the session required to do the work.

## Findings

- Browser control is installed, enabled by default, and has passed an earlier production Computer smoke test.
- `persistent-agent-policy.ts` replaces authorized browser tools with throwing stubs until `start_computer_session` has already run.
- The System readiness surface treats a configured database as sufficient browser readiness and does not report sandbox authentication or tool-package state.
- The sandbox is deny-all by default, so automatic start must derive and audit a bounded public-domain allowlist rather than silently opening egress.

## Proposed Solutions

### Option 1: Prompt Sofie more strongly

Keep the two-step tool contract and add instructions telling Sofie to start a session first.

**Pros:** Small diff. **Cons:** The model can still interpret visible throwing tools as disabled. **Risk:** High.

### Option 2: Provision on the first URL-based browser call

Keep authorized browser tools callable, derive a narrow public-domain allowlist from explicit URLs, provision or extend the attributed Computer session, and preserve action audit hooks.

**Pros:** Matches owner intent, keeps isolation, removes a model-ordering failure. **Cons:** Adds a runtime wrapper around extension tools. **Risk:** Medium.

## Recommended Action

Implement Option 2. Keep genuine capability denials fail-closed, distinguish browsing modes in instructions, add browser readiness to System health, and add deterministic plus production smoke coverage.

## Acceptance Criteria

- [x] An authorized URL-based browser call starts its isolated Computer session automatically.
- [x] Browser tools never describe an inactive session as disabled or unavailable.
- [x] The first URL derives a bounded public-domain allowlist; private hosts, credentials, and non-HTTP protocols are rejected.
- [x] Later explicit URLs can extend the active session allowlist with an audited event.
- [x] Paused takeover sessions and unassigned secondary-Agent capabilities remain denied.
- [x] Instructions distinguish web search, fetch, ephemeral browser, persistent desktop, and local computer.
- [x] System health reports browser tool and sandbox-auth readiness separately from the database.
- [x] A production smoke command verifies navigate, read, cited result, and clean session stop.
- [x] Unit tests, integration tests, typecheck, and production build pass.

## Work Log

### 2026-09-17 - Implementation started

**By:** Codex

**Actions:**

- Confirmed production feature configuration includes browser by default.
- Traced the misleading disabled response to the dynamic persistent-Agent tool policy.
- Selected on-demand provisioning with a deny-by-default domain allowlist.

**Learnings:**

- The first browser action occurs after the normal action-request hook, so on-demand provisioning must explicitly preserve the first action's audit record.
- A browser health claim needs sandbox authentication and tool-package checks in addition to database availability.

### 2026-09-17 - Completed

**By:** Codex

**Actions:**

- Added automatic, Agent-attributed session provisioning for the first explicit browser URL and audited allowlist extension for later URLs.
- Replaced misleading inactive-session stubs with real authorized browser tools while preserving capability and takeover denials.
- Added Browser runtime readiness to System health and clarified the search, fetch, browser, persistent-desktop, and local-computer boundaries.
- Added deterministic coverage, database integration coverage, and a deployable browser production canary.
- Verified the live local flow navigates and reads a rendered page, cites the exact URL, and stops the Computer session.
- Verified 120 Node tests, 315 Vitest tests, database integration, typecheck, production build, and the rendered System health page.

**Learnings:**

- Session shutdown needs an explicit runtime requirement; a softer instruction was not reliable enough under an end-to-end canary.
- The streaming canary must consume the string form of `message.completed.data.message` and cancel its reader after turn completion so CI exits cleanly.
