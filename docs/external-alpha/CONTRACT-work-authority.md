# External-alpha Work authority contract (MyEve to MyFactory)

Status: INACTIVE contract, version 1, written 2026-10-06 by the MyEve-side implementer.
Branch: `codex/external-alpha-work-authority` (foundation: draft PR #65, head e1a0876).
Implementation: `apps/eve/lib/external-alpha/work-authority*.ts`, migration `0086_external_alpha_work_authority.sql`.
Nothing here installs, activates or grants anything. Policy absent or any check failing means DENY.

This contract is the only interface between the MyEve-side issuer and the MyFactory-side independent validator and single-consumer. The Factory MUST NOT trust any MyEve database state; it validates the signed document against its own pinned configuration.

## 1. Authority document

JSON object, `schema = "MYEVE_EXTERNAL_ALPHA_WORK_AUTHORITY_V1"`, strict (unknown or missing fields are a denial). Integers are JSON numbers (safe integers); amounts are integer micro-USD. Timestamps are UTC ISO-8601 with milliseconds and a `Z` suffix.

| Field | Type / rule |
| --- | --- |
| `schema` | literal above |
| `authorityId` | uuid, DETERMINISTIC: the first 32 hex chars of `idempotencyKey` formatted 8-4-4-4-12 with version nibble forced to `8` and variant nibble forced to `a` |
| `idempotencyKey` | hex64 = `digest({kind:"EXTERNAL_ALPHA_WORK_AUTHORITY_KEY_V1", policySha256, workId, workVersion, workGeneration, tupleSha256})` where `workId/workVersion/workGeneration` are the Work fields and `tupleSha256` is defined below |
| `singleUse` | literal `true` |
| `cohortId` | uuid, from the installed policy |
| `slot` | `"1"` or `"2"` |
| `ownerId` | owner scope id of the external-alpha owner (opaque string) |
| `policySha256` | hex64, digest of the installed MyEve external-alpha policy |
| `application` | `{ clientId, projectId }` from the policy (`external-alpha-<32 hex>`, `prj_...`) |
| `source` | `{ repository, baseSha (40 hex), treeSha (40 hex), sourceDigest (hex64), allowedFiles (string[], sorted ascending, unique, 1..30, each a relative path without dot-segments), allowedFilesSha256 }` ; `allowedFilesSha256 = digest({version:1, files: allowedFiles})` |
| `work` | `{ id (uuid), version (int>0), generation (int>0), title, objectiveSha256 (sha256 hex of the UTF-8 objective text), criteriaSha256, criteriaCount }` |
| `project` | `{ name: "Alpha Tasks", task: "add a Priority field (exactly Low\|Medium\|High) shown on the task list", criteriaSha256, tupleSha256 }` (see section 2) |
| `environment` | literal `"CLOUD_PRODUCTION"` |
| `executionProvider` | literal `"MYFACTORY_CLOUD_EXECUTION_V2"` |
| `harness` | `{ id: "myfactory-cloud-harness", version: "1" }` (HarnessProvider id and version; the Factory MUST verify against its own pin) |
| `factoryVersion` | hex64, from the policy; the Factory MUST equal its own FactoryVersion |
| `model` | `{ provider: "vercel-ai-gateway/openai", id: "openai/gpt-5.4-mini" }` |
| `limits` | `{ work: {operations:5, microusd:1300000}, factory: {operations:3, microusd:1000000}, productiveSeconds:180, candidates:1, writers:1 }` : the Factory portion is the only budget the Factory may spend; Sofie-side model use (<=2 ops, <=300000 micro-USD) is accounted by MyEve |
| `candidateWriter` | `{ candidateSlot: 1, writerId, requestId }` ; `requestId` and `writerId` are deterministic uuids (see section 4) so a refresh or duplicate delivery can never name a second writer |
| `verifier` | `{ id: "independent-exact-artifact-verifier", verifiesExactArtifact: true, trustProducer: false, criteriaSha256 }` |
| `allowedEffects` | exactly `["candidate.create","repository.read","sandbox.write","verification.request"]` |
| `forbiddenEffects` | exactly `["deploy","merge","production","publication","repository.admin","secrets.mutate","workflows.mutate"]` |
| `issuedAt`, `notBefore`, `expiresAt` | `notBefore = issuedAt`; `expiresAt - issuedAt <= 180 s` of productive time plus 120 s of intake slack, i.e. `<= 300 s`; `expiresAt` never exceeds the MyEve allowance deadline |

The document contains no secrets, no tester identity beyond the opaque `ownerId`, and no model credentials.

## 2. Canonical project tuple

* `project.name` = `Alpha Tasks`
* `project.task` = `add a Priority field (exactly Low|Medium|High) shown on the task list`
* Ten acceptance criteria, in this exact order and wording (a Work whose criteria differ cannot receive this authority):
  1. `Existing tasks still display and function`
  2. `Creating or editing a task supports exactly Low, Medium and High`
  3. `Priority persists after reload`
  4. `The task list displays each task's priority`
  5. `An invalid priority is rejected`
  6. `Existing tests pass`
  7. `Focused tests cover creation, editing, persistence, display and invalid input`
  8. `No unrelated product or UI changes`
  9. `No production deployment or external publication`
  10. `An independent verifier checks the exact resulting source and artifact against these criteria rather than trusting the producer`
* `criteriaSha256 = digest({version:1, criteria:[<the ten strings in order>]})` = `266874e4e72dcce0f02ff58bedf56801d6e9906080ed6e7b987dc6537a20b466`
* `tupleSha256 = digest({version:1, project:"Alpha Tasks", task:"<task>", criteriaSha256})` = `22768f0af6d9aa49f6f0c6553bf1a44ee7599377c1b1935904b998167bf70577`

The Factory MUST recompute both from the `acceptanceCriteria` strings of the prepare request (same order, same text) and refuse any difference.

## 3. Canonical digest and signature

* `digest(v)` = lowercase hex SHA-256 over `JSON.stringify` of `v` after recursively sorting every object's keys ascending by UTF-16 code unit (arrays keep order). This is the existing MyEve `digest()` in `lib/engineering/contract.ts` and is stable across a PostgreSQL jsonb round trip.
* `authoritySha256 = digest(document)`.
* Signature: Ed25519 over the bytes `"MYEVE_EXTERNAL_ALPHA_WORK_AUTHORITY_V1" 0x00 authoritySha256(ascii hex)`, encoded base64url (86 chars, no padding).
* `keyId` = lowercase hex SHA-256 of the DER SubjectPublicKeyInfo of the Ed25519 public key. The Factory pins acceptable `keyId`s and public keys in its own reviewed configuration out of band and MUST reject unknown, expired or revoked keys.
* Envelope: `{ document, authoritySha256, signature, keyId }`. MyEve signs only inside its server process; the signing key is read from server-only configuration and is never written to the database, logs, commits or the authority document. Absent key means no authority can be issued.

## 4. Transport

`POST {factoryOrigin}/api/connect/v2/external-alpha/dispatches` using the existing authenticated Factory request headers. Body:

```
{ "authority": <envelope>,
  "prepare": <existing MYFACTORY_EXECUTION_V2 prepare body> }
```

The prepare body is exactly the existing cloud prepare body (`protocol, requestId, workId, workGeneration, repository, deadline, maxSpendUsd, source{repository,commit,tree}, input{title,description,kind,acceptanceCriteria,checkCommands,allowedPaths}`).

Derived identifiers (both sides compute and compare):
* `requestId` = uuid from `sha256("EXTERNAL_ALPHA_REQUEST_V1:" + authorityId)` first 32 hex, version nibble `8`, variant nibble `a`.
* `writerId` = same construction with prefix `EXTERNAL_ALPHA_WRITER_V1:`.

Follow-on calls (`GET /dispatches/{requestId}`, `/dispatches/{requestId}/dispatch`, `/dispatches/{requestId}/stop`, custody and result channels) are unchanged, but the Factory MUST serve them for an external-alpha `requestId` only when that `requestId` has a consumed authority, and MUST NOT accept a second authority for the same Work generation.

All external-alpha routes are DISABLED (HTTP 403, body `{"error":"EXTERNAL_ALPHA_AUTHORITY_DENIED","code":"<code>","admission":"DISABLED"}`) unless the Factory has an installed external-alpha configuration pinning the items in section 5.

## 5. Factory independent validation (all MUST pass, in one transaction with consumption)

Reference the codes in section 7. The Factory validates against its OWN configuration, not against fields in the document alone:

1. Strict schema parse of the document (`SCHEMA`).
2. `keyId` pinned and active, signature verifies over `authoritySha256`, and `digest(document) == authoritySha256` (`SIGNATURE`).
3. Time: `notBefore <= now < expiresAt` using the Factory clock, and `prepare.deadline <= expiresAt` (`EXPIRED`, `NOT_YET_VALID`).
4. Derived identifiers: `authorityId`, `idempotencyKey` shape, `requestId`, `writerId` re-derived and equal; `prepare.requestId == candidateWriter.requestId` (`IDENTIFIER`).
5. Owner / application: `ownerId`, `application.clientId`, `application.projectId`, `cohortId`, `slot`, `policySha256` equal the Factory's pinned external-alpha installation for this deployment (`OWNER`).
6. Source: `prepare.repository == source.repository`, `prepare.source.commit == source.baseSha`, `prepare.source.tree == source.treeSha`, Factory source digest == `source.sourceDigest`, `prepare.input.allowedPaths` (sorted) == `source.allowedFiles` and the digest matches `allowedFilesSha256` (`SOURCE`, `FILES`).
7. Work: `prepare.workId == work.id`, `prepare.workGeneration == work.generation`, `sha256(prepare.input.description) == work.objectiveSha256`, `prepare.input.title == work.title` (`WORK`).
8. Project tuple: recompute `criteriaSha256` from `prepare.input.acceptanceCriteria` and `tupleSha256`; both equal the document and the constants in section 2; `criteriaCount == 10` (`TUPLE`).
9. Execution pins: `environment`, `executionProvider`, `harness`, `factoryVersion`, `model`, `verifier`, `allowedEffects`, `forbiddenEffects` equal Factory pins (`ENVIRONMENT`, `PROVIDER`, `FACTORY_VERSION`, `MODEL`, `VERIFIER`, `EFFECTS`).
10. Limits: `prepare.maxSpendUsd * 1e6 <= limits.factory.microusd`; the Factory's own per-Work ledger enforces `limits.factory.operations` (3) and `limits.factory.microusd` (1,000,000) and `productiveSeconds` (180), one candidate, one writer, regardless of MyEve (`LIMITS`).
11. Single consumption (section 6).

The verifier named in the document MUST verify the exact resulting source/artifact against the ten criteria independently; it must not trust producer-reported results.

## 6. Single consumption semantics

Factory side (authoritative): a table keyed UNIQUE on `authorityId` (and UNIQUE on `(workId, workGeneration)` and on `requestId`) recording `authoritySha256`, `requestId`, `workOrderId`, `consumedAt`. Consumption, validation and WorkOrder/writer creation happen in ONE transaction.
* First valid delivery: consumes and returns the readback (HTTP 200).
* Replay with the same `authorityId`, same `authoritySha256` and same `requestId` (browser refresh, duplicate controller delivery, retry after a lost response): idempotent, returns the same readback, creates NO second writer and mints nothing.
* Same `authorityId` with a different digest or `requestId`, or any other authority for the same Work generation: HTTP 409 `AUTHORITY_CONSUMED`.
* A consumed authority is never reusable, including after FAILED, CANCELLED or UNKNOWN outcomes. Retrying needs a new MyEve admission, which MyEve itself refuses within the same UTC day.

MyEve side (defence in depth, `external_alpha_work_authority` table): states `ISSUED -> DISPATCHING -> CONSUMED | UNKNOWN`, plus terminal `REVOKED | EXPIRED | CANCELLED | COMPLETED`. MyEve moves `ISSUED -> DISPATCHING` in a database transaction BEFORE any network send (compare-and-set; exactly one caller wins). A transport error or ambiguous response moves the authority to `UNKNOWN`, which blocks every further paid dispatch for that owner and cohort until an operator resolves it. MyEve may reconcile an `UNKNOWN`/`DISPATCHING` authority only by a read-only `GET /dispatches/{requestId}`; it never re-POSTs with a new identity.

## 7. Receipt

On first consumption and on idempotent replay, the Factory readback body gains `authorityReceipt: { authorityId, authoritySha256, requestId, workOrderId, consumedAt }` and `authorityReceiptSignature` (Ed25519, base64url) over `"MYFACTORY_EXTERNAL_ALPHA_RECEIPT_V1" 0x00 digest(authorityReceipt)` with a Factory key already pinned in MyEve's `keys` list. MyEve marks `CONSUMED` only after verifying it.

## 8. Error codes

Denial codes (Factory, HTTP 403 unless noted; MyEve raises the same strings as `Error.message` for its own checks):

`EXTERNAL_ALPHA_POLICY_REQUIRED`, `EXTERNAL_ALPHA_SIGNING_KEY_REQUIRED` (MyEve), `AUTHORITY_SCHEMA`, `AUTHORITY_SIGNATURE`, `AUTHORITY_EXPIRED`, `AUTHORITY_NOT_YET_VALID`, `AUTHORITY_IDENTIFIER`, `AUTHORITY_OWNER`, `AUTHORITY_SOURCE`, `AUTHORITY_FILES`, `AUTHORITY_WORK`, `AUTHORITY_TUPLE`, `AUTHORITY_ENVIRONMENT`, `AUTHORITY_PROVIDER`, `AUTHORITY_FACTORY_VERSION`, `AUTHORITY_MODEL`, `AUTHORITY_VERIFIER`, `AUTHORITY_EFFECTS`, `AUTHORITY_LIMITS`, `AUTHORITY_CONSUMED` (409), `AUTHORITY_REVOKED`, `AUTHORITY_UNKNOWN_FENCE`, `AUTHORITY_DISABLED`.

MyEve-only additional codes: `EXTERNAL_ALPHA_WORK_NOT_ELIGIBLE`, `EXTERNAL_ALPHA_TUPLE_MISMATCH`, `EXTERNAL_ALPHA_ADMISSION_DENIED`, `EXTERNAL_ALPHA_AUTHORITY_NOT_DISPATCHABLE`, `EXTERNAL_ALPHA_DISPATCH_UNKNOWN`, `EXTERNAL_ALPHA_RECEIPT_INVALID`.

## 9. Lifecycle events MyEve enforces before sending

Admission re-checks, under the policy row lock and the Work row lock, in one transaction with allowance reservation and authority insertion: policy active and unexpired and unrevoked; no UNKNOWN anywhere in the cohort; owner is the policy owner; Work is the exact current version/generation, personal scope, repository == policy repository, `max_cost_usd = 1.30`, `max_duration_seconds = 180`, criteria == section 2; UTC-day and lifetime allowance; one open Work per owner. Dispatch re-checks all of the above plus unexpired and `ISSUED`. Revocation (policy `revoked_at`), cancel, takeover or Work change before the `DISPATCHING` compare-and-set prevents sending. After consumption, cancel is a Factory `/stop` for the same `requestId`.

## 10. Accounting hand-off

Every Factory model operation is recorded in the Factory's per-Work ledger with `authorityId` and a unique operation id; the Factory readback `spend` is the settlement source. MyEve records Factory operations idempotently (unique per allowance and operation id) in the same durable ledger as Sofie chat and Sofie Work operations (migration 0086), so combined Work use is <=5 operations and <=1,300,000 micro-USD. An operation without a reported cost is `UNKNOWN`, keeps its full reservation and blocks further paid dispatch.

## 11. Open points the Factory side may amend (append a dated Amendment section, do not rewrite)

* Exact HTTP route name (if the Factory prefers a different prefix).
* Whether the Factory binds the `authorityReceipt` into its existing signed result channel.

## Amendment 1 (2026-10-06, MyEve implementer) - clarifications fixed by the implementation

1. Window: `expiresAt = issuedAt + 290 s` (not up to 300 s). The MyEve allowance deadline is `admission time + 300 s`; MyEve tolerates 10 s clock skew at admission. The Factory SHOULD still enforce `prepare.deadline <= expiresAt` and MUST enforce `now < expiresAt`.
2. `allowedFilesSha256` is `digest({version:1, files: allowedFiles})`; the canonical form is `{"files":[...],"version":1}`. `allowedFiles` MUST be sorted by byte order, unique, plain relative paths. The Factory compares the sorted `prepare.input.allowedPaths` to `source.allowedFiles` and to its own pinned file scope.
3. Derived identifiers, exactly: let `H = sha256_hex(string)`; `uuid(h) = h[0:8]-h[8:12]-"8"+h[13:16]-"a"+h[17:20]-h[20:32]`. `authorityId = uuid(idempotencyKey)`; `requestId = uuid(H("EXTERNAL_ALPHA_REQUEST_V1:" + authorityId))`; `writerId = uuid(H("EXTERNAL_ALPHA_WRITER_V1:" + authorityId))`. The Factory MUST recompute and compare.
4. `idempotencyKey` is computed over `{kind:"EXTERNAL_ALPHA_WORK_AUTHORITY_KEY_V1", policySha256, workId, workVersion, workGeneration, tupleSha256}` where `policySha256 = digest(installed policy object)`. The Factory cannot recompute `policySha256` unless it pins the policy digest; it MUST pin `policySha256` (it appears in the document) as part of its owner/application pin (item 5 of section 5).
5. The Work must be owner-delegated (`control = agent`, i.e. Given Back by the owner in /work) before MyEve issues authority. A paused Work receives none.
6. MyEve state change: `DISPATCHING -> CANCELLED` is permitted only for a definitive Factory denial (HTTP 403 body `{"error":"EXTERNAL_ALPHA_AUTHORITY_DENIED","code":...,"admission":"DISABLED"}` or HTTP 409 `AUTHORITY_CONSUMED` is NOT definitive and is treated as UNKNOWN). The Factory MUST therefore not consume an authority when it returns 403 with that body (validation and consumption are one transaction).
7. Receipt: the Factory readback MUST include `authorityReceipt` and `authorityReceiptSignature` on EVERY readback for the external-alpha `requestId` (not only the first), because MyEve verifies it on each reconcile. MyEve pins Factory receipt public keys (Ed25519, SPKI PEM, `keyId` = sha256 of SPKI DER) in its reviewed `MYEVE_EXTERNAL_ALPHA_WORK_CONFIG`.
8. Transport identity: MyEve calls with `Authorization: Bearer <MYEVE_EXTERNAL_ALPHA_FACTORY_TOKEN>` and the header `x-vercel-trusted-oidc-idp-token` carrying the tester deployment's own Vercel OIDC token (claims `project_id` = the tester deployment project from the policy, `environment` = `production`, `owner_id` = the reviewed team). The Factory SHOULD authorize that exact project id and MUST NOT accept the canary or synthetic-owner identity on these routes.
9. Spend ledger: `readback.spend` MUST be a valid `WORK_LEDGER_V2` object (existing `workSpendV2Schema`). MyEve records every `settled` and `unknown` operation by `operationId` into its allowance ledger (`factory:<operationId>:0`); `reserved`/`dispatched` operations are recorded only when they settle or become unknown. Factory limits: at most 3 operations and 1,000,000 micro-USD; a fourth operation or any exceedance recorded by MyEve fences the owner/cohort.
10. Follow-on routes used by MyEve: `GET {origin}/api/connect/v2/external-alpha/dispatches/{requestId}` (404 when unknown) and `POST .../dispatches/{requestId}/stop`. Both return the same readback shape as the consume response.
