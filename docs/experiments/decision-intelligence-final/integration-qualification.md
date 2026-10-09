# Integration qualification

Status: **JEV DECISION INTELLIGENCE INTEGRATION QUALIFIED**. **MAIN PUSH BLOCKED BY AUTOMATIC PRODUCTION DEPLOYMENT**.

Previous/current origin/main: `e9984e4962151bffca1f6eb48c544b60bb643aa7`. V0 baseline: `d54f152eafdac40d2293281b1046e343bf65cd8b`. V0.5 live-qualified source: `6a067090f4e8e215264c8d4c6b90150bd816cbe2`. Merge base: `88370d0662c7824445b59779a8b8e8b21abfa10b`; main-only/Jev-only commits before integration: **1 / 2**.

Integration branch: `codex/decision-intelligence-final-integration`, created from current origin/main. A non-squash merge preserves V0 and V0.5 histories. The only textual merge conflict was the executor inventory: both canonical owner ZIP validation and Jev entries were retained. Newer canonical product-acceptance fixes were not overwritten. The separate Lazy Computer/migration reconciliation work is not yet on origin/main and was not copied from its in-progress checkout.

AI SDK `7.0.105` and Gateway `4.0.85` remain qualified. Other dependency versions were not downgraded. Canonical policy, owner isolation, Knowledge and Insight behavior are unchanged. No migration was added.

## Cumulative checks

| Check | Result |
|---|---|
| Decision Intelligence tests | 112 PASS |
| Eve unit tests | 740 PASS, 101 files |
| Core contracts | 134 PASS |
| Knowledge / Forget | 28 PASS; canonical Insight classifier calls 0 |
| Model SDK regressions | 5 PASS (included in Eve total) |
| Eve TypeScript | PASS |
| Builder TypeScript | PASS |
| Capability Registry | 135 definitions / 99 authored tools PASS |
| Skill routing | 93 checks; existing 50/57 rank-one baseline preserved |
| Builder manifest | 146 prunable files / release 255 PASS |
| Executor inventory | 531 classified; UNKNOWN 0 |
| Eve build | PASS |
| Builder build | PASS |
| Provider-free generated build | PASS; 984 generated Sarah/Ava files |
| Resource-free qualification builds | PASS; no credentials, external resource/model traffic blocked, 0 Sandboxes |
| Full private corpus in client bundles | 0 matches across 32 chunks |
| Diff check / secret-pattern scan | PASS |

The retained-evidence tests prove all six historical run artifacts validate without provider configuration/network calls, Stress remains unscored, and original normalized predictions match their retained hashes. Material provider semantics and all frozen evidence inputs remain byte-identical to the live-qualified source; no new benchmark was needed or run.

## UI

Historical V0, reproduction, Challenge Six/Seven, Stress and canary load with Jev disabled and no evidence-directory setting. Completed-experiment conclusions, provisional rubric and authority boundary are prominent. Seven's 100% observed threshold accuracy is adjacent to 43.37% coverage and the finite-sample limitation. No activation controls exist.

Desktop 1440×900, mobile 390×844, keyboard/filter/detail/back/refresh, cohort controls, tables, confidence, Stress and scoped WCAG 2A/2AA/2.1AA axe checks: PASS. Unexpected console errors 0; failed responses 0; overflow NONE. Nine-route smoke PASS: Chat, Goals, Knowledge, Results, Agents, Review, Files, Manage, Decision Intelligence.

An initial fixture run omitted the normal model-list credential, producing `/api/models` 503 responses while historical evidence still loaded. Supplying the existing synthetic blocked-network Gateway fixture resolved that environment issue; Jev remained disabled. No source behavior was changed to hide errors. Final configured fixture reports have zero errors.

Logs/screenshots are local qualification artifacts under `/private/tmp/jev-final-qa`; they are not committed. No real model inference, owner sampling, communication, shared database access, production migration/configuration change, manual deployment or cloud Computer creation occurred.

## Main and local-server boundary

The qualified candidate is ready for a future fast-forward of main, but current Vercel metadata makes a main push an unauthorized Production deployment. Main was not advanced locally or remotely; no deployment setting was altered. Exact qualified branch SHA, remote verification and automatic Preview outcome are recorded in the final external completion record to avoid a self-referential commit hash.

The existing owner's server on `http://localhost:3001/chat` and its local PostgreSQL are preserved. They currently run an older local snapshot (`8bc581a…`), not this candidate or current main. Replacing that server with an unmerged candidate and calling it canonical would be misleading. The isolated integration UI was qualified separately on port 3217. Canonical restart must follow resolution of the explicit main-push boundary.
