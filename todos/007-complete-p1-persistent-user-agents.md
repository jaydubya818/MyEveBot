---
status: complete
priority: p1
issue_id: "007"
tags: [agents, capabilities, identity, lifecycle, postgres, eve, builder]
dependencies: ["006"]
---

# Ship persistent user-created Agents

## Problem Statement

MyEve has one configured primary agent and three bounded QA specialists, but no durable owner-created Agent identity, lifecycle, capability boundary, direct conversation entry point, or run attribution.

## Findings

- The existing Eve root agent can remain the single execution model by resolving persistent Agent identity, instructions, model preferences, and policy from authenticated session context.
- Eve approval callbacks cover authored and connection tool calls, providing a server-side capability enforcement boundary.
- The three QA specialists are fixed execution roles with acceptance-check contracts, so converting them to owner-created records would create two lifecycle authorities and is out of scope.
- Builder deployments already bake identity and instructions. A generated primary bootstrap file can seed the durable primary record once, after which PostgreSQL is canonical.

## Proposed Solutions

### Option 1: Persistent configurations over the existing Eve runtime

Add owner-scoped Agent and capability records, dynamically resolve Agent context in Eve, and reuse existing thread/run infrastructure with additive attribution.

**Pros:** One execution model, durable governance, preserves current chat/Goal OS behavior.

**Cons:** Requires coordinated schema, API, tool, UI, Builder, and policy changes.

### Option 2: Deploy or instantiate a separate runtime per Agent

**Pros:** Strong process isolation.

**Cons:** Creates a parallel execution model, complicates deployment and credentials, and exceeds Phase 4.

## Recommended Action

Implement Option 1. Keep QA specialists as bounded system definitions, make PostgreSQL the canonical Agent source after deterministic primary initialization, and fail closed for secondary-Agent capability checks.

## Acceptance Criteria

- [x] Exactly one protected primary Agent exists per owner and is derived from deployment configuration.
- [x] Owner-scoped create/read/update/pause/resume/archive/duplicate operations share one service layer.
- [x] Explicit Agent capabilities preserve assigned vs. available state and enforce risk ceilings.
- [x] Secondary Agent execution uses its identity, instructions, model/reasoning preferences, and lifecycle state.
- [x] Unassigned, unavailable, and over-risk capabilities fail closed without borrowing primary permissions.
- [x] Threads and runs can attribute an Agent without breaking existing primary conversations.
- [x] `/agents` provides complete desktop/mobile lifecycle and direct-chat UX.
- [x] Primary chat has bounded Agent-management tools.
- [x] Builder creates the configured primary identity without Jay/Sofie constants.
- [x] Unit, integration, security, browser, build, migration, manifest, audit, and preview gates pass.

## Work Log

### 2026-09-13 - Phase 4 started

**By:** Codex

**Actions:**
- Created `feat/persistent-user-agents` from exact Phase 3 commit `bea5a9b841e54c2d2a2506a74e4e515929630d61`.
- Audited Agent identity, Builder assembly/update behavior, Eve dynamic capabilities and approvals, thread persistence, run attribution, and Relay capability metadata.
- Selected persistent Agent configurations over the existing Eve runtime; retained QA specialists as bounded system definitions.

**Learnings:**
- Capability isolation must be enforced in runtime policy, not through prompt instructions or UI state.
- The primary bootstrap must preserve Builder identity/instructions while avoiding a permanent second source of truth.

### 2026-09-13 - Implementation and qualification

**By:** Codex

**Actions:**
- Added the owner-scoped Agent, capability, audit, thread/run attribution, and direct-run schema in migration `0008`.
- Added one canonical Agent service used by HTTP APIs and bounded Eve tools, plus the `/agents` lifecycle UI and direct Agent chat entry point.
- Added authenticated runtime identity, dynamic instructions/model/reasoning, capability isolation, lifecycle enforcement, limits, and cost/run attribution without creating another execution model.
- Added Builder-generated primary bootstrap state and advanced the template release to 27; retained the QA specialists as bounded system definitions.
- Passed 58 unit/security tests, four database integration suites, migration/manifest/capability checks, TypeScript, dependency audit, webpack production builds, and local browser qualification.
- Qualified the fresh branch preview for migrated Sofie identity, Agent CRUD, capability availability and denial, direct web-search execution, persisted run attribution, pause/resume, duplicate/archive, mobile layout geometry, and clean console/runtime errors.
- Removed the model-visible Agent/thread identity fallback after review; identity and attribution now come only from authenticated channel metadata.

**Remaining gate:**
- Completed after explicit owner authorization. The isolated resources were deleted and cleanup was verified.

### 2026-09-13 - Sarah/Ava Builder qualification and completion

**By:** Codex

**Actions:**
- Created a temporary Vercel project and newly provisioned Neon database; no existing MyEve database or project was reused.
- Found and fixed a Builder packaging blocker: generated deployments omitted scripts invoked by `package.json`. Added a regression test and regenerated a 473-file deployment.
- Applied migrations `0001` through `0008` to the fresh database and verified the Builder bootstrap created exactly one active Ava primary Agent for Sarah's deployment owner scope.
- Verified Sarah/Ava login and chat identity, absence of visible Jay/Sofie leakage, unauthenticated API rejection, protected primary pause/archive actions, and completed Ava run attribution.
- Made authenticated owner chat resolve the durable primary Agent so its model preference and run attribution are canonical.
- Deleted the temporary Neon database and Vercel project, verified both absent, removed all temporary credentials/staging artifacts, and closed the browser sessions.
- Final gates: 59 unit/security tests passed; 8 migrations validated; TypeScript, manifest, and capability registry passed; npm audit reported 0 vulnerabilities; Eve and Builder webpack production builds passed. Four database integration suites passed earlier in the Phase 4 qualification before temporary-resource cleanup.

**Learnings:**
- Builder assembly must preserve every file referenced by shipped package commands; the fresh-deployment gate caught a defect that repository builds cannot expose.
- Model-visible client context is appropriate for user-selected model/reasoning preferences, but Agent identity and thread attribution must come only from authenticated channel metadata.
