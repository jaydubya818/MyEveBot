---
status: complete
priority: p2
issue_id: "011"
tags: [skills, evals, agents, provenance, eve]
dependencies: ["006"]
---

# Import curated production engineering skills

> Historical numbering note: this completed work order was renumbered from 007 to 011 on 2026-09-17 because persistent user-created Agents already owns work order 007.

## Problem Statement

Sofie has a broad project skill catalog, but it lacks several production-engineering workflows from Addy Osmani's `agent-skills` pack. Importing the entire pack would add duplicate workflows, weaken combined routing, and include a browser skill whose required Chrome DevTools connection is not configured.

## Findings

- The upstream repository contains 25 MIT-licensed skills at commit `be4e44a9fbc5e8df0beaefadbb28bd22ee61cc39`.
- Upstream structural validation passes for all 25 skills and its deterministic suite passes 140 checks with 100% rank-one routing inside that catalog.
- Combining all 25 descriptions with Sofie's existing 62 skills reduces the upstream positive-prompt rank-one rate to 83%.
- Eleven upstream skills reference shared repository files outside their own package directories, so a direct per-skill copy would produce broken runtime references.
- MyEve already provides source-controlled catalog provenance, per-agent assignments, model-backed routing evals, and eval status in the Skills Manager.

## Proposed Solutions

### Option 1: Import all 25 directly

**Pros:** Complete upstream lifecycle pack.

**Cons:** Adds known routing collisions, duplicates existing workflows, and includes incompatible dependencies.

### Option 2: Import the 12 complementary skills with their evidence

Pin the upstream revision, preserve required references and license provenance, add the source routing cases, use those natural-language prompts in Eve evals, and assign focused skills to the existing specialists.

**Pros:** Adds the highest-value missing workflows while keeping routing and ownership reviewable.

**Cons:** Requires a small amount of import adaptation and combined-catalog validation.

## Recommended Action

Implement Option 2. Keep the other 13 skills deferred until a combined routing eval demonstrates that each adds more value than overlap.

## Acceptance Criteria

- [x] Exactly 12 approved upstream skills are imported at the pinned revision.
- [x] MIT license, repository, revision, and source eval provenance are preserved.
- [x] Every imported skill is a self-contained Eve package with no broken shared-reference paths.
- [x] The generated catalogs include all 74 project skills and supporting files.
- [x] Sofie's routing eval uses upstream natural-language positive prompts for imported skills.
- [x] Deterministic combined-catalog checks cover positive and negative upstream routing cases.
- [x] Default specialist assignments include the relevant imported skills without changing Sofie's primary access.
- [x] The Skills Manager exposes source eval coverage and assignment controls for the imported skills.
- [x] Unit, type, manifest, catalog, and browser qualification pass.
- [x] A fresh stacked Preview and pull request are created without changing the Phase 3 branch.

## Work Log

### 2026-09-13 - Approved and isolated

**By:** Codex

**Actions:**
- Audited the upstream repository, its license, skill anatomy, shared references, deterministic evals, and overlap with Sofie's current catalog.
- Selected the 12 complementary workflows approved by the owner.
- Created `codex/curated-agent-skills` in an isolated worktree from the completed Phase 3 branch because the shared checkout contains concurrent persistent-agent work.
- Replaced `context-engineering` with `planning-and-task-breakdown` after the combined-catalog gate showed that the latter is the required companion owner for a negative `spec-driven-development` routing case.

**Learnings:**
- The upstream pack is internally well-routed, but its whole-catalog guarantee does not transfer automatically when mixed with Sofie's existing skills.
- Source eval prompts are more useful than the current exact-name smoke prompt for proving discovery behavior.

### 2026-09-13 - Implemented and qualified

**By:** Codex

**Actions:**
- Imported 12 pinned skills with MIT license files and package-local supporting references.
- Added source routing and behavioral cases to the generated catalog, model-backed Eve routing evals, and the Skills Manager detail view.
- Assigned production workflows to Functional & State, UX & Accessibility, and Trust & Resilience while retaining Sofie's fixed access to the full catalog.
- Added a deterministic combined-catalog gate: 74 checks pass and 44 of 48 positive prompts rank first (91.7%).
- Verified search, source provenance, default assignment state, eval coverage, and narrow layout in a real browser with no page or console errors.
- Passed 54 tests, both package type checks, template release 27 manifest validation, and both production builds.

**Learnings:**
- `planning-and-task-breakdown` is the necessary routing companion to `spec-driven-development`; importing the latter alone makes an explicit planning request route to the wrong owner.
- Source eval fixtures belong under the app eval tree, not Eve's authored `agent/` root, which intentionally rejects unsupported directories.

### 2026-09-13 - Delivered

**By:** Codex

**Actions:**
- Published Preview: `https://sofie-personal-agent-bilaeeifc-jaydubya818.vercel.app/manage/skills`.
- Opened stacked pull request: `https://github.com/jaydubya818/eveclaw/pull/3` against `feat/proactive-review-delivery`.

## Notes

- Deferred: `browser-testing-with-devtools`, `ci-cd-and-automation`, `code-review-and-quality`, `code-simplification`, `context-engineering`, `debugging-and-error-recovery`, `doubt-driven-development`, `git-workflow-and-versioning`, `idea-refine`, `incremental-implementation`, `interview-me`, `test-driven-development`, and `using-agent-skills`.
- No database migration is required.
