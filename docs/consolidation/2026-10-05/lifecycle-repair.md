# Production validation lifecycle repair

The failed production Work `479ebc7d-4f4c-496f-ad5f-1d30c0de3d1c` generation 2 remains immutable history. Its grant is revoked, cleanup passed, and this repair does not enroll, modify or retry it. See `failed-production-validation.md` for exact request, command, production SHAs, FactoryVersion and cleanup findings.

## State ownership

Migration 0057 intentionally forbids all changes to a persisted `factory_preparation`. The failed driver tried to store operational lifecycle transitions there. Mocked SQL tests missed the trigger. The repair leaves 0057 and all applied migrations unchanged.

MyEve migration `0081_factory_validation_lifecycle.sql` introduces one row per scoped preparation/Work generation. It pins the existing decision, Work/version/generation, request, configuration hash, FactoryVersion, Environment binding and deadline. The exact request identifies the separate Factory grant and intake attempt; no grant, Factory resource, canonical Work or Proof is duplicated. New protocol-2 preparation and initial lifecycle are saved in one statement. No historical rows are backfilled.

A claim has a UUID token, monotonic epoch and at most 45-second lease, bounded by the immutable Work deadline. Simultaneous delivery returns BUSY. Expired/interrupted ownership halts and attempts cleanup; it never reclaims productive execution. Only the exact missing-grant response can wait with the same request/deadline. Cancellation and failure fence the token. HALTED and COMPLETED are terminal. Cleanup remains available after expiry; a local halt does not itself prove remote teardown.

The pinned PostgreSQL controller session retains its existing owner advisory lock. Every validation database operation additionally locks and checks lifecycle ownership in its transaction, and checks again before commit. Receipt admission, custody, verification, evidence and Proof helpers all receive this fenced database. Remote I/O holds no database lock. Responses arriving after cancellation cannot write evidence or Proof. Factory independently checks the exact bounded grant and writer identity at its own authority crossings.

Retained Proof is preserved even if finalization fails. Owner gate PASS requires the exact protocol-2 lifecycle COMPLETED, matching request and FactoryVersion, followed by existing full signature, provenance, byte/digest and isolation verification. Infrastructure health and retained evidence alone never establish execution readiness.

## Migration and recovery

Only MyEve gains migration 0081. Factory migrations 001–008 are unchanged. The migration creates a table/function/trigger without rewriting existing rows or weakening preparation immutability. The canonical runner provides ledger checksums, a transaction, 5-second lock timeout and 30-second statement timeout. PostgreSQL tested both a fresh full installation and upgrade from 0080 with a populated failed legacy preparation.

Before any production operator application, check the exact SQL checksum below and current canonical migration ledger. No request/build runs migrations. If installation fails, the runner rolls back its transaction and ledger. Do not drop the new table after any lifecycle exists: it is retained operational history. Operational rollback is to disable validation configuration/admission and preserve both lifecycle and preparation; reverting to the old faulty driver does not authorize another attempt. Forward correction and a new owner-approved Work are required for any failed attempt. There is no automatic data repair or destructive down migration.

## Qualification

- Independent review: scoped PASS after resolving transaction-write fencing, immediate expired-claim cleanup, and completed-lifecycle readback findings.
- 25 real PostgreSQL tests: fresh/upgrade, original production failure, actual driver claim/wait/failure, concurrent/duplicate claim, stale epoch, cancellation/completion race, expiry/interruption, real evidence ingestion cancellation, retained Proof gate, actual Factory grant/revocation composition.
- Factory connected PostgreSQL: exact immutable authority consumption, concurrent claims, protected-verifier revocation and UNKNOWN late-delivery fencing PASS (2 tests).
- Offline composed HTTP/SQLite/Git → PostgreSQL custody → Docker protected verification → durable MyEve TestEvidence/DiffEvidence → canonical Proof and owner-scoped readback PASS (19 checks). Cross-owner and cross-Work denials, zero duplicate dispatch and candidate integrity passed. Synthetic local publication fixtures are not live publication.
- MyEve corpus: 2,123 Vitest tests PASS, 94 pre-existing gated tests skipped; the new 25 PostgreSQL tests run separately with a disposable local URL. Node corpus: 229 PASS, 2 skipped. TypeScript PASS.
- General production Work remains disabled. Paid operations and live publication effects are zero. No historical attempt or revoked grant is revived. Live production qualification remains unpassed until a separately approved new model-free attempt.

Fresh-clone and CI results are recorded after running the exact committed candidate. No paid canary is prepared by this repair.

Migration SQL SHA-256: `66bb71b44be2ff304f0873489f5548c9f6c7f1f9f5549700af218a01b069e376`.
