# Required producer change; conditional writer interface

**Design only. No new API, attestation, writer authority, persistence, or transport is implemented here.** This identifies the exact change required by request §3's permitted stop option. MyFactory source is pinned at `543906dc20fefed2def97e43953095ea0b7c60bc`. Gate C must pass before the Gate B proposal below can be finalized and implemented by its shared owner.

## Gate C: smallest complete producer change

Reuse Ed25519 from `packages/hosted-routing/src/index.mjs`; do not treat its current admission receipt as a candidate attestation. Keep the existing request/receipt protocol compatible. A versioned result extension needs a distinct signed message domain so an admission signature cannot be interpreted as a result signature. Its wire version and canonical encoding must be defined and tested in MyFactory first, then consumed in MyEve. No new signature algorithm or general PKI is needed.

1. **Bind the admitted request durably.** Extend the authenticated request contract with an opaque caller binding containing owner/Agent scope, MyEve request ID, Work ID, Work version/generation, criteria version, expected Factory identity/version and submission digest. Store the exact authenticated binding with the WorkOrder intake identity transactionally. Existing `HostedInput` rejects extra fields, so this needs an explicit compatible protocol extension, not prose in `description`. Reject the same operation ID with different binding bytes. Do not infer expected values from a returned result.
2. **Capture the actual execution version before production.** The supervisor must derive Factory identity and a source/build digest from its trusted installation, and compute a non-secret effective configuration digest covering actual model, agent executable/version, skill revision, worker/verifier profile, check commands and execution-affecting settings. An arbitrary environment label or a requested version is insufficient. Fail closed if the installed build cannot be identified or differs from the expected version. Bind this snapshot to the persisted Run ID/attempt, input commit and admitted request before productive execution. Execute from this snapshot, including the model value; currently `jobs.ts` reads `FACTORY_CODEX_MODEL` separately at start and at agent invocation. Do not backfill a historical run with today's version. Existing runs without a snapshot remain unattested.
3. **Build one immutable result manifest from producer-owned records and bytes.** Resolve one exact WorkOrder/Run/attempt, never "latest". Include input commit; candidate commit/tree and changed paths; candidate Git-object/export identity; patch; each check's ID, command, candidate, outcome, exit code and timestamps; verifier/environment provenance; and each artifact's opaque ID, media kind, byte length and SHA-256. Use deterministic encoding with explicit ordering and no duplicate identifiers. Hash the exact bytes exported, not filenames or URLs. A patch alone does not reconstruct or prove the claimed Git commit/tree. Define a bounded Git-object export and verify reconstructed commit/tree identity before claiming full candidate integrity.
4. **Attest from the supervisor's saved attempt snapshot.** Sign the protocol version, key version, Factory identity, actual FactoryVersion/config digest, request binding, WorkOrder/Run/attempt, candidate identity, canonical manifest digest, stable result operation ID and producer issuance time. Never sign caller-provided version claims as proof of actual execution. Persist the signed result and its manifest atomically before delivery. Re-reading that operation after restart must return the same result bytes; a different result for the same operation is a conflict. Completion status alone must not mint a result.
5. **Export and reconcile the same result.** Add a scoped connected-client result read/export route and client method, selected by request + WorkOrder + exact attempt. Bound aggregate and per-artifact bytes; reject traversal, redirects, unbound artifacts and digest mismatch. The current client is loopback-only: hosted MyEve additionally needs an authenticated delivery/readback path for that same stored result. Existing hosted Linear receipts can carry a small signed result reference/digest, but cannot serve as an unimplemented artifact channel. Do not expose the local server publicly, borrow browser credentials, or claim a local endpoint closes hosted transport. A callback, if later added, is a notification to reconcile the same result; callback loss cannot require a new production request.

The producer's signature is an attestation by a trusted supervisor, not hardware remote attestation or proof against a compromised supervisor. That trust boundary must be stated. MyEve must still independently verify the candidate through its protected verifier.

### Small key lifecycle

Persist trusted public-key records scoped to Factory identity, key version and protocol, with activation/retirement times and revocation state. Resolve keys from local trusted configuration; never follow a returned key URL. Unknown Factory/key/protocol, invalid signature, wrong expected version or out-of-window new delivery is denied.

Rotation retains prior public keys and stops old keys signing new results. Admission time is MyEve's locally recorded observation time; do not trust a producer timestamp alone as proof of pre-revocation delivery. Revocation denies new admissions, including backdated envelopes. Retain original bytes, signatures, key fingerprints and prior trusted observation records for historical cryptographic verification. Mark that evidence historical/revoked for current use, without deleting its auditability or granting authority. Re-admission requires current policy; signature validity does not restore it. Key compromise may invalidate confidence in prior evidence but must not erase the record. No existing implementation of this lifecycle was found.

### MyEve consumer boundary

After the producer primitive exists, a Q37-owned adapter can separately report:

| Stage | Required evidence |
|---|---|
| DELIVERED | Bounded bytes received; local observed time recorded |
| AUTHENTICATED | Signature matches expected Factory/key/protocol |
| ATTESTED | Saved producer attempt snapshot matches expected version/config, request, Work and attempt |
| INTEGRITY_VERIFIED | Canonical manifest matches signed digest; received artifact bytes and candidate objects match it |
| ADMISSIBLE | Current owner policy, Work generation, cancellation and writer fence checked by the shared owner service |
| INDEPENDENTLY_VERIFIED | MyEve protected verifier checked the exact imported candidate |
| READY | Separate deterministic owner-controlled readiness decision |

No preceding stage implies a later one. Reject Ready/authority fields as input, and never execute artifact paths or returned prose. Local observation is not producer-signed time; store both with clear provenance. Timeouts, callback loss and consumer restarts reconcile the same durable result operation. A repeated valid result is deduped by operation and digest; a conflicting digest is denied. A stale generation/attempt, cancelled/taken-over Work or revoked authority yields historical non-authoritative evidence. No automatic redispatch or writer acquisition follows from any return.

### Exact producer surfaces and required proof

All paths in this list are relative to MyFactory, not MyEve:

- `packages/hosted-routing/src/index.mjs` and `index.d.mts`: compatible request-binding/result-signature extension and bounded decoder; retain old intake behavior.
- `apps/supervisor/src/hosted-intake.ts`: persist authenticated binding and publish/reconcile the stable result reference.
- `apps/supervisor/src/jobs.ts`: capture effective execution snapshot before production, use it during execution, freeze result after evidence is complete.
- `packages/contracts/src/index.ts`: explicit snapshot, result manifest and signed envelope contracts.
- `packages/storage/src/index.ts`: atomic immutable binding/snapshot/result lookup and uniqueness. Investigate existing event/transaction storage first; **stop before any schema migration** if it cannot provide the required invariants. No migration number is reserved here.
- `apps/supervisor/src/server.ts`, `connections.ts`, and `packages/client/src/index.ts`: authenticated scoped result/export readback. No new start/cancel permission is implied.
- `apps/supervisor/src/git.ts` and `packages/verification/src/index.ts`: existing candidate/check bytes and hashes reused in one export; extend only if complete candidate-object export requires it.

Required offline tests: the real supervisor captures F1 for R1/WO1/A1/C1/M1, then a later configuration change cannot relabel that attempt; requested F2 cannot override actual F1; artifact/export mutation before signing fails; an old run without a snapshot fails. Consumer tests must cover forged key, valid producer/wrong version, wrong request/Work/generation, substituted candidate/manifest/artifacts, unknown/expired/retired/revoked key/protocol, duplicate/conflict, lost response after completion, lost callback, restart before processing, newer attempt, timeout/cancellation/takeover, Ready/writer injection. Durable concurrent consumers must admit at most one receipt. Expected positive result: authenticated + attested + integrity verified; independent verification NOT_RUN, readiness NOT_READY, authority granted 0.

## WRITER HANDOFF REQUIRED CONTRACT

**Gate B status: BLOCKED.** This is a conditional interface proposal for the existing M1/ER1 owner, not a second writer implementation or a claim that Gate C passed. Shared ownership overlap: **YES**. No automatic cross-task message is authorized or sent.

Invariant: **one authoritative candidate writer per Work generation**. Preserve existing owner/Agent scope and the common resource budget. Use the shared Work-row transaction and existing fencing/generation service. A provider-signed return never grants production or native authority.

Proposed domain commands (names illustrative until the owner accepts them):

| Command | Preconditions and effect |
|---|---|
| `prepareFactoryHandoff` | Exact Work version/generation, owner/Agent and current writer fence; records stable operation and bounded request; no dispatch |
| `quiesceCurrentWriter` | Denies further native effects under old fence; reconcile in-flight effects before recording NO_WRITER |
| `grantFactoryWriter` | Compare-and-set from reconciled NO_WRITER to exact Factory/version/scope/deadline; bind one dispatch request; native productive mutation denied |
| `observeFactoryResult` | Records authenticated immutable result/historical receipt; does not change writer ownership |
| `stopFactoryWriter` | Fence current production grant first, request exact-attempt cancellation when supported; STOPPING/UNKNOWN until terminal reconciliation |
| `completeFactoryWriter` | Exact grant/attempt/terminal result; reconcile and revoke/complete Factory authority, then record NO_WRITER |
| `importFactoryCandidate` | Exact authenticated receipt and manifest, current Work generation, Factory fence closed; imports custody for independent verification, grants no native writer |
| `reconcileWriterHandoff` | Read existing operation/remote attempt after crash or timeout; never dispatch a second attempt because delivery is unknown |

Required durable fields, owned by the existing service: operation ID and request digest; owner/Agent/Work ID/version/generation/criteria; writer type/state and monotonic fence; prior fence; expected Factory identity/version/config; exact repository/base/branch/workspace/allowed paths; budget/policy references; expiry/deadline; request/WorkOrder/Run/attempt; cancellation/revocation identity; stable result operation/manifest/candidate identities; observed times; terminal reconciliation evidence; immutable history and compare-and-set revision. These are requirements, not a proposed new table. The owner must map them into existing persistence and decide whether schema work is necessary.

Transition: NATIVE → fenced/quiesced → NO_WRITER → bounded FACTORY → authenticated result plus terminal reconciliation → Factory revoked/completed → NO_WRITER → MyEve candidate custody / protected verification. Custody and verification are not a new productive writer. A later native write requires its own owner admission.

Failure rules: native still active denies Factory dispatch; Factory active denies native mutation; timeout/expired lease alone cannot prove a remote process stopped; cancellation fences before native reacquisition; late output after revocation remains historical; human takeover fences Factory first and must reconcile before any new authoritative candidate writer. A worker physically continuing after a fence may retain isolated diagnostic output but cannot commit authoritative custody or publish. If this cannot be enforced, deny handoff.

Likely affected protected MyEve files (read-only in this tranche): `apps/eve/lib/engineering/route-admission.ts`, `routing-store.ts`, `store.ts`, `execution-store.ts`, `runtime.ts`, `native-routing.ts`, `native-model.ts`, `native-completion.ts`, `native-api.ts`, `types.ts`; `apps/eve/agent/tools/engineering_direct.ts`; `apps/eve/lib/database-schema.ts`. Candidate import/protected verification must use the existing owner paths, including `direct-verification-driver.ts`, without changing what counts as verified. Any Current Truth projection changes in `worker-projection.ts` / `current-truth-lines.ts` remain owner work. Reinspect the owner's latest source: its branch is moving independently of Q37. Migrations 0051–0053 are already owned; none may be reused.

Required owner tests: concurrent native/Factory grant race (one winner), stale Work/fence CAS rejection, stale worker writes after takeover, expiry while remote still active, crash at every transition, lost dispatch response without redispatch, cancellation before/after completion, cancelled/newer-attempt historical returns, human takeover, result replay/conflict, budget conservation, and no automatic native authority after result receipt. Gate B is complete only when these tests pass against the shared implementation. Live Factory remains forbidden until both Gate C and Gate B pass.
