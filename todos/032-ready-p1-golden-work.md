---
status: ready
priority: p1
issue_id: "032"
tags: [engineering, qualification]
dependencies: []
---
# Golden Work implementation and qualification

## Problem Statement
An admitted engineering issue must survive multiple Runs without human orchestration, with revision-bound evidence and human-approved publication.

## Findings
- Starting canonical main: `045f1f8e8f30e6f38f9c9909f59efb78c7ec66e5` (fetched September 25, 2026).
- Prior pilot base: `67550453ce1c87dd20631ca6664ee78fad5f4e3e`, uncommitted `codex/engineering-pilot` preserved.
- Recreated on `codex/golden-work` from current main; pilot migrations renumbered 0039/0040 after canonical 0038.
- Original user modifications untouched. Existing deployment guards remain; dogfood only, no production DB or deployment.
- Claude Code is installed but not authenticated. Evaluate a bounded, isolated headless adapter; no credentials in executor workspace.
- Approved private fixture repository and independent reviewer identity requested; do not borrow other projects' fixtures.

## Proposed Solutions
Continue stale pilot (migration collisions), or recreate on current canonical source (selected, preserves new authority/budget fixes).

## Recommended Action
Implement the focused Golden Work contract. Keep live-provider qualification separate from local fault simulation. No merge until qualification passes.

## Acceptance Criteria
- [x] Fetch canonical source; preserve work; inspect migrations and guards.
- [ ] Durable contract, manifest, multi-Run state, candidate custody and fencing.
- [ ] One isolated executor; independent protected verification; bounded budget and cleanup.
- [ ] Trusted GitHub publication with exact approval, current authority and uncertain-write reconciliation.
- [ ] Automatic CI/review continuation; takeover/give-back; deterministic readiness and immutable Results.
- [ ] Desktop/mobile Work, decisions, evidence, Results and durable Sofie status.
- [ ] Real PostgreSQL concurrency and fault tests; existing suites/build/typecheck/Relay regressions.
- [ ] Live private-repository Golden Work and no-babysitting trace.
- [ ] EP02 delta; exact qualification matrix and merge decision.

## Work Log
### 2026-09-25 — Source preparation
Fetched main, inspected pilot evidence, preserved old worktree and dirty original checkout, recreated isolated branch. Current main's 0036–0038 and Telegram/Foreman changes retained. No production access.
