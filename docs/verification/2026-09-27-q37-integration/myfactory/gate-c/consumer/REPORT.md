# MyEve Q37 Gate C consumer — migration stop

**Gate C: PARTIAL / NOT QUALIFIED. Gate B: BLOCKED. Live MyFactory: NOT_RUN. Readiness: NOT_READY.**

## Baseline and scope

Inspected 2026-09-27 UTC. MyEve origin was fetched. The Q37 checkout advanced independently during inspection from `2ff67e17dcdabaa5d8b9b1c750d64a10d4646653` to `e36b6b25a1d1093c20cd9216ff8ee474631b25a3`; the latter matched `origin/codex/q37-integration` and was clean before this documentation change. This continuation uses that current HEAD. No merge, cherry-pick, reset, stash, or main-checkout edit was performed.

`origin/main` is `c8c160abab7dd7d13cdfbb9bc0924b09d2e99ae1`; local main is `a7936898c77d157aa66c222b86aedce07e265e16` and dirty. The existing Q37 Digital Worker lineage remains the integration baseline. Open MyEve PR metadata includes independently owned PR #34 (`codex/managed-eve-beta`); no Q37 PR was open at inspection. No other task was messaged.

[Worktree inspection](worktree-inspection.json) records branch heads, dirty state and migration fingerprints. The hosted-myeve checkout's status read timed out; its state is not assumed clean. Migrations 0051–0053 remain owned by other workstreams. The dirty digital-worker-mvp 0053 and the committed qualification/Q37 0053 have different fingerprints; neither was changed or reconciled. No migration number is reserved.

## Qualified producer, incompatible existing consumer

Producer: `codex/q37-producer-attestation`, clean commit **`fcd8afd6fbaa2b9045b9e9700608d546edf011a9`**. Read-only sources:

- [Producer protocol](/Users/jaywest/.codex/worktrees/q37-producer-attestation/MyFactory/docs/producer-result-protocol.md)
- [Producer evidence](/Users/jaywest/.codex/worktrees/q37-producer-attestation/MyFactory/docs/evidence/q37-producer-attestation/REPORT.md)
- [Exact protocol implementation](/Users/jaywest/.codex/worktrees/q37-producer-attestation/MyFactory/packages/hosted-routing/src/result.ts)
- [Qualified golden receipt](/Users/jaywest/.codex/worktrees/q37-producer-attestation/MyFactory/docs/evidence/q37-producer-attestation/golden.json)

The producer is **LOCALLY QUALIFIED**. Its saved golden result was verified again in a fresh Node process using the pinned producer's `verifyResult`, independently saved `expected` values and public key. Signature, current key, FactoryVersion, request/WorkOrder/Run and all five returned artifacts passed the producer reference verifier. Manifest digest: `663f3e33e500dcbcbf49cfaea8d3c557a15c577d7e88eeedae18e0e404765cd6`. Operation: `36ee05a560255371d4364cdbff1c67e1aa8199c211cc3d24c71650f77509f264`. Two evidence records. This is **not MyEve consumer admission or independent protected verification**. No producer execution or modification occurred.

| Contract | Qualified producer | Existing MyEve adapter |
|---|---|---|
| Envelope | Exact `protocol, encoded, signature, manifestDigest, artifacts`; canonical JSON under Ed25519 domain `MYFACTORY_RESULT_V1` | Earlier hosted/Linear block with `version, keyVersion, issueId, factoryVersion, manifest` |
| FactoryVersion | SHA-256 of canonical `{sourceDigest, configurationDigest}` captured at execution admission | `{sourceCommit, sourceTree, configurationDigest}` pin |
| Correlation | Factory/request/WorkOrder/Run, attempt and request digest in immutable execution snapshot | Earlier `requestBindingDigest`/`factoryBinding` extension |
| MyEve Work linkage | Must come from a trusted, durably saved consumer request mapping | Caller-supplied binding and current Work; no durable receipt record |
| Bytes | Commit object, root tree, patch, logs; hashes and metadata under signed manifest | Earlier small inline patch/log format |
| Keys | Immutable key ID, activation/expiry/retirement/revocation, historical mode without current admission | Single configured hosted public key and fixed key version |
| Transport | Scoped exact-attempt local GET `/api/connect/v1/work-orders/:workOrderId/runs/:runId/result` | Hosted GraphQL/Linear readback |

The shared domain label does not make these schemas interchangeable. `factory-authenticated-result.ts` must not be presented as consuming `fcd8afd` today. The real protocol does not sign a MyEve Work ID/generation: trusting those from the envelope would invent a producer guarantee. Its root tree export also does not include every recursive tree/blob; full reconstruction and protected verification remain separate.

Future consumer authentication must resolve only a bounded untrusted key selector, verify the expected producer's signature, then use authenticated fields for correlation and state transitions. Current admission must obey the producer's key window and deny retired/revoked/expired keys. Historical verification retains provenance and returns no current authority; a producer timestamp cannot prove pre-revocation consumer observation.

## Why persistence requires a schema change within this scope

The explicit instruction is: **“If a schema migration is genuinely required: STOP before creating it.”** This is the user's scope boundary, not a tool rejection or an inferred approval requirement. It was reached before implementation.

| Existing storage | Why it cannot safely provide the requested consumer receipt |
|---|---|
| `engineering_work_events` (0039) | Only event kind/actor/version/time; no payload or receipt bytes. Uniqueness is one event per Work version, not producer operation plus manifest. |
| `engineering_route_runs` (0042/0043) | Route/status/provider and Work version/generation; no staged receipt, signed bytes, evidence or operation/digest uniqueness. |
| `engineering_execution` / history (0041) | JSON is technically flexible, but it is the protected execution snapshot, revision and lease namespace. `ExecutionStore.admit` changes Work control and generation; `save` replaces the execution state under writer fencing. A parallel consumer updating it could lose receipts when the owner rewrites state or take a writer lease. There is no owner-approved independent receipt API. |
| DIRECT workspaces and verification jobs (0047/0048) | Protected writer/candidate/verifier custody; importing into them would implement part of Gate B and cross the ownership boundary. |
| Task/action/Relay records | Different scope and lifecycle. Faking their identities or overloading text/JSON fields would not create a Work-owned Factory admission contract. |

A Q37-owned durable receipt relation linked to the existing Work is needed unless the shared owner provides a supported receipt persistence interface. No new database, local SQLite substitute, memory-only dedupe, encoded event-kind payload or protected execution-state extension was introduced.

The reviewable storage requirement is: immutable expected request mapping (owner/Agent/Work version, generation and criteria, Factory/version, request digest, WorkOrder and exact Run/attempt); bounded original received bytes and local first-observed time; authenticated producer/key provenance; manifest and artifact identities; distinct stage history; atomic single admission per scoped producer operation; retained conflicting deliveries without overwriting the winner; and Work-state comparison in the admission transaction. Persist before acknowledging receipt. Recovery reprocesses saved bytes, never redispatches Factory work. Cancellation, superseded generation/attempt and revoked keys cannot create a current admission. Candidate receipt custody confers no writer, approval, publication, budget, scope or Ready authority.

Required distinct states remain **unimplemented**: RECEIVED, AUTHENTICATED, ATTESTED, INTEGRITY_VERIFIED, ADMITTED, INDEPENDENTLY_VERIFIED, REJECTED, STALE, CONFLICT. The consumer must never set INDEPENDENTLY_VERIFIED from Factory evidence.

There is also an explicit governance constraint to resolve before an adapter edit: `factory-authenticated-result.ts` already has a fingerprinted inventory entry. Replacing that adapter changes its fingerprint; preserving every existing entry byte-for-byte while adding only newly introduced sources cannot accommodate that replacement. No entry was changed. Future authorization should allow refreshing only the changed Q37-owned adapter fingerprint, while preserving protected entries. Adding a parallel synthetic adapter is not a solution.

## Validation and gate matrix

Fresh executed checks:

- Producer reference golden verification: PASS, as scoped above.
- `node scripts/check-executor-governance.ts` from `apps/eve`: **PASS — 642 classified sources; UNKNOWN=0; Routine activation remains disabled**.
- `node scripts/migrate-database.ts --check`: **PASS — 53 ordered migrations**; no database connection or migration application.
- Documentation diff and exact existing inventory preservation: PASS.

Adapter/golden-consumer/adversarial/key-history/Work-linkage/replay/conflict/restart/stale/cancelled qualification: **NOT_RUN for the actual producer contract**, because implementation stopped at the required persistence boundary. Prior synthetic/earlier-protocol test results are historical only. No executable code changed; Q37 runtime tests, typecheck and production build were not rerun for this documentation-only continuation. Earlier MyFactory web build evidence does not prove a MyEve consumer build or qualify this producer integration.

“FAIL” below means the requested MyEve consumer criterion is unimplemented/unqualified, not that the producer reference test failed.

| MYEVE MYFACTORY GATE C CONSUMER | Result |
|---|---|
| Producer authentication | FAIL — actual protocol adapter not integrated |
| Signature / key version | FAIL — consumer current/historical lifecycle not integrated |
| FactoryVersion attestation | FAIL — old consumer version shape differs |
| Request correlation | FAIL — actual protocol not integrated |
| Work linkage | FAIL — trusted durable mapping missing |
| WorkOrder / attempt | FAIL — actual protocol not integrated |
| Candidate integrity | FAIL — real producer bytes not qualified through MyEve |
| Evidence integrity | FAIL — same |
| Artifact integrity | FAIL — same |
| Durable admission | FAIL — schema/owner interface required |
| Process restart | FAIL — NOT_RUN; no durable consumer |
| Exact replay | FAIL — NOT_RUN against durable consumer |
| Conflict detection | FAIL — NOT_RUN against durable consumer |
| Stale / cancelled handling | FAIL — NOT_RUN against durable consumer |
| Unauthenticated admissions | 0 in this continuation; not a qualification proof |
| Factory-granted authority | 0 |
| False Ready | 0 |
| Independent MyEve verification | NOT_RUN |
| README updated | PASS |
| Governance | PASS; UNKNOWN=0; inventory unchanged |
| Gate C | PARTIAL / NOT QUALIFIED |
| Gate B | BLOCKED |
| Live MyFactory | NOT_RUN |
| Readiness | NOT_READY |

## Gate B ownership dependencies and next decision

Gate C did not pass, so the [existing Gate B contract](../REQUIRED-CONTRACT.md#writer-handoff-required-contract) was not revised or implemented. No coordination was sent. Its dependencies remain:

- Work generation/control CAS and execution fencing: `store.ts`, `execution-store.ts`, `types.ts`, `runtime.ts`.
- Route admission, persisted handoff and exact provider attempt identity: `route-admission.ts`, `routing-store.ts`, `native-routing.ts`.
- Native in-flight reconciliation and shared budget: `native-model.ts`, common ledger services; no duplicate Factory/native writer.
- Terminal cancellation, candidate custody and protected verification: `native-completion.ts`, `native-api.ts`, `agent/tools/engineering_direct.ts`, `direct-verification-driver.ts`.
- Truthful owner projection: `worker-projection.ts`, `current-truth-lines.ts`; Factory evidence must remain separate from protected verification and Ready.
- Database contract: `database-schema.ts` and owner-assigned migration ordering after a fresh active-worktree check.

Next decision: authorize a Q37-owned Work receipt schema design/migration, or obtain an explicitly supported owner receipt interface; resolve the Q37-only fingerprint update constraint. No number is assigned. After that, replace the old adapter with the actual producer contract and run the full consumer matrix. This does not authorize Gate B, live Factory, writer transfer or changes to other workstreams.
