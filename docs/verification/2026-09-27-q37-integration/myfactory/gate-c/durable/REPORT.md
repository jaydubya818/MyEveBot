# Q37 MyFactory Gate C — durable consumer qualification

**Gate C: PASS locally and CLOSED. Gate B: READY FOR COORDINATION, not implemented. Independent MyEve verification: NOT_RUN. Live Factory: NOT_RUN. Readiness: NOT_READY.**

The authorized receipt storage and actual-protocol adapter replacement are complete. The explicitly approved two-line patch registers `0054_factory_result_receipts.sql` in the canonical schema manifest and refreshes only that registration's inventory fingerprint. Migration 0054 remains byte-for-byte identical to the qualified SQL (SHA-256 `722f6b24052f53cda67da755011438ceacf65aa0dfc0579d5afde998f64a6634`). The post-registration run passed canonical migration validation, all 47 PostgreSQL checks, 178 affected MyEve tests, 72 pinned producer tests, typechecks, governance and the required webpack production build. No existing database was migrated and no deployment was performed. Gate C is closed; no further Gate C features or Gate B implementation were added.

## Ownership and scope

Baseline: MyEve `f32317bc73aaaa4ca8faac2f416296bf34491620`, branch `codex/q37-integration`. Fetched origin/main remains `c8c160abab7dd7d13cdfbb9bc0924b09d2e99ae1`; no merge/cherry-pick/reset/stash. The canonical checkout and other worktrees remain independently owned. Producer remains clean at `fcd8afd6fbaa2b9045b9e9700608d546edf011a9` on `codex/q37-producer-attestation`.

**Migration: `0054_factory_result_receipts.sql`. Owner: Q37 MyFactory Gate C. Purpose: durable Factory result receipt/admission.** [Ownership inspection](migration-ownership.json) records every active worktree and branch migration scan. A fresh check immediately before writing the repository SQL found no 0054 file in another worktree or branch. A subsequent scan found no 0054 claim in the other worktrees' plan/verification documents. All existing 53 migration files match the baseline byte-for-byte. The different independently owned 0053 working copies were neither reconciled nor changed.

The changes are confined to Q37 receipt SQL, protocol/consumer/transport helpers, replacement adapter/tests, legacy candidate-decoder removal, governance additions and documentation. There is no new Work, Run, writer, approval, budget or generic evidence system. The existing hosted intake/status API remains compatible; its incompatible Linear candidate-result decoder was removed. Earlier `SYNTHETIC_LOCAL_SOURCE_PIN` fixtures remain historical regression fixtures, are not called by this consumer, and do not establish Gate C qualification.

## Durable boundary

- `engineering_factory_requests`: immutable trusted mapping of owner/Agent/Work version, generation and criteria to Factory/request/WorkOrder/exact attempt and expected immutable version/digests. Unique scoped producer operation prevents cross-Work remapping. One current receipt request per Work; replacing it makes earlier attempts historical without changing any productive writer.
- `engineering_factory_receipts`: bounded original canonical envelope, its SHA-256, locally recorded first-received time, immutable authenticated manifest and public-key provenance, stage history and terminal reason. Exact envelope redelivery is unique per request. Different deliveries remain available for forensic inspection.
- `engineering_factory_admissions`: one admission per request/operation, pointing to the exact immutable receipt/manifest and current public-key policy. A composite foreign key prevents linking a receipt from another request. This is candidate **receipt custody**, not an executable checkout or writer grant.

The narrow SQL function serializes changes on the existing Work row and Q37 request row. It never writes the Work row, protected execution state, candidate writer/session, native proof, budget, approval or publication tables. New-table direct writes and function execution are revoked from PUBLIC. Provisioning must explicitly grant the function to the trusted MyEve backend/consumer role, never the untrusted Factory coding worker. Restricted application/consumer-worker roles were tested with only required reads and function execution; direct receipt writes, Work mutation and DDL fail.

Stages are RECEIVED → AUTHENTICATED → ATTESTED → INTEGRITY_VERIFIED → ADMITTED, with REJECTED, STALE and CONFLICT terminal outcomes. INDEPENDENTLY_VERIFIED and READY are deliberately absent. Raw receipt custody commits before authentication. Signature authentication reads only an untrusted key selector before verifying against independently configured Factory keys. Correlation and manifest interpretation follow authentication. Every restart re-verifies stored bytes with current trusted keys; a trust-store outage leaves pending work retryable.

The first integrity-verified manifest freezes an operation's identity, including when stale. A different authenticated manifest is CONFLICT and cannot replace it. Exact redelivery reuses the receipt. A differently ordered transport package with the same authenticated manifest returns the original logical receipt/admission while retaining its delivery record. Unique constraints and serialized transitions enforce this across concurrent processes.

Before admission, the transaction checks current request, cancellation, Work version/generation/criteria, active Agent, active Work under Agent control, completed producer outcome, and current unrevoked/unretired/unexpired signing policy. It records the policy used and checks expiry against the database clock. Old generation, superseded/newer attempt, cancelled request, cancelled Work, human takeover, FAILED/CANCELLED producer outcome and historical keys remain non-authoritative history. Prior admitted bytes survive subsequent revocation; current eligibility becomes false. Revocation does not erase evidence or manufacture a new admission.

`projectFactoryReceipt` supplies a Q37-owned Current Truth seam with receipt/admission identity, Factory provenance, candidate/manifest identity and current eligibility. It always reports `factoryGrantedAuthority=0`, protected verification `NOT_RUN`, readiness `NOT_READY`. It does not modify the independently owned `worker-projection.ts` or `current-truth-lines.ts` UI integration.

## Exact producer contract and transport

The [producer protocol](/Users/jaywest/.codex/worktrees/q37-producer-attestation/MyFactory/docs/producer-result-protocol.md) and [producer evidence](/Users/jaywest/.codex/worktrees/q37-producer-attestation/MyFactory/docs/evidence/q37-producer-attestation/REPORT.md) are pinned at `fcd8afd`. `factory-producer-protocol.ts` copies its `result.ts` with only the signing-helper import adjusted; the Ed25519 helper preserves its domains and bytes with TypeScript key guards. [Source/evidence fingerprints](manifest.json) document provenance.

The actual contract is `MYFACTORY_RESULT_V1`: canonical signed manifest, immutable content-derived FactoryVersion, request digest, exact WorkOrder/Run/attempt, stable operation, Git commit/root-tree/patch and evidence/artifact metadata. The producer does not sign a MyEve Work ID; the trusted durable request mapping supplies that linkage. No expectation is accepted from the delivered result itself.

MyEve reuses the producer's existing authenticated, repository-scoped exact-attempt GET endpoint. The reference is the independently stored WorkOrder/Run pair plus manifest-bound artifact IDs. This endpoint returns the frozen manifest and artifact bytes together; no separate per-artifact URL is invented. The consumer uses a server-configured loopback origin and backend bearer token, denies redirects and returned URLs, bounds streaming bytes, and independently verifies hashes. The producer's existing 4 MiB per-artifact / 12 MiB signed-result limits are unchanged. A 256 KiB log was retrieved through local authenticated HTTP, durably admitted, then recovered without refetching. This qualifies the existing bounded local channel, not arbitrary-sized exports, cloud delivery or live execution.

Key rotation/revocation follows the producer's actual semantics: immutable key ID and trusted public registry, issuance windows, retained old public keys, current rejection of retired/revoked/expired keys, historical cryptographic verification without current-use authority. Receipt provenance retains the key ID, DER public-key fingerprint, public key/policy snapshot and locally recorded observation/admission times. Private keys are never persisted. A producer timestamp alone is not proof of pre-compromise observation.

The root tree and commit bytes establish their Git identities; the producer profile does not export every recursive tree/blob. These checks establish returned-byte integrity and Factory provenance, not change correctness. MyEve protected independent verification, candidate reconstruction/import and Ready remain separate.

## Qualification

[Consumer golden](consumer-golden.json) contains a real PostgreSQL receipt, trusted expected Work mapping, immutable signed provenance and admission projection. Its source is the unchanged [qualified producer golden](producer-golden.json), whose worker/checks are explicitly synthetic. Twelve concurrent deliveries produced one logical receipt/admission. No paid model, live Factory job, production database, external issue or writer transfer was involved.

| Check | Result / evidence |
|---|---|
| Actual-protocol adapter and cryptographic adversaries | 39 tests PASS, including unknown/ambiguous key, signature, Factory/version/request/WorkOrder/attempt, noncanonical bytes, manifest and all returned byte kinds, evidence/candidate substitution, Ready/authority injection, rotation/history, authenticated large readback |
| Full affected Q37 regression set | 178 tests PASS across 9 files — [regression log](regression.log); earlier synthetic tests are compatibility regressions only |
| Real PostgreSQL consumer/migration qualification | 47 checks PASS — [integration log](integration.log) |
| Fresh complete 54-migration chain | PASS in disposable PostgreSQL 17 |
| Populated supported 0053 → 0054 | PASS; every pre-existing table/data snapshot preserved |
| Injected failure rollback and rerun | PASS; new DDL and migration ledger roll back; rerun no-op |
| Restricted application/consumer-worker roles | PASS; direct receipt/Work/DDL mutation denied |
| Concurrent exact and conflicting deliveries | PASS; one admission, explicit conflict, no silent overwrite |
| Process loss | PASS: separate Node process SIGKILL after each of RECEIVED, AUTHENTICATED, ATTESTED, INTEGRITY_VERIFIED and ADMITTED; new consumer resumes saved bytes, then two replays reuse the admission |
| Database cross-Work foreign key | PASS independently of application checks |
| Existing migration checksums | PASS; all 53 unchanged |
| Canonical migration registration | **PASS — 54 ordered migrations** — [migration check](migration-check.log). The [pre-registration failure](migration-check-before-registration.log) is retained as history. |
| MyEve typecheck | PASS — [log](typecheck.log) |
| MyEve production build | PASS with supported webpack mode — [log](build-webpack.log). Default Turbopack fails on existing out-of-root dependency symlinks — [retained failure](build-turbopack.log) |
| Producer supervisor/protocol/storage tests | 72 PASS, zero skips — [log](producer-tests.log) |
| Producer web + strict producer typecheck/build | PASS in an exact `git archive fcd8afd` disposable checkout with lockfile dependencies — [web types](producer-typecheck.log), [strict types](producer-strict.log), [build](producer-build.log). Offline installation lacked one cached package; normal lockfile installation succeeded. Producer worktree unchanged. |
| Governance | PASS: 647 sources, UNKNOWN=0 — [log](governance.log). Producer governance also PASS, two new sources, UNKNOWN=0. |

Earlier test development found a missing constant import, a TypeScript key-union narrowing issue and a disposable-database forced-cleanup race. These were corrected and the final runs above completed successfully. The temporary database cleanup now waits for its own connections to close without terminating other connections.

Governance changes: only the explicitly authorized existing `lib/engineering/factory-authenticated-result.ts` and `lib/database-schema.ts` fingerprints refreshed; both classifications/reasons preserved. Five new Q37 sources added. Removing those five additions and reversing the two authorized SHA replacements reconstructs the original inventory byte-for-byte. Unrelated entries changed = 0. [Exact governance change record](governance-changes.json).

## Final requested matrix

| Requirement | Result |
|---|---|
| Q37 Factory receipt migration | 0054 — `0054_factory_result_receipts.sql` |
| Migration ownership | PASS |
| Migration qualification | PASS, including canonical registration and all PostgreSQL checks |
| Real producer protocol | PASS |
| Durable receipt / admission | PASS locally |
| Process restart / exact replay | PASS |
| Conflict detection / stale result | PASS |
| Key rotation / revocation | PASS |
| Large artifact channel | PASS, existing bounded authenticated local channel |
| Complete attempt golden case | PASS locally with synthetic producer execution |
| Unauthenticated admissions | 0 |
| Factory-granted writer/publication/approval/Ready authority | 0 |
| Duplicate admissions / silent conflict acceptance / cross-Work attachments | 0 |
| False Ready | 0 |
| Existing governance entries changed | `lib/engineering/factory-authenticated-result.ts` and `lib/database-schema.ts` fingerprints only, explicitly authorized |
| Unrelated governance entries changed | 0 |
| README updated | PASS |
| Gate C | PASS locally — CLOSED |
| Gate B | READY FOR COORDINATION — not implemented |
| Independent MyEve verification / live MyFactory | NOT_RUN |

## Registration closure and Gate B boundary

The [originally prepared two-line patch](pending-manifest-registration.patch) has been applied exactly as approved. The SQL itself changed by 0 bytes. Both authorized fingerprints match the actual source bytes. [Post-registration validation](validation.json) records the rerun counts, exit codes and zero safety counters. The retained Turbopack failure is an environment/tooling limitation caused by pre-existing out-of-root dependency symlinks; no dependency layout was changed to conceal it. The supported webpack build passes.

Gate B is not implemented and is now ready for owner coordination because Gate C passed. The [existing handoff contract](../REQUIRED-CONTRACT.md#writer-handoff-required-contract) must be implemented only with its owner. Ownership dependencies remain Work version/control and execution fencing (`store.ts`, `execution-store.ts`, `types.ts`, `runtime.ts`); route admission/handoff (`route-admission.ts`, `routing-store.ts`, `native-routing.ts`); native in-flight reconciliation/shared budget (`native-model.ts` and the common ledger); candidate import and protected verification (`native-completion.ts`, `native-api.ts`, `agent/tools/engineering_direct.ts`, `direct-verification-driver.ts`); and owner Current Truth integration (`worker-projection.ts`, `current-truth-lines.ts`). Any future Factory/native writer transition needs that owner's shared CAS/fence/session contract. No message, grant, handoff, live qualification or protected writer change occurred here.
