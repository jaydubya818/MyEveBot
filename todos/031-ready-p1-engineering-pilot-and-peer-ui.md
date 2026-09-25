---
status: ready
priority: p1
issue_id: "031"
tags: [engineering, federation, ui, qualification]
dependencies: []
---
# Engineering pilot and bidirectional peer UI qualification

## Problem Statement
Implement the approved engineering plan and verify critical user journeys in the UI, including substantive Sofie/Atlas information exchange.

## Findings
Pinned MyEve 6755045, isolated codex/engineering-pilot worktree. Existing personal edits preserved. Baseline 135 core and 985 Eve tests pass (one skipped). Current peer receiver already includes bounded model replies; old acknowledgement-only reports are historical.

## Proposed Solutions
Follow existing control-plane primitives and staged release gates. Avoid replacing MyEve or relaxing Action/peer authority for tests.

## Recommended Action
Execute plan work packages, qualify reusable peer paths early, and preserve separate live/fixture evidence. Managed organization identity provider remains to be selected.

## Acceptance Criteria
- [x] Pinned isolated baseline and existing test status.
- [ ] Qualified executor feasibility and durable wake-up.
- [x] Internal personal-owner Work preparation lifecycle and critical UI states.
- [ ] Publication/evidence/recovery boundaries tested.
- [x] Isolated Sofie and Atlas each initiate and receive an authored response correlated to its request.
- [x] Permission revocation, private-data denial and duplicate handling verified.
- [x] Desktop/mobile UI evidence and preparation/peer test dossier.

## Work Log
### 2026-09-25 — implementation started
Read implementation/Eve/UI testing skills. Created isolated worktree without changing original checkout. Baseline suites pass. Reviewing real agent/provider configuration before running paid or external qualification.

### 2026-09-25 — preparation and peer verification
Implemented dogfood Work service/UI/tool, migrations 0036–0037, immutable criteria history, controls, export registration and capability/Builder integration. Browser testing found and fixed authentication consistency, login error rendering, repository validation, button contrast, stale list state, navigation and incoming message visibility. Real Gateway replies passed in both directions through native outbound and receiving UI approvals on isolated instances. Revocation stopped the next send; duplicate signatures did not repeat model usage. Current suites: 136 core and 1,006 Eve tests, one existing skip; PostgreSQL integration, governance and Builder checks pass.

Remaining gates are not checked off: no org identity, GitHub App/repository binding, qualified coding executor, protected evidence/Result pipeline, publication/review loop, deployed durable wake-up or production rollout. Identity provider and test repository/App questions are pending. Full evidence: `docs/verification/2026-09-25-engineering-pilot/README.md`.
