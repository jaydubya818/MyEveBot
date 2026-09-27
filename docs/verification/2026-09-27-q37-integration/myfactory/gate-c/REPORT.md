# MyFactory Gate C — bounded offline candidate-return qualification

> Current producer/consumer assessment: [consumer migration stop](consumer/REPORT.md). Producer `fcd8afd` is locally qualified; the earlier consumer below uses a different wire contract. Its tests do not qualify consumption of the new producer. The historical record below is preserved.

**Gate C: PARTIAL / NOT QUALIFIED. Gate B: CONTRACT DEFINED, NOT IMPLEMENTED. Live MyFactory: NOT_RUN. Digital Worker readiness: NOT_READY.** The continuation stopped before a required MyEve schema migration, as instructed.

This continuation starts from MyEve `56e5f30d91694e87f55234307cf946bc6a2b9772` on `codex/q37-integration` (the local checkout also contained documentation commit `63131a8`). MyFactory started at `543906dc20fefed2def97e43953095ea0b7c60bc` on `codex/local-factory`; the Gate C implementation is on `codex/q37-gate-c`. The previous read-only finding is preserved in [PRIOR-AUDIT.md](PRIOR-AUDIT.md). No live MyFactory execution, external issue, writer transfer, production deployment, or M1/ER1-owned writer mutation occurred.

## Implemented and exercised locally

| Boundary | Evidence | Result |
|---|---|---|
| Authenticated request binding | Optional HMAC-protected owner/Agent/Work/version/generation/criteria/submission/Factory pin, stored with originating client and WorkOrder; conflicting replay rejected | PASS in protocol and storage fixtures |
| Actual FactoryVersion capture | Clean installed Git commit/tree and effective model, agent/skill version, worker/verifier/check/scope/input configuration digest captured before hosted work; expected pin mismatch fails closed | IMPLEMENTED; no real hosted worker run in this qualification |
| Candidate/evidence/artifact export | Saved completed attempt, exact Run, candidate Git object/tree, patch reconstruction, check records, log/patch byte hashes and size limits | PASS with a real temporary Git candidate and saved SQLite records |
| Result authentication and transport | Distinct Ed25519 `MYFACTORY_RESULT_V1` block in the original HMAC-authenticated Linear issue; bounded readback through originating-client loopback route; re-read reconciles a lost response | PASS in local protocol and producer fixtures; no live Linear delivery |
| MyEve receipt projection | Q37 adapter checks trusted Factory pin, signed request/result, WorkOrder/Run/attempt, check list and current Work generation; never grants authority or Ready | PASS in synthetic consumer fixtures |
| Replay and mutation | Frozen producer bytes survive artifact mutation; conflicting storage save fails; wrong signer, changed artifact, wrong version/attempt, stale Work and lost readback are denied or non-authoritative | PASS in focused fixtures |
| Key lifecycle | Trusted activation/retirement/revocation registry and durable observed-time admission are absent | FAIL / REQUIRED |
| Durable consumer admission | Concurrent consumers, restart and conflict decisions are not persisted in a Q37-owned receipt; writer-side admission belongs with M1/ER1 | FAIL / COORDINATION REQUIRED |
| Full affected suite | MyFactory workspace suite passes with loopback socket access; MyEve adapter TypeScript/Vitest pass | PASS locally |

The producer fixture uses a real temporary Git repository: it commits a base and candidate, exports `git show --binary`, stores one check log, freezes the result, verifies the Ed25519 block and candidate identity, then mutates the original log and confirms replay returns the previously frozen bytes. This is stronger than the earlier synthetic candidate fixture, but it does not prove a live hosted run or provider delivery. The signed result is a claim by a trusted software supervisor, not hardware attestation. MyEve still needs independent protected verification of the imported exact candidate.

**Earlier executed commands (preserved):** MyFactory `npm test` passed all workspace suites: supervisor 42/42, agent 9/9, app builder 8/8, hosted routing 7/7, storage 10/10, verification 6/6. The supervisor suite requires loopback socket access; a sandboxed run showed `EPERM` for nine HTTP tests, then the same suite passed 42/42 with local socket permission. A top-level Vercel SDK import stalled the first hosted-intake run; lazy loading those SDKs only during connector authorization fixed startup and the intake test passed. The clean-install `captureFactoryVersion` check confirmed stable Factory ID/source commit and a different configuration digest after changing the model. MyEve `vitest run lib/engineering/factory-authenticated-result.test.ts --maxWorkers=1` passed 3/3, and `tsc --noEmit --incremental false` passed. MyFactory `npm run typecheck` and `npm run build` were attempted after the tests, remained in the unrelated `@factory/web` TypeScript step without output, and were interrupted; neither was reported as passing at that time. No live tests were attempted.

## Gate decision and owner boundary

The bounded authenticated candidate-return transport and FactoryVersion path exist, but **Gate C does not pass the complete required contract** while key lifecycle, durable admission and the unresolved integration test remain. A signed result has `authorityGranted=false`, independent verification `NOT_RUN`, and readiness `NOT_READY`. No candidate is imported into MyEve production custody. The size-limited Linear issue channel fails closed for larger candidates; a separate authenticated artifact channel is needed before general use.

The [Gate B single-writer handoff contract](REQUIRED-CONTRACT.md#writer-handoff-required-contract) is defined as a reviewable interface: one Work generation, one fenced productive writer, terminal remote reconciliation before reacquisition, immutable result observation, and protected candidate import only after Factory authority closes. It is **not implemented or granted**. M1/ER1 owns the shared writer persistence and transitions. Coordination with that owner is required before changing its files; no protected writer file or migration was changed here. The current Gate B contract must be reconciled with the owner's latest branch before implementation.

**Safety counters for this offline tranche:** live Factory runs 0; writer grants 0; unauthorized candidate admissions 0; false Ready transitions 0. These are counts of this work, not live qualification claims.

## Continuation at MyFactory `75edab5` and MyEve `2ff67e1`

### Build diagnosis and resolution

The original MyFactory checkout again stalled in `@factory/web` TypeScript. A 60-second standalone `tsc --noEmit --extendedDiagnostics` produced no completion; standalone `vite build` also timed out after 30 seconds. A TypeScript trace showed dependency traversal in `node_modules`; process sampling found it waiting in a filesystem read with `node_modules/source-map-js/package.json` open. A source-tree copy via `rsync` likewise stalled while reading `node_modules/@types/react-dom/static.d.ts`. This points to the **original dependency tree/filesystem environment**, not a demonstrated source or test failure; the exact OS cause remains unknown. The earlier incomplete runs remain part of this record.

A disposable checkout under `/private/tmp/q37-build-fixture` was assembled from the pinned MyFactory `apps`, `packages`, `package.json` and lockfile. `apps/web/src`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, and `packages/contracts/src` compared byte-for-byte with the original checkout; both lockfiles had SHA-256 `8d13a359805be8b5c834573319c49dfc09600fa6c679cfdde7910751a00bd839`. `npm ci --offline --ignore-scripts --no-audit --no-fund` installed from the local cache. In that clean checkout, `npm run typecheck` **PASS** and `npm run build` **PASS** (Vite 8.3.1, 28 modules transformed). The original checkout's `node_modules` was not replaced. Classification: **ENVIRONMENT** for the original incomplete commands; product typecheck/build **PASS in the clean equivalent checkout**.

### Durable admission schema stop

Current MyEve migration is `0053_native_completion_contract.sql`; migrations 0051–0053 belong to the M1/ER1 lineage. Existing `engineering_route_runs` (0042) records only route/status/provider and has no immutable signed result, operation/digest uniqueness, staged receipt, or artifact identity. `engineering_direct_workspaces` (0047) and `engineering_direct_verification_jobs` (0048) are DIRECT candidate/verification custody and protected writer surfaces. `task_artifacts` (0002) and `action_receipts` (0023) are tied to task/action runs, not the owner/Agent/Work generation and Factory attempt. Reusing any of these for Factory admission would blur ownership or lack exact replay/conflict constraints.

A **new Work-owned Factory result receipt/admission migration is required**. It must bind owner/Agent/Work version and generation, request/WorkOrder/Run/attempt, result operation and manifest digest, Factory/key identity and version, original signed bytes, first observed time, staged status history, artifact identities/digests, and unique operation/conflict rules. The persisted state must distinguish RECEIVED, AUTHENTICATED, ATTESTED, INTEGRITY_VERIFIED, ADMITTED, INDEPENDENTLY_VERIFIED, REJECTED, STALE and CONFLICT. This is a requirement, **not a reserved migration number or implemented schema**. No migration or protected writer file was created or changed. Work stopped at this boundary per the continuation brief.

The governance check initially found the prior Q37 result adapter unclassified and the changed contract fingerprint stale. Only those two inventory entries were added/updated; `check-executor-governance.ts` now reports **642 classified sources; UNKNOWN=0**. No new executable source was introduced in this continuation.

### Unrun Gate C checks and safety

Trusted signing-key rotation/revocation and historical compromise semantics, large authenticated artifact transport, durable admission/restart/replay, and the complete local Golden Case remain **NOT_RUN / NOT QUALIFIED** after the schema stop. The small inline manifest path and earlier tests retain their prior limited results. There was no live Factory run, producer dispatch, candidate attachment, independent verification, Ready transition or writer grant. The [Gate B contract](REQUIRED-CONTRACT.md#writer-handoff-required-contract) remains design-only and was not implemented.
