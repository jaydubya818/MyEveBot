# MyFactory Gate C: stopped at producer attestation prerequisite

**Integration BLOCKED. Authenticated candidate return transport PARTIAL. FactoryVersion attestation FAIL / MISSING. Gate B BLOCKED. Live Factory NOT_RUN; readiness NOT_READY.**

This continuation starts at MyEve `56e5f30d91694e87f55234307cf946bc6a2b9772` on `codex/q37-integration`. MyFactory remains clean at `543906dc20fefed2def97e43953095ea0b7c60bc`. All 14 previously inspected producer source fingerprints match. No producer or MyEve runtime implementation changed in this tranche.

Request §3 explicitly permits stopping and identifying the exact MyFactory change if the producing system cannot attest its execution version. This report takes that option. It does not claim that a producer worktree was forbidden or that a migration has been proven necessary. The missing boundary spans authenticated request binding, immutable execution configuration, signed result persistence and artifact delivery; signing more caller-supplied JSON in MyEve would not close it. The [required producer contract](REQUIRED-CONTRACT.md) makes this prerequisite concrete.

## What the current producer actually authenticates

Source paths below are relative to the pinned MyFactory repository. No runtime credentials, connection data, private keys or live WorkOrders were read. Audit signatures use freshly generated in-memory test keys only.

| Boundary | Classification | Source-backed finding |
|---|---|---|
| Service identity | ADAPT | `connections.ts:45` authenticates a loopback client token; hosted receipt public-key pin authenticates the receipt signer. Neither defines a versioned execution service identity. |
| Request authentication | REUSE | `packages/hosted-routing/src/index.mjs:43–63`: HMAC binds client, repository, team, deterministic issue/request ID, input and expiry. |
| Response authentication | ADAPT | Same file `70–84`: Ed25519 verifies receipt bytes and issue ID. Complete candidate/evidence response authentication is absent. |
| Factory identity | MISSING | No signed Factory ID or producer registry in the inspected contract. A local label is not producer proof. |
| FactoryVersion | MISSING | No signed source/build/config snapshot tied to a Run. Package `0.1.0` and the inspected Git commit are source facts, not actual execution attestation. |
| WorkOrder | REUSE | `hosted-intake.ts:69–81`: durable issue → WorkOrder link; signed receipt contains that ID. |
| Attempt | ADAPT | `packages/contracts/src/index.ts:87`: Run ID, WorkOrder, attempt number and candidate exist, but are absent from the signed receipt. |
| Signing primitive | REUSE | Existing domain-prefixed Ed25519 receipt signing; no new crypto algorithm needed. |
| Receipt | ADAPT | `hosted-intake.ts:80–87` signs only version, issueId, workOrderId, state, updatedAt, workOrderUrl. |
| Candidate/artifact integrity | ADAPT | `jobs.ts` records commit/tree/paths/patch SHA-256 and check log hashes. Those records are not one authenticated exported manifest. Full candidate-object transfer is absent. |
| Result transport | MISSING | `server.ts:257–283` offers scoped connected-client detail reads, not result/artifact export. Diff/log reads are separate browser routes. `packages/client/src/index.ts` is loopback-only. |
| Callback/webhook | MISSING | Hosted intake polls Linear; no candidate-result callback protocol found in the inspected surfaces. Notification loss needs durable readback, not redispatch. |
| Replay protection | ADAPT | Deterministic hosted request and transactional intake idempotency exist. Immutable signed result operation/digest dedupe and consumer concurrency protection do not. |
| Key/version rotation | MISSING | One configured receipt key; no protocol key ID, lifecycle/revocation registry or historical admission policy. |
| Request/result correlation | ADAPT | Signed issue → WorkOrder exists; Work version/generation, Run/attempt and candidate/manifest are unbound by that signature. |

`jobs.ts:209–224` persists `run.started` with input commit, worker profile, model and a skill reference. It does not persist actual Factory source/config identity. The model is read again from the environment at invocation (`jobs.ts:327`), rather than executed from an immutable version snapshot. Attesting today's process configuration later cannot establish what a prior attempt used.

## Executable evidence and its limits

[audit-receipt.mjs](audit-receipt.mjs) imports the actual pinned producer protocol, after checking all 14 source hashes. [receipt-audit.json](receipt-audit.json) records **nine successful assertions**: five existing authentication/protocol checks and four confirmed gaps. Wrong signer, changed signed bytes, wrong request and unsupported receipt protocol are denied. The same valid receipt authenticates alongside either of two different unsigned candidate/manifest pairs. The reader accepts replay without admission state; the receipt lacks execution attestation fields; the legacy request parser rejects an added Work binding field.

These gap assertions passing means the limitation was reproduced. It does **not** mean candidate return authentication passed. The script never admits a candidate, creates a WorkOrder, starts a supervisor or worker, or persists a key. No fake attestation or replacement golden fixture was added. The earlier [synthetic semantic qualification](../REPORT.md) and its fixture remain unchanged.

Validation for this continuation:

- **139 Q37 tests PASS** across eight files, including existing Factory semantic/byte-integrity/replay/stale cases, signed intake observation, Relay, GitHub and learning regressions: [tests.log](tests.log).
- **Six real producer protocol tests PASS**, using mocked provider calls and ephemeral keys: [producer-protocol-tests.log](producer-protocol-tests.log). These include signed intake and lost-response request reconciliation; they do not test candidate-result delivery.
- Full app TypeScript **PASS**: [typecheck.log](typecheck.log).
- Governance **PASS**, **641 classified sources / UNKNOWN=0**: [governance.log](governance.log). Inventory unchanged byte-for-byte; no new runtime source or inventory entry.
- Migration manifest **PASS**, 53 ordered migrations: [migrations.log](migrations.log). No schema edit, migration creation, DB connection or application.

Authenticated candidate attestation/manifest/replay/consumer-restart/callback/cancellation/key-lifecycle qualification is **NOT_RUN because the producer primitive does not exist**. Existing synthetic contract tests cannot substitute for these. Independent protected verification through Factory remains NOT_RUN.

Reproduce the signature audit and producer tests from the Q37 repository root (substitute the producer path only if the pinned source is elsewhere):

```sh
node docs/verification/2026-09-27-q37-integration/myfactory/gate-c/audit-receipt.mjs /Users/jaywest/Documents/ChatGPT/MyFactory
node --test /Users/jaywest/Documents/ChatGPT/MyFactory/packages/hosted-routing/test/protocol.test.mjs
```

The Q37 test/typecheck/governance/migration commands are unchanged from [the semantic dossier](../REPORT.md#validation). Evidence and preservation hashes are in [manifest.json](manifest.json).

## Required final matrix

For the complete Gate C boundary, FAIL below means the required authenticated candidate-return property is missing/unqualified, not that the earlier semantic tests regressed. Partial primitive coverage is stated separately.

| Finding | Result |
|---|---|
| AUTHENTICATED RETURN TRANSPORT | **PARTIAL** — authenticated admission/status only |
| FACTORYVERSION ATTESTATION | **FAIL / MISSING** — no producer execution snapshot/attestation |
| PRODUCER IDENTITY | **FAIL** for candidate return; existing pinned receipt key tests PASS |
| REQUEST CORRELATION | **FAIL** for request → exact producing attempt/result; issue → WorkOrder PASS |
| WORK LINKAGE | **FAIL** for authenticated Work/version/generation; synthetic local checks PASS |
| MANIFEST INTEGRITY | **FAIL** — no signed canonical producer result manifest |
| CANDIDATE INTEGRITY | **FAIL** for authenticated complete candidate; synthetic pin/patch checks PASS |
| EVIDENCE / ARTIFACT INTEGRITY | **FAIL** for authenticated export; synthetic received-byte checks PASS |
| REPLAY SAFETY | **FAIL** for durable authenticated result; prior sequential synthetic replay PASS |
| STALE RESULT HANDLING | **FAIL** for authenticated result lifecycle; prior synthetic stale checks PASS |
| FACTORY-GRANTED AUTHORITY | **0** in the bounded offline checks; no authority path invoked |
| UNAUTHENTICATED CANDIDATE ADMISSION | **0** in this audit; no production candidate admission invoked or qualified |
| FALSE READY | **0** in the bounded offline checks |
| README UPDATED | **PASS** — root README, setup guide and Digital Worker plan |
| GOVERNANCE | **PASS**, unchanged inventory, UNKNOWN=0 |
| GATE B — WRITER HANDOFF CONTRACT | **BLOCKED** — conditional required interface documented; Gate C prerequisite unmet |
| SHARED OWNERSHIP CONFLICT | **YES** for implementing Gate B; no protected change made |
| LIVE MYFACTORY | **NOT_RUN** |
| MYFACTORY INTEGRATION | **BLOCKED** |

Zero counters are limited to the checks actually executed and the absence of any admission/authority mutation in this audit. They are not live safety qualification or coverage of the missing authenticated-return implementation.

## Ownership and next boundary

`origin` was fetched. `origin/main` remains `c8c160a`; local main `a793689` is dirty and ahead 1 / behind 43. Q37 retained its requested `56e5f30` lineage because the required Digital Worker implementation is unmerged. No merge, rebase or cherry-pick occurred. Open MyEve PRs were inspected read-only, including protected draft #34; no PR was modified. Protected qualification work independently advanced to `6630363` with dirty source. Active worktrees and migration ownership were inspected read-only; the hosted MyEve status read timed out and was treated as protected. Migrations 0051–0053 remain owned elsewhere. No shared inventory, protected fixture, other worktree or producer source was edited. No cross-task message was retried or sent.

**Next independent capability:** implement the producer-owned immutable attempt-version snapshot plus authenticated result manifest/export described in [REQUIRED-CONTRACT.md](REQUIRED-CONTRACT.md), then qualify Gate C against that actual producer code. If its persistence needs a schema change, stop before creating it. Gate B remains the existing M1/ER1 owner's shared writer-fencing interface; its conditional commands, fields, exact affected files and failure tests are documented without implementation. Both gates must pass before any live production dispatch, writer transfer or paid Factory execution.
