# Grant materialization decision boundary

The independently changing lifecycle reads are a confirmed, deterministically reproduced defect. Two real PostgreSQL interleavings changed `WAITING_GRANT` to `IN_FLIGHT` after the old operator's poll and before its later compound predicate. The only failed predicate was `lifecycle_state_is_waiting`; all seven other predicates passed. The transactions and xmin values differ. Preparation bytes remain unchanged.

Attempt 2's exact historical failing snapshot was not recorded and cannot be reconstructed. Its particular cause remains unproven retrospectively. The reproduction establishes the defect and corrects that evidenced boundary; it does not invent missing incident evidence. Attempt 2 remains a failed immutable qualification, not a successful validation.

## Correction

`apps/eve/scripts/production-validation-materializer.ts` is operator-only. No request handler, worker, build or app runtime imports it. No migration or lifecycle state/transition semantics changed.

Each bounded pre-effect attempt records a preliminary sample, acquires the existing controller owner advisory lock, locks canonical Work and lifecycle rows, and records named predicates against the authoritative state. Work UPDATE locking also serializes stop-command foreign-key insertion. The snapshot records Work revision/generation, decision/preparation/request identity, deadline, state, updated-at, xmin, transaction/backend identity and a digest of the fencing token. Neither raw tokens, credentials, manifests nor protected evidence enter this audit.

An exact `WAITING_GRANT` lifecycle is eligible. Missing preparation, IDLE and a live IN_FLIGHT claim are transient. Terminal/expired claims, changed Work, stop/takeover commands and pin mismatches deny. Waiting is at most 60 iterations/30 seconds by default (hard maximum 120 iterations), within the original deadline, and happens only before any operator claim or Factory effect. It never generates a request UUID or extends a deadline.

Before Factory writes, the operator durably commits the existing IN_FLIGHT token/epoch/lease. That lease blocks the controller even if the operator's MyEve connection disappears. It is never renewed or reclaimed. Factory retains sole execution-authority ownership; this is the existing mutable lifecycle lease, not another grant store.

The Factory transaction uses the existing operator advisory lock and authority table lock, validates installation, exact historical revoked grants, zero paid operations/intake, and the exact approved request/configuration/source. The operator rechecks its lifecycle fence and both database clocks before committing. After positively acknowledged Factory commit and exact readback, it conditionally releases its same live claim back to WAITING_GRANT. The request's two canonical null inputs and spend metadata are compared exactly to approval, while the transport manifest retains the canonical CLOUD request shape.

A second materializer can observe the same exact unconsumed authorized row; it cannot create another authority. Revoked, consumed, mismatched or unexpected rows deny. Interrupted post-claim work never returns to waiting: best-effort HALT/revocation plus independent readback/cleanup is required.

### Distributed commit limitation

The databases do not share a transaction. Losing the Factory commit acknowledgement cannot release the durable claim. Losing the final MyEve activation-commit acknowledgement can mean activation already committed. The operator records **possibly activated**, never retries that release, and permits readback/cleanup only. It does not claim that a lost final acknowledgement proves zero execution. The model-free grant remains bounded by the same immutable request/deadline, with Factory idempotency and the existing controller/writer fences.

## Qualification

- Real PostgreSQL A–H, preparation immutability, mutable lifecycle, actual Factory intake authority, fresh full migration install and prior-lineage upgrade: PASS.
- 42 real PostgreSQL cases + missing-grant classification + 19 operator preflight cases: **62/62 PASS**; independently rerun by the read-only reviewer.
- Added tests include actual `FactoryWorkDriver.start()` serialization, two materializers, deadline crossing, halt/cancel, Factory lock contention, revoked history, restart, actual MyEve backend termination, lost Factory commit acknowledgement and lost activation acknowledgement.
- Fresh clone of committed operator revision `c6a09f43c76ba2db11cb9aa1054f3a85f0a86c62`: **62 targeted PASS**, **2,142 ordinary Vitest PASS**, TypeScript PASS. 120 integration cases skip without their dedicated environments; the 42 PostgreSQL cases run separately with the explicit local database configuration. Executor governance: 791 classified sources, UNKNOWN=0.
- Existing composed EvidenceProvider → Proof: **19 checks PASS**, real local HTTP/SQLite/Git/PostgreSQL and independent Docker verifier; provider calls 0. TestEvidence/DiffEvidence, durable owner custody, cross-owner/cross-Work denial and immutable candidate checked. This fixture also exercises 37 synthetic local publication mutations; it performs no live publication.
- TypeScript: PASS.
- Independent implementation/CLI review: **PASS**, no remaining concrete findings. This is not live production validation or paid-canary authorization.

## Production preservation

The investigation issued no grant, start command, request UUID, execution, migration or deployment. Canonical production remains MyEve `a3a92e749227abf20b223433104b4fba88c36d97` and MyFactory `a591127a26f3d134289f9a3a4a4a8bd2a8628f41`. Factory SELECT-only readback confirms reusable grants 0, paid operations 0, intake 0, producer/verifier resources 0, candidates 0, and the single historical revoked grant with its original digest. Vercel's database query console Read-Only remains enabled; no write window was opened.

A new Work/envelope may be prepared after qualification. It must receive separate owner approval; no live or paid attempt is authorized by this report.

## Explicit operator path (after a new exact approval only)

Do not run the historical temporary helpers. Use the reviewed source revision, the new envelope's `materializer` binding, and a current operator preflight receipt. `production-validation-grant.ts` requires the exact approved envelope digest, fresh finite timestamp, qualified SHA/migration/configuration pins, Read-Only-before enabled, disabled general Work, zero grants/paid/publication, and separately approved write-window attestation before constructing connections.

The private connection JSON contains `myeve` and `factory` unpooled PostgreSQL URLs and must have mode 0600. The preflight pins both qualified Neon hosts. TLS verification stays enabled. Obtain/verify credentials, database identities, cleanup access and all installation prerequisites **before activation**, never while the 180-second deadline runs. Credentials remain in the private operator file; they are not embedded in approval artifacts.

From `apps/eve`, after approval and preflight only:

```sh
node --import tsx scripts/production-validation-grant.ts --install \
  --envelope /absolute/path/AUTHORIZATION-ENVELOPE.json \
  --approved-envelope-sha256 APPROVED_CANONICAL_JSON_DIGEST \
  --connections /private/path/operator-connections.json \
  --preflight /absolute/path/current-preflight.json \
  --audit /absolute/path/new-exclusive-audit.jsonl
```

The audit path must not already exist. The CLI prints only non-secret outcome/digest metadata and never retries. Any failure after the durable claim requires exact independent lifecycle/grant readback, bounded halt/revocation/teardown, and Read-Only restoration. A fresh Work, deadline, lease or grant is not an error-recovery action. General Work and paid models remain disabled.

## New approval envelope — not executed

All repair qualification gates passed before creating new canonical Work `a6f0b486-918d-4be2-8ba8-6a4d762707a7`, version/generation **2/2**. Only its requested Work metadata was written. Its production configuration remains a local draft. The existing production controller remains pinned to failed Attempt 2. Readback confirms zero commands, routing decisions or lifecycles for the new Work, with request ID and deadline unset and no Factory grant. Work metadata being active/agent is not execution authority.

`AUTHORIZATION-ENVELOPE.json` has canonical JSON digest **acc286760f4c689a30b5063dee0d9ceb4199e2ad419f56ced2506d8f2b9bc701**. It pins operator source `c6a09f43c76ba2db11cb9aa1054f3a85f0a86c62`, the unchanged deployed application SHAs, exact model-free source/candidate/FactoryVersion/environment bindings, and one attempt of at most180 seconds. Both historical attempts remain preserved.

This envelope needs explicit owner approval before any configuration installation, start command, request UUID, deadline, grant or write window. No paid canary was prepared. Production is not declared READY on the strength of local qualification.
