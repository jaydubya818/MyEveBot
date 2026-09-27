# Canonical Memory integration contract

The Total Recall + Learning workstream owns Memory/Knowledge persistence, Current Truth, scoped retrieval and learning promotion. Capsule-owned modules live under `lib/capsules`; they do not change those internals.

The initial read-only adapter consumes `OwnerKnowledgeView` from `searchOwnerKnowledge`. Missing source portability policy is represented as `unknown`; source content from ineligible records is not sent to the builder. Owner visibility is insufficient evidence of shareability.

Before live export, the Memory owner must provide stable canonical semantic keys and source revision, owner and project scope, explicit portability/classification policy, source category, status and full permitted provenance. Fetch those facts from the authenticated server immediately before export. A browser/model/foreign Capsule must never supply trusted policy facts. Current `projectOwnerKnowledge` is a conservative compatibility projection, not a substitute for that contract; its IDs/titles are not a complete semantic-conflict model.

Before activation, provide `CapsuleDestinationAdapter` with an atomic owner-scoped commit that:

- Re-fetches current source policy/revocation where applicable and the destination's Current Truth and authorized scope inside the canonical transaction.
- Compares the reviewed revision, records idempotency and provenance atomically, and either completes all selected writes or none.
- Uses canonical correction/conflict decisions; never silently supersedes established truth.
- Preserves private project scope, destination Eve restriction and `untrusted_import` provenance during retrieval.
- Keeps Skills/Role/Pack/procedure qualification and learning promotion separate from import.

The production `CapsuleStagingStore` intentionally does not satisfy live activation: it stores inert owner review material in an existing table. Concurrent changes to canonical Current Truth cannot be overwritten because this implementation never writes it. `FixtureDestination` implements atomic compare-and-commit for synthetic qualification and deterministic scoped retrieval only. It is not shipped as a replacement Memory service.

At read-only inspection, Total Recall's M6 `qualifiedLearningSchema` included `QUALIFIED`, `ADVISORY_ONLY`, owner/agent/scope, recommendation/rationale, Work/version, candidate hash, qualification and review references. Its M7 engineering Capsule accepted only MEMORY, LEARNING and PACK_REF, personal owner/agent scope, lineage and source/revocation facts. This branch defines no competing promotion policy. A future M7 conversion adapter must preserve those facts and reject unsupported semantics; M7 files currently fail explicitly.

No schema migration was added. Digital Worker's dirty migration 0057 was left untouched. The Capsule governance entries are additive registrations of Capsule-owned files; existing executor classifications and the checker are unchanged.


## Final read-only dependency refresh

Before completion, Total Recall advanced to `4b31ddebe8235fc1efca154d41ee37061be2a444` (implementation `3416014`). Its worktree was clean. Inspected `lib/total-recall/learning.ts`, `store.ts`, and `docs/digital-worker/total-recall-learning.md` without merging or editing them.

The newer `LearningStore.retrieve(workId, workType, contextRef)` returns qualified `ADVISORY_ONLY` records with family ID, version/hash, owner/repository/Work-type/optional Work scope, closed-registry guidance (`cite_sources` or `state_uncertainty`) and source feedback references. It enforces promoted status, exact passing evaluation hash and usage receipts. Its proposed schema and live context integration are not activated.

Capsule 1.1 cannot faithfully encode repository + Work-type + optional Work applicability. These records must remain unsupported, even after promotion, until a versioned compatibility adapter preserves every restriction and authoritative portability policy is available. Do not map repository/Work-scoped learning to owner-global guidance. The current promoted-learning fixture is synthetic owner-scoped contract qualification only; it is **not** an export of the new Total Recall store. A future adapter must consume its retrieval/status/rollback contract, not copy the learning engine or promote imported behavior.
