# Deployed migration lineage reconciliation

Result: **DEPLOYED MIGRATION LINEAGE RECONCILIATION QUALIFIED** — source and isolated PostgreSQL qualification only. This is not authorization to migrate or deploy.

## Baseline and root cause

- Canonical source: `88370d0662c7824445b59779a8b8e8b21abfa10b`.
- Known deployed lineage: `396631afa4739e5ca8ac0c5c81781f82f3160403`, through `0029`.
- Production and Preview were verified at canonical `88370d0`, sharing Neon project `divine-rice-79337791`, database `neondb`, schema `public`.
- The prior read-only ledger observation was 2026-09-20 19:25 UTC. Applied checksums matched the complete feature lineage. Canonical expects `0030`; four historical files differ.
- Root cause: application source and database migration history came from different Git lineages. Two differences are whitespace; two change schema/data semantics. Feature `0026` already supplies both canonical `0030` objects.
- Dedicated local branch: `codex/migration-lineage-reconciliation`, based on exact canonical SHA. No historical migration file `0001–0030` is changed.

The shared database was queried only with `BEGIN READ ONLY` for aggregate file-owner and approval metadata in this work order. It contained **zero files** (`web:owner=0`, `owner=0`, other owners=0) and **zero approval rows**. No row ownership can be inferred from an empty inventory. Deployed configured owner remains `owner`; primary Agent is Sofie (`agent_e0954312-6a71-4727-a915-f1484a0b8736`). The separate local `jay` owner must never be used as a deployment backfill default.

## Exact historical checksum comparison

| Migration | Feature/deployed SHA-256 | Canonical SHA-256 |
|---|---|---|
| 0017 | `a73bc6d7a9d8fd7c884262bd2a753ca100bece8101c3800b1e4427e554a5df43` | `fa2e6e980737f4f287213deae3963a7ac37d2b1debc14a66a1025ad82cf97e34` |
| 0019 | `e056373e3666885234b0d8122e56fb0ecf102535325f62160d2f1747420fe51e` | `cb4fa7220678020c9bb93afe3dbf9246d809d694146edbb4669a67505ac86a98` |
| 0020 | `250ecf12643b8970207f27f860d925a131da2a94eb738a866c3f959f48f0c555` | `beebe4d1f44f95ef3d236d13964cd00d7c308182d591634953e4cc2c2dd94323` |
| 0026 | `52dac6edbaf95873f76fa04cb5723e8a354580a34cc20889d21d2c669e95aca4` | `9b3cd379b75e83a508fa6ef889a25ecee8a18a55620a7bf33889cc87a4b870ca` |

| Migration | DDL, constraints, indexes and backfill differences | Deployed vs canonical consequence | Reconciliation required |
|---|---|---|---|
| 0017 | Feature creates/adds `owner_id text NOT NULL DEFAULT 'web:owner'`. Canonical creates nullable text, drops default and NOT NULL, and changes `web:owner` to NULL. Same table, indexes and size check. | Feature omitted-owner writes inherit a placeholder invisible to `WHERE owner_id='owner'`. Canonical SQL leaves ownership unresolved. Canonical's old runner and runtime subsequently assigned every unresolved row to the calling/deploying owner and set NOT NULL: unsafe for multiple owners. | **YES**, thread-proven attribution with audit; remove default and NOT NULL; remove blanket runtime/runner claims. |
| 0019 | A trailing blank line only. Identical `task_runs` status constraint replacement. No different columns, indexes or backfill. | Same Agent Control Center states/constraints. | **NO DDL**; exact historical checksum recognition required. |
| 0020 | A trailing blank line only. Identical approval columns, Run-derived owner/Agent backfill, `legacy:<id>` binding, 24-hour historical expiry, decision-derived status, constraints and owner/status index. | Same historical approval data semantics. Migration completion cannot create valid exact Action authority. | **NO DDL/data rewrite**; exact checksum recognition and runtime authority tests required. |
| 0026 | Feature additionally adds `approval_generation integer NOT NULL DEFAULT 0` and unique partial `action_requests_live_binding`; canonical defers those exact objects to 0030. Recovery fields and expanded status constraint otherwise identical. | Feature already has canonical 0030 semantics. Generation defaults/backfills to zero; no additional generation CHECK in either lineage. Existing generations and recovery receipts must be preserved; the isolated fixture verifies a nonzero generation of 7 remains unchanged. | **NO duplicate objects**; verify exact semantics and attest equivalence. |

## Structural comparison and 0030

Independent local databases were built from exact committed SQL: A canonical through 0030, B feature through 0029. Full `pg_dump --schema-only --no-owner --no-privileges` comparison covered every table, column/order/type/nullability/default, index, primary/unique/check/foreign-key constraint, sequence, trigger and function. Only random pg_dump restrict tokens were removed. PostgreSQL object ownership/ACLs are environment administration settings and intentionally excluded.

The starting schemas contain 77 tables, 84 explicitly created indexes, 89 foreign keys, 202 check constraints, two triggers and two functions. **The only structural difference is `chat_files.owner_id` default/nullability.** After 0031 both complete schema dumps are identical, including the two new audit tables. See [structural diff](migration-lineage-evidence/structural-diff.patch), [comparison hashes](migration-lineage-evidence/structural-comparison.json), and [qualification output](migration-lineage-evidence/qualification.txt).

| Canonical 0030 statement | Semantic classification on deployed lineage | Literal execution | Resolution |
|---|---|---|---|
| Add `approval_generation integer NOT NULL DEFAULT 0` | **ALREADY SATISFIED** | **INCOMPATIBLE**: duplicate column | Check type, nullability, default, identity/generated flags and nonnegative existing values; preserve all values. |
| Create unique partial `action_requests_live_binding(owner_id,run_id,parameter_hash)` | **ALREADY SATISFIED** | **INCOMPATIBLE**: duplicate relation | Check intended table/schema, uniqueness, validity/readiness, btree method, three exact keys, no included/expression columns, NULL semantics and exact live-status predicate. Preserve it. |

No blanket `IF NOT EXISTS` is introduced. Wrong same-name index/default fixtures fail closed. Live statuses are planned, awaiting_approval, authorized, executing, verifying, result_unknown, recovering, needs_you and retryable. Both histories therefore reject competing live bindings identically.

## Ledger and forward migration design

**0031 was the next unused migration number at the pinned base.** The implementation uses `0031_deployed_lineage_reconciliation.sql` plus a small migration-runner module and an immutable JSON manifest of all 29 feature checksums.

1. Read and validate the entire ledger before applying pending migrations. Normal canonical prefixes remain supported, including a fresh database.
2. A mismatch is accepted only when every one of the 29 historical entries exactly matches the known feature manifest. Mixed canonical/feature hashes, holes, unknown files and unknown checksums fail. Later entries must match canonical exactly.
3. For that one origin, do not execute or insert an applied ledger entry for 0030. Verify its existing objects inside the locked 0031 transaction.
4. In the same transaction, apply 0031 and insert its normal checksum ledger entry plus `sofie_migration_reconciliations(id='0031')`: exact origin, original ledger snapshot including timestamps, and the exact canonical 0030 checksum marked *semantically satisfied*, not historically executed.
5. Existing ledger names, checksums and timestamps remain unchanged. A canonical origin has its real 0030 entry and an empty satisfied-migration map.
6. Reruns require the marker and 0031 ledger row to agree, validate the complete source-history evidence, and recheck binding/file-schema semantics. A partial marker, forged 0030 entry on the feature lineage, changed index/default, or unknown checksum fails closed.
7. Future canonical migrations use normal exact checksum validation. A harmless in-memory 0032 fixture proved this for both origins; no real 0032 migration was added.

Migrations use 5-second lock and 30-second statement timeouts. The ledger is locked and compared again with preflight before mutation. 0031 locks `action_requests`, `chat_files`, and `web_chat_threads` while validating and writing its evidence. Ownership correction, audit rows, marker and 0031 ledger commit atomically. Directly applying SQL files without the runner is unsupported: it cannot establish the lineage receipt.

The semantic index catalog check is qualified on PostgreSQL 17.9 and uses PostgreSQL 15+ catalog fields. Verify the actual server version before a future authorized deployment.

## Owner reconciliation

Eligible rows are only files with `owner_id IS NULL` or `owner_id='web:owner'`. Their exact `thread_id` must join a durable `web_chat_threads.id` whose owner is nonempty and is not `web:owner`. The authenticated deployment's owner setting alone is **not** proof. Files for another proven thread owner remain with that owner, not `owner`.

- Proof: durable file-to-thread relation and that thread's owner, under locks. Before a Production authorization, inspect provenance of any newly appearing legacy rows and verify those associations are trusted; the current authorized shared inventory has none.
- Explicit owner rows are preserved. An explicit file/thread owner conflict aborts rather than overriding either value. Explicitly owned orphan files are preserved; they are not candidates for inference.
- Missing threads, empty/placeholder thread owners or explicit conflicts abort the entire migration. No fallback to local owner, Agent name, filename or storage URL exists.
- Each eligible change records file ID, thread ID, prior owner, resolved owner, proof rule and timestamp in `sofie_file_owner_reconciliations`; no file content or credentials are copied.
- Remove the legacy default and NOT NULL to converge with canonical SQL. Application writes already supply authenticated owner IDs. An omitted-owner SQL write now yields NULL, never `web:owner`; reads do not silently claim it.
- File listing and Owner Data export no longer bulk-assign legacy rows or tighten nullability during a read.
- Fixtures prove `web:owner`/NULL rows resolve separately to `owner` and `sarah`, explicit rows retain ownership, cross-owner visibility stays isolated, and ambiguous/conflicting fixtures roll back without partial audit/schema changes.

Recovery is forward-only. A failure rolls back 0031 completely. For a later discovered attribution error, retain both audit tables and historical ledger, investigate provenance, and use a separately approved corrective migration with compare-and-set checks against the still-current resolved owner/thread. Never blindly replay old owners, delete ledger history, or grant authority as part of recovery. Use a verified database snapshot/PITR recovery plan before any authorized shared migration.

## Authority and semantic qualification

- **Approval safety PASS; historical approval executable after reconciliation: NO.** Pre-0020 approved/rejected/expired/pending fixtures run through the original 0020 migration. Reconciliation does not modify approval rows, decisions, bindings, expiry, owner, Action state or attempts. Legacy `legacy:<id>` bindings remain unusable.
- Gateway hardening makes the full requirement explicit at both durable claim and handle consumption: owner, Run, exact Action request identity (including attempt and approval generation), binding hash, Agent, capability, Action class/action, approved status **and decision**, future expiry, and fresh current authority. The request-ID algorithm itself is unchanged. Genuine current exact approvals pass the synthetic positive control; wrong-owner/Run/class/capability/decision/binding/generation/status/expiry and post-claim revocation fail before the provider.
- **Action live binding equivalent: YES. Correction: NONE.** Existing index and generation survive; invalid lookalikes fail.
- Pending sends, saved drafts, Run links, recovery state and provider receipts are preserved. Recovery tests still require authoritative non-execution evidence plus fresh approval before a retry.
- Legacy Routine fixture stays disabled/unreviewed, `canRun=false`, with no reviewed version. Admission tests retain zero Run/model/provider/Computer work on missing dependencies and no replay after reconnect.
- Stale nonterminal Computer sessions and control rows remain historical records. The actual Gateway one-use boundary rejects their expired sessions; no provider execution occurs. No lease/session expiry is renewed.
- Federation grants remain unchanged; Federation remains disabled by default. Phone remains disabled/unqualified. No migration changes either gate.
- All 17 seeded authority/data groups were compared before/after and stayed identical, apart from explicitly audited file ownership in its separate assertions. Fixtures include owners/primary Agents, files, Goals, Knowledge, threads, Runs, historical approvals, Actions, Computer/control, Browser Profiles/grants, Routines/reminders/versions, Federation grants and pending sends.

## Regression and evidence

| Check | Result |
|---|---|
| Canonical origin | PASS |
| Deployed feature origin | PASS |
| Entire final schemas equivalent | PASS |
| Fresh canonical database | PASS |
| Canonical old-runner NOT NULL variant | PASS |
| Owner proof, visibility, isolation | PASS |
| Ambiguous/conflicting owner rollback | PASS |
| Historical approval and stale Computer rejection | PASS |
| Exact modern approval positive/negative matrix | PASS |
| Future migration and rerun | PASS |
| Unknown checksum, mixed/partial history, marker tampering | PASS |
| Wrong index/default and later schema drift | PASS |
| Unit | 605 passed, 87 files; includes 14 runner regression cases |
| Core contracts | 134 passed |
| PostgreSQL | New two-origin harness plus execution-reliability, action-upgrade and routine-integration-upgrade suites passed |
| Action Gateway / recovery / approvals | PASS; six capability matrices, one-use/replay, current authority, fresh retry approval |
| Routine admission / continuation | PASS; original Run/draft reused, no repeated research, optional delivery failure preserves work |
| Computer authority | PASS; stale/expired/OWNER controls fenced |
| TypeScript / registry / routing | PASS; 135 capability definitions, 99 authored tools, 93 routing checks |
| Executor inventory | PASS; 515 sources, UNKNOWN 0 |
| Builder manifest | PASS; 146 prunable files, release 255 |
| Eve production build | PASS, normal Turbopack build with credentials excluded |
| Builder production build | PASS, normal production build with credentials excluded |
| Historical migrations 0001–0030 unchanged | PASS |
| git diff --check | PASS |
| Secret scan | PASS; changed-source scan for credential URLs, token/key formats and private-key material; no credentials copied or committed |

No provider-backed test was run. The only positive provider controls are in-process synthetic adapters. PostgreSQL databases were loopback-only in a dedicated disposable cluster; all fixture databases were dropped, then the owned cluster was stopped. Safe schema-diff/hash and test evidence is retained here.

Changes are confined to the runner/new migration, removal of unsafe file-owner claims, explicit Gateway approval checks, their fixtures/tests, inventory fingerprints and this report. Fixture approval stores were updated to use the real request-identity contract; the older upgrade helper now applies each migration transactionally like production. These changes are needed to qualify the actual boundary, not to broaden execution authority.

Reproduce using Node 24, canonical lockfile dependencies, PostgreSQL 17 on fixed loopback port 55441 and both pinned Git commits available:

```sh
node --import tsx apps/eve/test/migration-lineage.integration.mjs
node --import tsx apps/eve/test/execution-reliability.integration.mjs
node --import tsx apps/eve/test/action-upgrade.integration.mjs
node --import tsx apps/eve/test/routine-integration-upgrade.integration.mjs
npm run db:migrations:check
npm test --workspace=eve-agent
npm test
npm run typecheck
npm run build --workspace=eve-agent
npm run build --workspace=eveclaw-builder
git diff --check
```

The CLI's production Neon adapter and the local pg adapter share the same migration runner. The local harness executes the runner twice against real PostgreSQL; it never supplies the shared DATABASE_URL to the CLI. Neon wire transport was not live-mutation tested.

## Recommended Production procedure — not executed

1. Obtain a separate explicit rollout authorization. Keep Routines, Federation and Phone disabled. Do not push a deployment branch as part of this source-only work; Git integration can deploy automatically.
2. Refresh read-only deployment/ledger/server-version and owner metadata. Require the exact known full feature lineage, no unknown/mixed checksums or marker, verified 0030 object semantics, and a reviewed file-owner inventory. Stop on any discrepancy. If any nonzero legacy/conflicting file rows appear, review ownership provenance first.
3. Establish an explicitly authorized **isolated** Preview database. Current Preview shares Production and is unsuitable for migration qualification. Apply this committed runner and 0031 to a representative isolated snapshot/fixture; authenticate the app and verify owner visibility, history and the disabled gates. Local qualification does not replace that environment gate.
4. Prepare a verified restore/PITR checkpoint and a maintenance window that prevents overlapping old/new migrators and application ownership initialization. Deploy/migrate ordering must keep the shared writer quiescent until the qualified file-read code is in place. Do not let the old runner rewrite ownership/checksums.
5. Only after separate shared-migration authorization, run the qualified migration entry point once against the verified target. It must recognize feature 396631a, verify and **skip** 0030 DDL, then commit 0031 and its evidence atomically. No manual checksum edits or fabricated applied-0030 entry.
6. Verify original 29 ledger rows/checksums/timestamps unchanged, exact 0031 checksum, feature-origin evidence and satisfied-0030 checksum, nullable/default-free file owner column, expected file ownership/audit counts, exact generation/index, unchanged approval/Run/Computer/grant state, and unchanged disabled gates. Run the qualified command again: no new migration or attribution writes should occur.
7. On failure, stop. A failed 0031 transaction has no partial effects. Investigate against the snapshot/evidence; use a separately reviewed forward correction, never a blanket alias or checksum rewrite. Routine rollout remains a separate owner-reviewed work order.

**Shared database mutation: NONE. Production migration: NONE. Deployment: NONE. Routine activation: NONE.**
