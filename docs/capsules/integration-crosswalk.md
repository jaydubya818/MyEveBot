# Capsule integration preparation — 2026-09-27

Supersedes the integration-readiness assessment at `bf7a45158dc14f7d38d14ad35ae84218b4866c0c`. Its core qualification remains accepted. This tranche does not claim live readiness.

CAPSULE CORE: LOCALLY QUALIFIED

SECOND-EVE BENEFIT: PASS — deterministic fixtures

CANONICAL MEMORY EXPORT POLICY: INTEGRATION PENDING

CANONICAL ACTIVATION: INTEGRATION PENDING

LIVE DESIGN-PARTNER CAPSULE: NOT_RUN

## Ownership and exact dependencies

Future target: `myeve-beta-integration`. No merge, canonical persistence changes, shared migrations, Builder provisioning, Factory/Gate B/C or Digital Worker integration-branch edits are part of this tranche.

| Integration point | Capsule-owned file / entry point | Required external hook and boundary |
|---|---|---|
| Total Recall representation | `apps/eve/lib/capsules/total-recall-adapter.ts`, `inspectTotalRecallRepresentation` | `lib/total-recall/projections.ts:portableMemoryRecord`, exported `PortableMemoryRepresentation` v1. Read-only authenticated owner projection; never promote its `eligible:false` to consent. |
| Memory export policy | `integration-contract.ts:CanonicalExportPolicy.canExport`, `checkCanonicalExport` | Memory supplies fresh authoritative policy per item, destination and explicit selection, bound to full item/context digests and policy revision. Wire into `service.ts` source catalog/export resolution after policy is available. |
| Atomic activation | `integration-contract.ts:CanonicalActivation` | Canonical stage/validate/preview/activate/rollback/recover implementation, authenticated destination identity, transactional Current Truth/qualification recheck, revision CAS and idempotent receipt. Current `staging-store.ts` only stores inert reviews. |
| Learning scope | `portableScopeSchema`, `portableExperienceSchema`, `preservesScope` | Resolve exact Total Recall family/version/hash/status/evaluation and original owner/repository/workType/optional workId. Every non-null source restriction remains identical; target may add restrictions. Never rewrite Total Recall's scope model. |
| Skill qualification | `CanonicalQualification.read` and `previewActivation` | Destination qualifier binds full portable digest (configuration/version/provenance included), destination Eve, target scope digest, qualifier version and PASS. Source claims cannot satisfy this service. |
| Role/Pack activation | Same qualification and atomic activation ports | Destination validates portable configuration/dependencies; any credentials, grants, provider/writer authority are rejected. Role names confer no account roles. No executable installer in Capsule. |
| Builder | Bounded sequence below | Builder-owned destination creation and independently authenticated identity; optional Capsule preview and inert stage. Independent apps/repository/provider/Relay/credentials setup. |
| UI | `apps/eve/app/capsules/page.tsx`, `components/capsules/capsule-panel.tsx`, `capsule-panel.module.css`; existing `components/knowledge-panel.tsx` entry | Source policy availability, empty/error/loading states, explicit item selection, conflict choices, inactive qualification and separate future activation review. Do not relabel “saved” as “active.” |
| Services | `apps/eve/app/api/capsules/route.ts`; `lib/capsules/{service,memory-adapter,staging-store,format,import,security,schema}.ts` | Signed owner auth, same-origin requests, fresh server-resolved policy, bounded JSON, owner-private staging. Inject canonical destination; replace placeholder identity/project mapping only at integration. |
| Schema | No Capsule-specific migration | Existing `owner_data_operations` remains an inert 30-day review store. Atomic active records/receipts must participate in canonical Memory's transaction and schema ownership. Never infer activation from a completed staging operation. |
| Acceptance | `apps/eve/test/capsules/integration/acceptance.ts`; `lib/capsules/integration.test.ts` | Supply disposable canonical driver implementing `AcceptanceFactory`; run the identical assertions. Fixture and canonical suites are separately named; missing canonical driver is explicitly skipped. |

All short filenames in the table are under `apps/eve/lib/capsules/` unless a full repository path is shown.

## Observed Total Recall contract

Read-only inspection: worktree `total-recall-learning`, base HEAD `4b31ddebe8235fc1efca154d41ee37061be2a444`, draft uncommitted contract on 2026-09-27. The draft is not represented as a released canonical dependency. Integrators must pin its eventual commit and rerun the adapter tests.

Observed SHA-256 of `projections.ts`: `dc7f22bc3204804842b7489455c2e2a9256b786d7f797ee210077e4f44ee061f`. `retrieval-contract.ts`: `755435ab99b1e29c63704da2dfe550738f2c4db1dfb9ca5680f8bf2ad9c54589`. Source documentation: `docs/integration/total-recall/contracts.md`, section Portable Sofie. No files in that worktree were written.

| Canonical v1 field | Capsule adapter result | Export/activation consequence |
|---|---|---|
| identity / kind / text / contentHash | sourceIdentity / kind / text / sourceContentHash | Canonical digest hashes RecallItem, not Capsule bytes; never treat it as a signature. |
| ownerId | scope.ownerRef via ownerReference | Match authenticated owner before projection; cross-owner transport unsupported. |
| scope.kind OWNER, null work/repository | nullable facet scope | Private visibility is UNKNOWN export classification, not shareable. |
| scope.kind WORK + workId/repository | exact workId/repository facets | Preserve Work privacy. Block wire 1.1 conversion; never flatten to owner or new Work. |
| privacy PRIVATE / WORK_SCOPED | privacy preserved | No canonical SHAREABLE value exists. No corporate/project eligibility inferred. |
| provenance[] | preserved, including null hashes and relation | Keep unverified source claims distinct from destination verification. No source-reference fetching. |
| currentTruth | status, supersedesId, supersededById preserved | Historical/conflicting/stale/superseded cannot become current by import. |
| learningVersion id/version/hash | preserved exact reference | Insufficient for activation: resolve family scope/status and full evidence separately. Canonical hashes are bare hex; Capsule envelope digests have `sha256:` prefix. |
| portability.eligible=false, reason | exportAllowed=false, blockers | Requires canonical policy; no caller override. |
| authorityGrants=[] | strict empty tuple | Any nonempty authority payload or contract drift fails parsing. |

The adapter is intentionally a projection/inspection boundary, not a second Total Recall implementation. It does not manufacture missing semantic keys, observed timestamps, evaluations or permissions.

## Export policy contract

`canExport(item, context)` receives the complete portable representation and an authenticated owner/destination context with exact selected IDs, target scope and purpose `capsule_export`. A verdict contains `allowed`, `policyRevision`, `reason`, `itemDigest`, `contextDigest`. Capsule independently refuses missing selection, cross-owner access, scope widening, unknown/private-nonportable/corporate classification, history/supersession and non-promoted or failed-evaluation learning. An unbound verdict cannot grant export.

Memory owns how policy is decided, expiry/revocation and classification. Work/project-scoped records require the exact restrictions and source consent; an owner-visible or SHAREABLE label alone is not authorization. The current production adapter continues returning unknown portability. Policy is re-read on export; a prior preview is never permanent consent.

## Stage → validate → preview → activate → rollback/recover

1. **Stage:** persist a bounded, immutable, owner-private inactive batch with stable operation identity. Different bytes under the same identity fail. No retrieval of active guidance yet.
2. **Validate:** schema, scrubber, source representation integrity/verification, scope, current status, supported version, canonical policy and qualification. Source history remains history. Source claims are untrusted until verified by destination services.
3. **Preview:** bind complete batch, explicit selected item digests, target scope, destination revision, Current Truth and qualification state in a review digest. Default to retaining destination Current Truth. Multiple incoming corrections of one semantic key must be resolved before activation. There is no overwrite flag.
4. **Activate:** authenticated destination re-reads authoritative source/policy and destination qualification under its canonical transaction/locking protocol. Compare revision and review digest; require every selected item to be eligible. Commit all selected active records plus provenance and receipt atomically. No partially successful batch. Unsupported major versions remain inactive. Source evaluation alone never activates Skills/procedures/Roles/Packs/learning.
5. **Recover:** return the durable original receipt, or no receipt if no transaction committed. Retry cannot duplicate active experience. Recovery after rollback returns the rolled-back receipt and cannot reactivate it.
6. **Rollback:** atomically remove only this batch's unchanged active records and update receipt/revision. If later Current Truth or other state changed, refuse automatic rollback and require a new canonical correction review. Never restore an old snapshot over newer local records.

The executable disposable SQLite driver tests these transaction semantics. It is in `test/`, never production-imported, and does not prove canonical database behavior. Real SIGKILL checkpoints: stage, validate, preview, activation begin, first active row, receipt written before commit, activation committed, rollback rows removed, rollback receipt before commit, rollback committed. Reopen yields all or none; recovery/retry/rollback remains idempotent. Existing core adds nine independent export/staging crash checkpoints.

## Learning and wire-version boundary

The Capsule-owned integration envelope includes learning family ID, positive version, hash, exact scope, status, evaluator version, candidate hash, PASS/FAIL and evidence references. It binds complete provenance and supersession. Candidate/evaluating/rejected/superseded/rolled-back or mismatched evaluation hashes stay inactive even when a fixture qualifier returns PASS. Target scope must preserve or narrow every facet.

Format 1.1 is unchanged. It can stage a promoted-learning description and qualification reference, but cannot encode canonical Work/repository/workType constraints or the complete evaluation envelope. Therefore **canonical scoped-learning transport is PARTIAL / integration pending**, with no lossy conversion enabled. A future canonical-backed wire revision must carry these fields, be bound by manifest/item digests, and reject unsupported readers before source export. This tranche qualifies the representation and adapter boundary rather than inventing a competing canonical scope implementation.

## Bounded Builder sequence

`new Eve → optional Capsule → preview → inert import/stage → independently connect authority`

Builder first creates its destination through its own authorized provisioning flow. Skipping Capsule is always valid. A supplied Capsule uses the existing authenticated preview and explicit per-item decisions. Retained context and unqualified behavior remain visibly inactive. Canonical activation, when available, is a separate exact-review transaction. The new Eve still needs its own connected apps, repository grants, provider authority, Relay grants and credentials. Capsules never provision these, inherit source permissions or resolve active Work ownership. No Builder files changed.

## Acceptance commands

From `apps/eve`:

```sh
CAPSULE_TEST_PG_SOCKET=/tmp/capsule-pg-qualification/socket ../../node_modules/.bin/vitest run lib/capsules app/api/capsules
../../node_modules/.bin/tsx scripts/qualify-capsules.ts
```

The PostgreSQL socket must be the isolated disposable test cluster, not a production connection. Without it the four PostgreSQL cases explicitly skip.

Canonical mode, only after the integration owner provides a disposable canonical driver:

```sh
CAPSULE_CANONICAL_ACCEPTANCE=1 CAPSULE_CANONICAL_DRIVER=/absolute/path/canonical-capsule-driver.ts ../../node_modules/.bin/vitest run lib/capsules/integration.test.ts
```

The module exports `AcceptanceFactory` with `mode:"canonical"`, `disposable:true`, and `open()` returning real canonical hooks, observation/seed/qualification helpers and cleanup. It must authorize only synthetic fixtures, restart the real consumer/storage connection, and never write a live owner. A missing/incorrect canonical driver fails requested canonical mode; it is never silently substituted with the fixture. Fixture mode always remains separately labeled.
