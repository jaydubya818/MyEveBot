# Total Recall and governed learning inventory

Baseline: `be090db93b35c8edb9f38a3cac1344a2289c49bc`, committed Digital Worker integration. Local main and origin/main were inspected after fetch; exact SHAs and all worktree dirty states are recorded in `baseline.json`. Origin main lacks the committed Engineering Work/Knowledge integration present in this baseline. No worktree was stashed, reset, cleaned, or modified except the requested dedicated checkout. No main merge or deployment occurred.

## Existing capabilities

| Capability | Decision | Existing implementation / treatment |
| --- | --- | --- |
| Scoped personal/Agent/Goal/Task memory | IMPROVE | `agent/lib/memory-store.ts`, `lib/memory-scopes.ts`, migration 0009. Preserve canonical local DB, optional semantic provider, execution scope and gateway callers. Add exact duplicate identity, archive/correction atomicity, history inspection, secret-shaped exclusion, 20-result cap. |
| Supermemory | REUSE / IMPROVE | Optional ranking and legacy import; canonical local rows filter remote results. One configured container belongs only to the explicitly configured deployment owner. Other owners cannot upload/query against it. Provider timeouts, uncertain writes and verified remote deletion stay explicit. |
| Knowledge types | REUSE | Facts, observations, hypotheses, decisions, commitments, preferences, insights in `knowledge-types.ts` / `knowledge.ts`; do not build a second Knowledge store. |
| Provenance and graph | REUSE | `knowledge_sources`, `knowledge_provenance_links`, `knowledge_relationships` retain sources, hashes, captured time, origin, supports/contradicts/derived-from relationships. Engineering Knowledge adds owner/Work boundary through migration 0044. |
| Work history | REUSE | WorkStore objective, criteria revisions and events; existing execution/results/worker projection and Work-bound Knowledge. No changes to execution, routing, writer custody or verification. |
| File-derived facts | REUSE / PARTIAL | Existing file inventory and Knowledge file sources retain identity. This work does not add or qualify an automatic file extraction/indexing pipeline. |
| Feedback | REUSE / IMPROVE | Existing outcomes and M6 draft feedback remain intact. New owner feedback review records Work revision, owner, explicit Work/repository+Work-type scope, target reference, evidence and candidate version. Non-Work target references are owner claims, not independently verified artifacts. |
| Skills | REUSE | Existing package/content hashes and skill evaluation remain unchanged. This slice does not rewrite Skills; skill-linked feedback is evidence only. |
| Nightly consolidation | DEPRECATE unsafe instructions | Removed latest-wins conflict resolution, deletion of historical evidence, and automatic promotion of repeated observations to permanent preferences. Nightly review cannot govern learning. |
| Cross-session recall | REUSE / QUALIFY | Database-backed Memory independent of transcript replay. New fresh-process/lost-response tests exercise writes and corrections. |
| Work reuse | PARTIAL | Existing Work facts remain private to their Work. Explicit repository-scoped learning can be retrieved for comparable Work by the new service. No automatic cross-Work fact copying or sharing. |
| Learning draft contract | REUSE | `digital-worker/learning.ts`, `engineering/learning-drafts.ts`, migration 0046 continue to mean unverified drafts. Never relabel a draft as active. |
| Evaluation/promotion/rejection/rollback | MISSING → proposed implementation | New `lib/total-recall` service and standalone review UI. Only predefined source-citation and uncertainty-labeling behaviors are eligible; evaluation runs code-owned fixtures. Database activation is blocked by shared migration ownership. |
| Capsule / Relay sharing | OUT OF SCOPE | No portable-memory export, corporate→personal transfer, Relay payload changes or new sharing grants. |

## Ownership and schema boundary

The active integration worktree has uncommitted `0057_factory_preparation_intent.sql` and edits to `database-schema.ts` (see initial inventory). Per the request, no migration was created and the shared schema registry was not edited. `proposed-schema.sql` is an unapplied design/qualification artifact. It was used only in disposable databases with unique `recall_test_*` names. Existing integration tests likewise create and remove their own databases. Local PostgreSQL listeners already existed, so no existing server was restarted or stopped.

The governance inventory is also active in integration. This branch changes only the two Memory-owned fingerprints and adds four Learning entries; merge those entries without replacing concurrent Factory entries. No governance rules or protected-verification code changed.

## Memory behavior and Current Truth

- Personal memory uses owner scope. Agent, Goal and Task scopes remain separate. Project memory remains unavailable until its authorization provider is qualified.
- Preferences use existing Knowledge preferences for explicit origin and scope. Procedural memory is a learning candidate, not an automatic behavioral instruction.
- Knowledge facts have typed status and source links. File facts retain their file source. Observations/inferences are not owner assertions simply because they came from chat.
- Current local Memory has `truthState=current`; archived corrections are historical. This status means the canonical active record, not proof that an observation is objectively true. Memory origin labels an owner correction separately from observations.
- Correction preserves the predecessor and source chain. Ordinary search excludes archived/deleted records. Replaying an original fact written with the new stable identity cannot reactivate it.
- Conflicting free-text memories are retained; the system does not infer a semantic conflict key or automatically choose a winner. Typed Knowledge already represents contradicted/uncertain claims.
- Exact duplicates written through the new path share identity and confirmation time. This does not deduplicate old random-ID rows, semantic paraphrases, or separately corrected copies; full repeated-evidence lineage remains a schema dependency.
- A remote-unknown memory still requires reconciliation before correction/deletion. Remote corrections verify deletion of the old provider copy, then atomically archive/replace locally. The new correction is explicitly local-only, not falsely reported as synced. A crash before the local commit leaves the old canonical record for retry.
