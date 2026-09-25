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
- Latest integrated canonical main: `bcb06ccff3b6e569ca5e789aa133abd68c44b814`; checked implementation: `16dc2f5b6fb49f89f6917d29a85bf6a2a4e26eff`.
- Real Claude Code 2.1.282 qualified through an attempt-bound model broker; provider and publication credentials remain outside the executor.
- Approved private fixture repository and independent reviewer identity requested; do not borrow other projects' fixtures.

## Proposed Solutions
Continue stale pilot (migration collisions), or recreate on current canonical source (selected, preserves new authority/budget fixes).

## Recommended Action
Implement the focused Golden Work contract. Keep live-provider qualification separate from local fault simulation. No merge until qualification passes.

## Acceptance Criteria
- [x] Fetch canonical source; preserve work; inspect migrations and guards.
- [x] Durable contract, manifest, multi-Run state, candidate custody and fencing (local PostgreSQL/component evidence).
- [x] One isolated executor; independent protected verification; bounded budget and cleanup (live executor component evidence).
- [ ] Trusted GitHub publication with exact approval, current authority and uncertain-write reconciliation.
- [ ] Automatic CI/review continuation; takeover/give-back; deterministic readiness and immutable Results.
- [ ] Desktop/mobile Work, decisions, evidence, Results and durable Sofie status.
- [x] Real PostgreSQL concurrency and fault tests; existing suites/build/typecheck/Relay regressions.
- [ ] Live private-repository Golden Work and no-babysitting trace.
- [x] EP02 delta; exact qualification matrix and merge decision.

## Work Log
### 2026-09-25 — Source preparation
Fetched main, inspected pilot evidence, preserved old worktree and dirty original checkout, recreated isolated branch. Current main's 0036–0038 and Telegram/Foreman changes retained. No production access.

### 2026-09-25 — Implementation and bounded qualification
Implemented the local Golden Work runtime and desktop/mobile UI. Live Claude Code produced two retained candidates across fresh executor instances; protected Docker checks passed. PostgreSQL/provider simulations cover CI/review continuation, uncertain writes, takeover and budget races. Final integrated source passed 1,288 core/Eve/enabled PostgreSQL tests, Work SQL checks, 41 migrations, typecheck/governance and the Webpack production build. Browser fixtures are explicitly simulations.

Unfinished checkboxes above deliberately retain live-provider acceptance gates. Approved private repository/reviewer input is pending; no live issue→PR→CI→review no-babysitting trace exists. Actual worker OS restart and new live Sofie conversation are also not qualified. **Not safe to merge.** See `docs/verification/2026-09-25-golden-work/README.md` for evidence and remaining work.
