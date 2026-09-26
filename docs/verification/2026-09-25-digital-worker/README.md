# Digital Worker M1 control-plane qualification — 2026-09-25

**Verdict: PARTIAL / NOT RELEASE QUALIFIED.** This record covers the first owner-visible Work and Memory slice in the isolated `codex/golden-work` worktree. It does not claim the infographic's full persistent worker, direct Sofie engineering, live GitHub follow-through, MyFactory execution, Relay collaboration, learning, or portability.

Source: `origin/main` `08d3d24fffa04b16a5ad2b1360358a5ec24b9735` merged at `9ce8a59711b19b10a75a691e43cabb93b0042b14`, plus the current branch changes described here. The [implementation plan](../../plans/2026-09-25-digital-worker-mvp.md) separates the user's desired product image from the pasted specification and from verified behavior. This record is the evidence for the current slice; the earlier [Golden Work dossier](../2026-09-25-golden-work/README.md) remains **NOT QUALIFIED** for its live no-babysitting journey.

## Implemented slice

- One derived engineering Work manifest now supplies status, next step, activity, exact pending decision, freshness, and current protected-check state to `/work`, the chat Work card, and Sofie's `engineering_work` list/get tool. Only the readiness function can claim Ready for Review.
- The owner can decline exact draft PR publication. The decision is revision- and candidate-bound, durable, and leaves Work stopped. Stale detail disables publication and control buttons until a successful refresh. On mobile, a chat Needs You link lands at the decision.
- A blocked, uncertain publication appears in Needs You with the recorded effect, last repository observation and a reconciliation instruction. The UI offers no second approval or retry for that state.
- The worker checks current repository authority/base/head/PR before owner-directed continuation. A human Give Back records an exact generation-bound branch/PR baseline so a later executor loss can continue without adopting a different external branch or PR.
- Scoped Memory remains locally readable when the semantic provider fails. Receipts and context label `synced`, `local_only`, or `remote_unknown`; uncertain remote writes block Forget and correction until reconciliation. A missing provider key cannot turn a new local-only write into a remote-unknown one. New Memory records derive chat/run provenance from the trusted Action trigger. Owner Knowledge surfaces that state, and local-only correction works through the UI.
- Versioned role-neutral Work/Context/Proof schemas, Software Engineer/JStack/mode metadata, and a fail-closed route decision function are present as **contracts only**. Optional Work context assembly is tested but has no authenticated chat-session Work binding yet. These seams grant no new tools or authority.

## Evidence and limits

| Gate | Result | Evidence and limit |
|---|---|---|
| Repository/type/governance | PASS | TypeScript with `--noEmit --incremental false`; capability registry 146 definitions/124 authored tools; imported-skill routing 93 checks; 602 executor sources classified, UNKNOWN=0; `git diff --check`. |
| Unit/regression | PASS | `vitest run`: 146 files, 1,178 tests passed, 3 files/40 tests skipped by their existing integration gates. Includes Work recovery, uncertain-publication projection, scope, Memory outage/provenance, owner Knowledge, remember receipts, and Digital Worker contracts. |
| SQL migrations and Work ownership | PASS | 41 ordered migrations validated; real PostgreSQL rollback/upgrade/rerun, idempotency, owner isolation, writer conflict, criteria history and control fencing passed. |
| Golden execution recovery | PASS — **simulated external systems** | Real PostgreSQL and protected Docker verifier, simulated executor/GitHub: 11 case groups including CI failure, review continuation, human branch edit, executor loss, unknown publication reconciliation, and budget boundary. A stricter `continue()` guard initially failed this integration after human Give Back; the durable handoff baseline fixed it, and the full integration passed again. This is not a live GitHub pass. |
| Work and chat browser | PASS — **local simulated fixture** | Authenticated desktop/mobile Next UI against PostgreSQL. Observed pending decision and review-ready Work, protected-check matrix, decline → Stopped, deep-link navigation, live refresh, stale detail → disabled Approve/Decline/Control → recovery, chat Needs You → mobile decision. Injected an UNKNOWN publication effect into the disposable SQL fixture: Work and chat both showed Needs You, mobile rendered the exact reconciliation packet, no Approve/Continue action appeared, and document width stayed 390 px at a 390 px viewport. No horizontal overflow. The UI labels GitHub/executor events as simulation. |
| Owner Memory browser | PASS — **local fixture** | Seeded one local-only and one remote-unknown record. Owner Knowledge showed Reconciliation required and disabled Correct/Forget for unknown remote state. Mobile selection brought the detail into view. Corrected local-only Memory through authenticated UI; replacement and audit receipt appeared. No live semantic provider was contacted. |
| Direct Sofie coding/model continuity | NOT_RUN | The fixture has no model credentials or approved direct-development candidate path. No real Sofie conversation, model restart, direct edit/test/debug, or protected Proof of Work was exercised. |
| Live GitHub no-babysitting | NOT_RUN | The publisher GitHub App/installation credential is absent from the local Keychain and `gh auth status` reports an invalid token. No live draft PR, post-publication CI failure/review recovery, or independent Ready trace occurred. |
| MyFactory and Relay round trip | NOT_RUN | Existing signed Factory intake/readback and Relay primitives were not a new Factory candidate or Sofie↔Atlas exchange in this slice. |
| Learning, capsules, organization isolation | NOT_RUN | Contracts and prior primitives do not qualify these product milestones. |

Do not infer zero production authority bypasses, cross-scope leaks, duplicate effects, coordination debt or supervision cost from these bounded tests. The Golden simulated trace records **0 coordination-debt events inside that fixture only**. A full M1 report still needs the direct Sofie issue, model/process/worker restart, scoped knowledge/file retrieval, behavior-pack evaluation, trusted Work binding, and all counts named in the plan.

The existing standalone nightly Memory consolidation schedule currently runs as a runtime principal without an admitted occurrence, so its tool writes are denied by `toolActionRequest`. This slice corrected provenance for authorized scheduled occurrences; it did not loosen schedule authorization. Continuous learning remains an open milestone.

## Browser captures

- [Desktop Work evidence](work-desktop-simulated.png)
- [Mobile Needs You decision](decision-mobile-simulated.png)
- [Mobile chat Work card](chat-mobile-simulated.png)
- [Mobile remote-unknown Memory detail](memory-mobile-simulated.png)
- [Mobile uncertain-publication reconciliation](reconciliation-mobile-simulated.png)

## Local reproduction

Use a disposable PostgreSQL 16 container on `127.0.0.1:55468`; the UI fixture creates a `golden_ui` database and the integration creates/drops random test databases. From `apps/eve`, run `node --import tsx test/golden-work.integration.mjs`, then `GOLDEN_UI_FIXTURE=1 node --import tsx test/golden-ui-fixture.mjs`. Open `http://localhost:3103` and sign in with the fixture-only password `golden-ui-qualification`. The browser fixture runs actual Next routes, auth, SQL and worker ticks but **simulates GitHub and the executor**. Its `golden_ui` database must be dropped before reseeding a second time. Do not point it at customer or production data.
