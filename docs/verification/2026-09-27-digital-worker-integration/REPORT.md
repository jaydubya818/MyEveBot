# Canonical Digital Worker integration — PASS

The combined local baseline on `codex/digital-worker-integration` is qualified. **Gate C remains PASS / CLOSED. Gate B is pending and ready to implement only from the final integration commit.** This tranche adds no writer handoff, Factory dispatch or live execution. M1 live remains **NOT QUALIFIED**; live MyFactory and independent verification of Factory output remain **NOT_RUN**.

## Canonical commit identity

The canonical integration SHA is the merge commit introducing this dossier, with parents `90d668f76b5156a304906522295180515cfe85d4` and `96ae446e1f0f69e57fa2b9a2b6c5de3b3b1b083d`. The final completion report records the resulting full SHA. Resolve the immutable introduction commit from this repository, including after future branch advancement:

```sh
git log --first-parent --diff-filter=A --format=%H -- docs/verification/2026-09-27-digital-worker-integration/REPORT.md
```

This self-resolving identity avoids embedding a circular or pre-commit SHA. Gate B must start from that resulting commit, not from a moving owner branch, the former Q37 checkout, remote legacy Q37, or the dirty Digital Worker worktree.

## Frozen inputs and ownership

| Input | Exact commit / disposition |
|---|---|
| M1 implementation | `90d668f76b5156a304906522295180515cfe85d4` |
| M1 documentation and live evidence | `78b6befb1139b8bf9b3b806f8bbef2fbb6408e90`; documentation only |
| Qualified Gate C and dependencies | `96ae446e1f0f69e57fa2b9a2b6c5de3b3b1b083d` |
| Real producer protocol | `fcd8afd6fbaa2b9045b9e9700608d546edf011a9` |
| Legacy SQL provenance | `83402ead63dc5565ea271f6410ff3ac1fd19fd8d`; only its migration is imported/renumbered |
| Older dirty `codex/digital-worker-mvp` | 30 differing implementation files superseded, zero required missing, one historical/documentary difference retained with its owner |

The approved reconciliation is retained in the [file classifications](reconciliation-m1-classification.json), [worktree migration ownership](reconciliation-worktree-migration-ownership.json), and [ref migration claims](reconciliation-ref-migration-claims.json). These are dated observations; owner branches may advance independently. Later owner implementation is not silently included. Main, M1/ER1, old Digital Worker, Q37 and producer owner checkouts, and retained databases were not modified by integration.

[Source manifests](qualified-source-manifest.json) verify every M1 governed implementation file, except the explicitly updated schema-version constant, against its pinned input. The nine added Gate C governed files and shared MyFactory protocol match the qualified Gate C input. [Producer verification](producer-source-verification.json) confirms 296 regular files and two symlink targets in the disposable producer archive match the pinned commit. The old incompatible remote adapter is not imported.

## Migration lineage

The canonical sequence is **0001–0052 → qualified native 0053 → Gate C 0054 → legacy 0055**. The [complete 55-file manifest](migration-lineage.json) records every source commit, original filename and checksum. No SQL bytes changed.

| Migration | SHA-256 | Status |
|---|---|---|
| `0053_native_completion_contract.sql` | `1f3fd2316758e547608fb4e23480105d1ce3a1dcb93a04a4c5be69841f2c5a53` | PASS / unchanged |
| `0054_factory_result_receipts.sql` | `722f6b24052f53cda67da755011438ceacf65aa0dfc0579d5afde998f64a6634` | PASS / unchanged / Q37 Gate C durable receipt admission |
| `0055_engineering_factory_results.sql` | `a431db228036cc6fd07128db861c99ee4add2de6afe43f1ec5a4c32b83df2141` | PASS / renamed from remote legacy 0054; SQL unchanged |

0054 and 0055 retain separate schemas and SQL boundaries. The real producer consumer uses qualified 0054. Qualifying the legacy 0055 SQL does not qualify its old adapter, grant dispatch authority, or replace the current producer protocol.

The [11-check 0055 qualification](0055.log) proves fresh 55-chain installation, populated 0054→0055 preservation (including authenticated Gate C history and function definition), injected transactional rollback, exact rerun, existing Gate C replay after upgrade, legacy concurrency/conflict/restart transitions, restricted application and worker roles, and zero writer/Run/budget creation. [Canonical migration validation](migrations.log) passes all 55 registrations. [0053 qualification](0053.log) covers fresh install, populated 0052 upgrade, failure rollback/rerun, restricted roles and restoration of the pre-existing offline checkpoint into disposable databases; 0053's specific upgrade gate intentionally stops at 0053.

All new SQL qualification ran on a task-owned cluster at `127.0.0.1:55479`, with generated disposable databases. The existing offline checkpoint dump was read only; the retained database on port 55468 was never connected by these tests. Its preserved historical rows were verified in a disposable restored clone. No migration was applied to a retained or live database. All task test databases were removed and the task-owned cluster was stopped after qualification.

## Combined qualification

| Check | Result | Evidence |
|---|---|---|
| Full app suite with authenticated PostgreSQL controller tests enabled | 1,516 passed; 40 existing skips; 176 files passed | [app tests](app-tests.log) |
| Root security/regression | 151 passed; zero skipped | [root tests](root-tests.log) |
| Gate C PostgreSQL | 47 passed, including all durable stages/restarts; consumer checks run with 0055 installed | [Gate C checks](gatec.log), [consumer golden receipt](consumer-golden.json) |
| Real pinned producer | 72 passed; strict producer + web typechecks and producer governance pass | [tests](producer-tests.log), [strict types](producer-strict.log), [workspace types](producer-typecheck.log), [governance](producer-governance.log) |
| M1 native completion and restart | PASS; unchanged $1.30 bound, contention, stale bindings, hold/call quotas, restricted roles, real SIGKILL and protected Docker FAIL→repair→PASS→PARTIAL→fresh explanation | [native completion](native-completion.log), [telemetry](native-telemetry.json) |
| Authenticated productive controller and repair context | PASS on the same integrated source | [controlled journey](native-controller-controlled.json), [exact live-failure fixture](native-controller-exact-live-failure.json), app tests |
| Route admission | PASS on isolated rerun | [admission](route-admission.log) |
| Work context / Work↔Chat parity | PASS | [work context](engineering-work-context.log), app Current Truth/shared projection regressions |
| Worker projection and protected verifier | PASS | [projection](worker-projection.log), [verifier](engineering-direct-verifier.log) |
| Historical Work projection | PASS; all 119 public tables unchanged in disposable checkpoint clone | [historical projection](historical-projection.log) |
| TypeScript, capabilities, skills, governance | PASS; 649 classified sources; UNKNOWN=0 | [typecheck](typecheck.log) |
| Production webpack build | PASS | [webpack build](webpack.log) |

Native local results remain **PARTIAL**, despite protected checks passing. Publication, CI, independent review and owner acceptance are not established. The imported [90d668f live M1 report](../2026-09-27-m1er1-90d668f-live/REPORT.md) remains **NOT QUALIFIED**: bounded repair context succeeded, but stale revision repair proposals were denied and the session exhausted its step limit. No new live provider calls occurred in this integration qualification.

## Cross-boundary proof

The new [integration test helper](../../../apps/eve/test/integration-authority-boundary.mjs) runs inside the real native completion journey, after actual native admission. It registers and authenticates a pinned signed Factory result bound to the **same Work, version, generation and Agent**. Every non-Factory public table is snapshotted before receipt arrival and compared afterward. Writer identity, native Run, budget, approvals, publication and protected verification remain byte-equivalent; the Factory receipt explicitly returns `factoryGrantedAuthority=0`, `NOT_READY`, and `independentVerification=NOT_RUN`.

The native failure, repair, protected verification, immutable PARTIAL result and fresh explanation then run. Every Factory public table remains unchanged, including signed history and both legacy/current receipt stores. Native proof records use trusted-verifier evidence for the native candidate and do not reuse the Factory candidate as independent verification. The [native log](native-completion.log) contains both assertions: **cross-boundary authority violations=0; false Ready=0**. This exercises both directions on one integrated source and one Work, rather than inferring isolation from separate suites.

## Governance scope

[Exact entry changes](governance-changes.json): nine Gate C-owned additions copied byte-for-byte from 96ae446; one `lib/database-schema.ts` fingerprint refresh for the actual 0055 registration. Its existing classification/reason remain unchanged. All other M1 inventory entries and top-level inventory metadata are byte-for-byte unchanged. Removed entries=0; unrelated entries changed=0; UNKNOWN=0. No M1 owner inventory is written.

## Reproduction and limitations

Commands used from the new worktree:

```sh
# apps/eve
ADMISSION_CONTEXT_TEST_POSTGRES=1 NATIVE_CONTROLLER_EVIDENCE=/private/tmp/dwi-native-controller ../../node_modules/.bin/vitest run --maxWorkers=1
node scripts/migrate-database.ts --check
NEXT_TELEMETRY_DISABLED=1 node ../../node_modules/next/dist/bin/next build --webpack
npm run typecheck
# repository root, with the new disposable PostgreSQL cluster running
node --import tsx --test apps/eve/test/*.test.mjs
Q37_GATE_C_EVIDENCE=/private/tmp/dwi-gatec node --import tsx apps/eve/test/factory-receipt.integration.mjs
node --import tsx apps/eve/test/legacy-factory-migration.integration.mjs
NATIVE_COMPLETION_TELEMETRY=/private/tmp/dwi-native-telemetry.json node --import tsx apps/eve/test/native-completion.integration.mjs
GAP2B_CHECKPOINT=/private/tmp/gap2-retained-0051-quiescent-1790464450316.dump node --import tsx apps/eve/test/native-completion-migration.integration.mjs
GAP2B_CHECKPOINT=/private/tmp/gap2-retained-0051-quiescent-1790464450316.dump node --import tsx apps/eve/test/gap2b-projection.integration.mjs
```

The four additional SQL scripts are `route-admission.integration.mjs`, `engineering-work-context.integration.mjs`, `worker-projection.integration.mjs` and `engineering-direct-verifier.integration.mjs`, each run using `node --import tsx apps/eve/test/<name>`. Test-only port guards/defaults now target this task's disposable 55479 cluster; they do not access the retained 55468 cluster. Factory consumer fixtures qualify the original 0053→0054 transition before installing 0055 for combined consumer checks. Existing runtime bytes are unchanged.

The 40 skips are the existing gated remember-gateway (1), pending-action-continuation (20) and Relay owner model-budget (19) integrations. The 16 authenticated native controller PostgreSQL tests were explicitly enabled and passed. The obsolete pre-completion-contract `engineering-native-host.integration.mjs` and old `engineering-direct.integration.mjs` fixtures retain their previously documented incompatibilities; they were not rewritten or claimed as passing. Current completion/controller/verifier tests provide the applicable local qualification.

The default Turbopack out-of-root dependency-symlink failure remains an **environment/tooling limitation**, with its [prior exact log](../2026-09-27-q37-integration/myfactory/gate-c/durable/build-turbopack.log). Only the isolated new worktree's dependency links were created; no owner's dependency layout was modified. The required webpack production build passes. Existing build warnings and pg client-query deprecation output remain in logs.

Two setup/cleanup failures are retained honestly: the first native restart attempt stopped at a child-process guard still naming 55468; changing that test-only guard to 55479 made the full rerun pass. Route-admission's [first attempt](route-admission-first-attempt.log) passed all assertions but exited during connection teardown (`57P01`); its isolated rerun passed without a code change. Producer governance initially lacked Git metadata in the archive ([initial log](producer-governance-first-attempt.log)); supplying the pinned producer repository's Git metadata read-only for `ls-tree` made it pass without changing producer source. [Raw-log provenance](raw-log-provenance.json) records original hashes; committed console copies only strip trailing whitespace and trailing blank lines. Imported M1 live evidence stays byte-exact, including an existing trailing-space line in its `server.log`; that inherited diff-hygiene warning is preserved rather than modifying owner evidence.

[Machine-readable validation](validation.json), [artifact hashes](artifact-hashes.json) and the source/migration manifests bind this evidence. **STOP after committing this baseline.** No automatic Gate B implementation, live qualification, main merge or push is authorized by this result.
