# MyFactory Gate C — bounded offline candidate-return qualification

**Gate C: PARTIAL / NOT QUALIFIED. Gate B: CONTRACT DEFINED, IMPLEMENTATION BLOCKED ON M1/ER1 COORDINATION. Live MyFactory: NOT_RUN. Digital Worker readiness: NOT_READY.**

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
| Full affected suite | Focused protocol/storage/producer tests and MyEve adapter TypeScript/Vitest pass; the existing supervisor hosted-intake test did not complete in this environment and was interrupted | INCOMPLETE |

The producer fixture uses a real temporary Git repository: it commits a base and candidate, exports `git show --binary`, stores one check log, freezes the result, verifies the Ed25519 block and candidate identity, then mutates the original log and confirms replay returns the previously frozen bytes. This is stronger than the earlier synthetic candidate fixture, but it does not prove a live hosted run or provider delivery. The signed result is a claim by a trusted software supervisor, not hardware attestation. MyEve still needs independent protected verification of the imported exact candidate.

**Executed commands:** MyFactory focused `node --test packages/storage/test/storage.test.mjs apps/supervisor/test/hosted-result.test.mjs packages/hosted-routing/test/protocol.test.mjs` passed 18/18. MyEve `vitest run lib/engineering/factory-authenticated-result.test.ts --maxWorkers=1` passed 3/3, and `tsc --noEmit --incremental false` passed. The broader MyFactory workspace run was interrupted after the storage migration assertions were updated; its completed packages included agent, app builder, hosted routing and verification, but it is not reported as a suite pass. The supervisor hosted-intake test remained pending for over two minutes and was interrupted; its result is unknown. No live tests were attempted.

## Gate decision and owner boundary

The bounded authenticated candidate-return transport and FactoryVersion path exist, but **Gate C does not pass the complete required contract** while key lifecycle, durable admission and the unresolved integration test remain. A signed result has `authorityGranted=false`, independent verification `NOT_RUN`, and readiness `NOT_READY`. No candidate is imported into MyEve production custody. The size-limited Linear issue channel fails closed for larger candidates; a separate authenticated artifact channel is needed before general use.

The [Gate B single-writer handoff contract](REQUIRED-CONTRACT.md#writer-handoff-required-contract) is defined as a reviewable interface: one Work generation, one fenced productive writer, terminal remote reconciliation before reacquisition, immutable result observation, and protected candidate import only after Factory authority closes. It is **not implemented or granted**. M1/ER1 owns the shared writer persistence and transitions. Coordination with that owner is required before changing its files; no protected writer file or migration was changed here. The current Gate B contract must be reconciled with the owner's latest branch before implementation.

**Safety counters for this offline tranche:** live Factory runs 0; writer grants 0; unauthorized candidate admissions 0; false Ready transitions 0. These are counts of this work, not live qualification claims.
