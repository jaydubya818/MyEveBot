# P0 Gap #2B — additive implementation, product-policy stop

**PARTIAL. Live M1/ER1 NOT READY. Retained fixture STILL PAUSED.**

The owner's approval in attachment `404e066f-a653-481d-a884-bf42a4421b31/Pasted text.txt`, section 19, requires: “STOP and report that as a product-policy finding” when the conservative completion path cannot fit the unchanged allowance. This stop is from the owner instruction, not a skill or automatic approval rejection.

## Budget finding

The retained Work ceiling is $1.30. Historical spend is $0.777654, with $0 outstanding reservation, leaving **$0.522346**. The proposed nine-call contract at the existing 2,048-token output cap requires **$1.013760** with the default 14,336-byte input bound. Even its minimum supported 5,120-byte bound requires **$0.599040**, a **$0.076694 shortfall** before any fresh-chat/admission cost.

The calculation retains the existing 2× safety multiplier and the maximum input/cache-creation rate. Pricing is the isolated qualification snapshot ($2/million input, $10/million output, $2.50/million cache creation), not a newly refreshed live catalog. See [machine-readable calculation](retained-budget-finding.json). No claim is made that every possible redesigned workflow is impossible. Lower output bounds or a different workflow would be a concrete policy/design decision requiring review, not a quiet adjustment to make this test pass.

A nearly empty synthetic Work can admit this contract under $1.30; that does **not** establish that the retained Work can continue. Historical liabilities were not reset or erased. No distinct replacement Work was created in the retained fixture. No fresh provider authority is requested.

## Candidate state

0052 prerequisite is merged at `77ca27d`. The separately qualified read-only Current Truth projection is integrated at `acfe498` (source `31da2e0`); its standalone evidence is in [the projection dossier](../2026-09-26-gap2b-projection/README.md). Active/latest/history, exact verification binding, and one shared UI/chat formatter are implemented there.

Additive `0053_native_completion_contract.sql` and its runtime wiring are **uncommitted, incomplete qualification work**. 0053 was unclaimed when allocated. It was applied only to disposable isolated databases. Do not deploy this working tree, apply 0053 to the retained fixture, or treat the schema-version bump as a qualified release.

The proposed bridge stores an immutable contract on the existing route admission snapshot, with stage identity on canonical call receipts. Remaining stage slots derive held capacity; a durable receipt consumes one slot and reserves its actual conservative request exposure in the same common ledger. Settled spend plus unresolved exposure plus remaining completion capacity must fit the effective Work/Agent ceiling. There is no second spend balance. Existing route, session, writer and Action Gateway authority remain required. FAILED_BEFORE_DISPATCH burns its slot conservatively; unresolved exposure is never released by contract expiry. Replaying one receipt does not consume a second slot or charge.

Runtime work adds bounded native context, staged reservations, expiry checks, and canonical common-ledger economics for new Results. This implementation has not completed security/governance review or the qualification gates below.

## Observed checks and limits

[Latest isolated PostgreSQL log](isolated-postgres.log): fresh migration chain through 0053 succeeded; minimum admission under a fresh $1.30 ceiling, repair capacity protection, UNKNOWN retention, receipt replay, real concurrent conversation/native/admission/fresh-chat races, stale Work/policy/Agent fencing, and actual SIGKILL after contract, call reservation, dispatch and retained response passed.

The expanded suite then **failed in its malformed-contract test harness**: its SQL interceptor matched proposal SQL before admission and attempted `JSON.parse(undefined)`. This is not evidence that malformed-contract enforcement passed or failed. Later adversarial, narrowed-ceiling, real Docker verification, repair-draft process loss, verification process loss, and complete local journey checks in that invocation did not run. A prior controlled-verifier journey was exploratory evidence only and is not substituted for the required protected-verifier gate.

[Typecheck/governance log](typecheck-governance.log): TypeScript, capability registry and imported-skill checks passed at the time run. Governance failed because changed executors require reviewed fingerprints and native-completion requires classification. No fingerprints were bypassed to claim green. The combined post-integration full app/root suite and production build have not been requalified.

Outstanding migration gates: populated 0052 upgrade, retained-checkpoint clone upgrade, injected failure/rollback, historical preservation and restricted roles through 0053. Contract expiry and all six combined recovery cases remain incomplete. The separate projection dossier's A–I and checkpoint results are standalone results, not proof of the full combined candidate or authenticated live parity.

No connection to `golden_auth_127447eb80f3` was made by this implementation tranche. Its paused state is preserved under the coordination agreement; this report does not independently query it. No old runtime was restarted. No retained migration, historical reconciliation, provider call, publication, deployment or ER2 execution occurred.

## Required final report

FAIL below means the complete requested gate remains unqualified; it does not negate the narrower passing observations above.

| Gate | Result |
| --- | --- |
| P0 GAP #2B | PARTIAL — product-policy stop |
| FINAL MIGRATION | 0053 candidate; isolated only, not release-qualified |
| 0051 | UNCHANGED |
| 0052 | UNCHANGED |
| COMPLETION CONTRACT | FAIL — full qualification incomplete |
| WORK CEILING | PASS — unchanged; insufficient retained allowance is blocked |
| ATOMIC RESERVE | FAIL — contention checks passed, full gate incomplete |
| REPAIR RESERVE | FAIL — protection checks passed, full gate incomplete |
| COMMON LEDGER BRIDGE | FAIL — replay/accounting checks passed, full gate incomplete |
| DOUBLE COUNTING | 0 observed in executed checks; full coverage incomplete |
| RESERVED-COMPLETION THEFT | 0 observed in executed checks; full coverage incomplete |
| ACTIVE RUN | PASS — standalone integrated projection A–I fixtures |
| LATEST RUN | PASS — standalone integrated projection A–I fixtures |
| RUN HISTORY | PASS — standalone integrated projection A–I fixtures |
| VERIFICATION CURRENT TRUTH | PASS — standalone projection exact-binding fixtures/clone |
| WORK ↔ CHAT PARITY | FAIL — shared local formatter passes; combined/authenticated gate incomplete |
| LOCAL M1/ER1 JOURNEY | FAIL — required complete protected-verifier journey not qualified |
| RETAINED FIXTURE | STILL PAUSED; untouched by this tranche |
| LIVE M1/ER1 | NOT READY |

0051 SHA-256: `49806249a1b105cda3724372d9bc9b6afd66d1292e5c461eccbb31581a094fce`.
0052 SHA-256: `a6958d75de012f257c5a4378cd2828b422806f776bc9462689077a93dd9fe106`.

Additional live model spend: **$0**. No budget ceiling or conservative safety margin changed. No safety violation was observed in executed isolated checks, but this partial run cannot certify all required zero-violation targets. Original failed candidate, repair draft, FAILED Result, revoked qualification and historical spend are preserved.

The next owner decision is how to resolve the retained Work's insufficient allowance: explicitly redesign/review a completion contract that fits, authorize a changed ceiling, or authorize a distinct qualification Work while preserving this Work's history. None is assumed or executed. Remaining isolated gates must still pass before any live request. ER2, Relay, MyFactory, GitHub, learning and other Q37 gaps remain stopped.
