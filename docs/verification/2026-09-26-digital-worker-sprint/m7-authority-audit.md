# M7 portable experience: persistence authority audit

**Verdict: contract only.** The current capsule validator and preview are useful format checks, but no authenticated service can truthfully supply all the facts required for a durable export or import. Do not expose `buildExperienceCapsule` or `prepareExperienceImport` by passing request JSON as their `exportFactsInput` or `factsInput`, and do not treat a capsule digest as a producer signature.

## Existing boundaries

- `apps/eve/lib/digital-worker/capsules.ts` validates a bounded, owner-scoped format and constructs `STAGED` / `IMPORTED_CONTEXT` records and non-activating pack suggestions. It performs **no database write**. Its export review, import approval, revocation status, source records, and pack manifests are values supplied by its caller, not facts it fetches.
- `apps/eve/app/api/agents/route.ts` authenticates the web owner, and `apps/eve/lib/agents.ts` creates owner-scoped Agents. It does not bind a new Agent to an import in one transaction or distinguish a newly created import target from an existing Agent.
- `memory_records` has owner/scope, current content/status and `updated_at`, but no immutable source revision or exact capsule-selection review. `apps/eve/app/api/owner-knowledge/route.ts` supports inspection, correction and forgetting; its “needs review” filter is not an export or import approval.
- M6 currently persists `DRAFT_UNVERIFIED` learning candidates in `engineering_learning_drafts`. There is no authenticated qualification/promotion store producing `QUALIFIED` learning records for M7 to verify.
- Role and capability pack manifests are code constants in `apps/eve/lib/digital-worker/packs.ts`. There is no persisted catalog with a trusted `AVAILABLE` state and exact manifest hash/revocation query.
- There is no owner-scoped capsule export, exact import approval, revocation registry, import staging writer, or idempotency uniqueness constraint. A second worker has not consumed imported experience.

## Contracts required before a persistence writer

1. Build the export preview from current owner-scoped source rows under authenticated owner identity. Select exact item IDs, statuses, scopes, revisions and content hashes; refuse deleted/superseded material and ineligible topics. The owner must review the displayed contents and exact item digests. Persist that decision with reviewer, time, source Agent and immutable selection digest. A model's assertion or a client-supplied `reviewRef` is not a decision.
2. Persist a versioned capsule snapshot and owner-scoped revocation state. The snapshot must be derived from the reviewed rows, not from a submitted capsule body. Check source status and revision again during export. Changes to source content, scope or status require another review. Revocation must fail closed and remain queryable after content deletion.
3. Before import, fetch an authenticated exact-digest owner approval, current source revisions/statuses, pack catalog facts and revocation state from trusted stores. Lock/recheck them in the same transaction as staging. Bind the transaction to a newly created Agent owned by the same owner. Enforce the `(owner, capsule digest, target Agent)` idempotency key in SQL.
4. Keep imported records in a separate staged, agent-scoped store with provenance and `IMPORTED_CONTEXT` trust. Pack references remain suggestions. Do not copy active Work, repository grants, credentials, Relay relationships, approval decisions, leases or capabilities. A later owner decision and a context-assembly policy must explicitly control promotion/retrieval.

## Qualification still needed

Exercise a real owner preview/review/export, revoked and changed-source denials, duplicate concurrent import, cross-owner denial, and a new Agent that retrieves approved context only. Inspect its capabilities and authority before/after import and verify no Work, credentials, grants or active pack assignment moved. The current unit tests prove only the pure format boundary; no M7 end-to-end or UI claim is justified.

No `0047` migration was added during this audit: a table or writer with no trustworthy approval, qualification, source and revocation producers would be a false persistence boundary.
