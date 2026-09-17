---
status: complete
priority: p1
issue_id: "003"
tags: [delegation, qa, evidence, postgres, blob, eve, ui]
dependencies: ["002"]
---

# Ship Sofie's trustworthy delegation pilot

## Problem Statement

Sofie can chat and use tools, but delegated work has no application-owned contract, durable progress state, evidence gate, recovery controls, or accountable multi-specialist result. The owner must infer whether a multi-step task actually finished.

## Findings

- Eve already owns durable sessions, subagent execution, streaming, and human-in-the-loop pauses.
- Neon already stores owner-scoped application data and checked-in migrations are the schema source of truth.
- Vercel Blob is the approved artifact store; Neon will retain metadata and private storage keys.
- The first pilot is a self-test across local and isolated preview environments using Functional & State, UX & Accessibility, and Trust & Resilience specialists.
- Balanced guardrails are approved: 15 minutes, three specialists, 40 aggregate model steps, one retry per specialist, and a $5 estimated-cost hard stop.

## Proposed Solutions

### Option 1: Application-owned task ledger over Eve sessions

**Approach:** Store task contracts, checks, milestones, approvals, artifacts, transitions, and budgets in Neon while retaining Eve session IDs as runtime references. Expose focused task tools/API routes and a compact evidence UI.

**Pros:** Durable, auditable, owner scoped, and compatible with Eve's execution model.

**Cons:** Requires a migration and explicit synchronization at meaningful boundaries.

**Effort:** Multi-file vertical slice.

**Risk:** Medium.

### Option 2: Derive task state only from Eve event streams

**Approach:** Reconstruct status from session events at read time.

**Pros:** Less schema work.

**Cons:** Weak contracts, difficult evidence verification, and brittle recovery semantics.

**Effort:** Medium.

**Risk:** High.

### Option 3: Build a standalone workflow/project engine

**Approach:** Persist and execute an independent task graph outside Eve.

**Pros:** Maximum control.

**Cons:** Duplicates Eve durability and is premature for the pilot.

**Effort:** Large.

**Risk:** High.

## Recommended Action

Implement Option 1 as a bounded vertical slice. Keep execution in Eve, add explicit task/evidence tools and APIs, declare exactly three QA specialists, and surface factual progress and evidence without chain-of-thought.

## Technical Details

**Affected areas:**

- `apps/eve/migrations/` — additive task/evidence schema.
- `apps/eve/lib/` — owner-scoped task repository and transition rules.
- `apps/eve/app/api/` — task list/detail/recovery endpoints.
- `apps/eve/agent/tools/` and `apps/eve/agent/subagents/` — task protocol and QA specialists.
- `apps/eve/app/chat.tsx` and focused components — task card and evidence details.
- `apps/eve/test/` — transition, redaction, API, and contract tests.

## Acceptance Criteria

- [x] Task contracts, transitions, checks, milestones, approvals, artifacts, and budgets persist through checked-in migrations.
- [x] Every query and mutation is scoped to the authenticated owner.
- [x] Only legal lifecycle transitions are accepted; terminal runs cannot silently mutate.
- [x] Completion requires all declared acceptance checks to pass with stored evidence.
- [x] Screenshot/report artifacts use private Blob storage with Neon metadata.
- [x] Functional & State, UX & Accessibility, and Trust & Resilience specialists are bounded and attributable.
- [x] The pilot enforces the approved 15-minute, 40-step, one-retry, and $5 guardrails.
- [x] Chat shows a compact factual task card and a drill-down ledger with stop/retry recovery.
- [x] Local and isolated-preview critical-path checks produce one evidence-backed report.
- [x] Unit tests, migration checks, typecheck, build, and browser verification pass.

## Work Log

### 2026-09-12 - Approved design and implementation start

**By:** Codex

**Actions:**

- Captured the Product Owner's lifecycle, completion, pilot, target, roster, storage, suite, and budget decisions.
- Read the full implementation plan and installed Eve documentation for subagents, workflows, and durable HITL.
- Selected the application-owned ledger over Eve sessions to avoid duplicating the runtime.

**Learnings:**

- The current `automation_runs` store is purpose-specific and should not be overloaded with delegated task state.
- Evidence metadata and private artifact storage need distinct lifecycles.

### 2026-09-12 - Balanced vertical slice implemented and locally verified

**By:** Codex

**Actions:**

- Added the owner-scoped Neon task ledger, legal transition enforcement, acceptance checks, specialist attribution, budget accounting, and private Blob artifact metadata.
- Added exactly three read-only QA specialists plus the coordinating Sofie skill and tools. The fixed contract enforces 15 minutes, 40 aggregate model steps, one retry per specialist, and a $5 estimated-cost hard stop.
- Added compact chat progress cards and an Activity ledger with evidence, stop, retry, responsive desktop/mobile states, and redacted diagnostic detail.
- Applied the additive migration to the isolated Neon database and provisioned a private `sofie-evidence` Blob store for development and preview only.
- Ran a live local Sofie smoke task. It created a durable run, exercised retry, recorded model usage, stored and served a private redacted report, and failed honestly when isolated-preview credentials were unavailable instead of claiming completion.
- Verified 13 unit tests, two ordered migrations, Eve and builder typechecks, the template manifest at release 23, local task/evidence APIs, desktop/mobile layouts, and a WCAG A/AA scan with zero violations.
- Created an isolated Vercel Preview protected by Vercel SSO. Removed the accidental production-target deployment immediately; no production deployment remains.

**Remaining gate:**

- Run the complete three-specialist critical-path suite against both local and Preview, then produce the single evidence-backed report. The Preview app's disposable test credential still requires explicit Product Owner approval before it can be stored temporarily and removed after verification.

**Learnings:**

- Budget enforcement belongs at model-step start as well as completion so a run cannot begin work after reaching a hard limit.
- Private artifact delivery should stay behind an owner-scoped application route even when the backing Blob store is private.
- Preview isolation has two layers: Vercel SSO at the deployment edge and Sofie's own owner session inside the app. Both must be satisfied for an authenticated browser run.

## Notes

- Do not expose chain-of-thought, raw secrets, session cookies, or captured form values.
- Do not add autonomous external side effects to the self-test pilot.

### 2026-09-17 - Superseded Preview gate reconciled

**By:** Codex

**Actions:**

- Closed the historical Preview-only gate using the stronger production qualification recorded in work order 008.
- Preserved this work order as implementation history; `docs/roadmap.md` is now the canonical forward-looking roadmap.

**Learnings:**

- A later production qualification supersedes an older Preview gate when it exercises the same critical path and records stronger evidence.
