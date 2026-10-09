# Total Recall integration package

**READY_FOR_INTEGRATION — schema activation BLOCKED.** This is an unnumbered, unapplied package for the canonical Digital Worker integration owner. It does not enable production learning, live Sofie reuse, Capsule export or execution. Supersedes the schema proposal and integration limitations at checkpoint `4b31ddebe8235fc1efca154d41ee37061be2a444`; historical evidence remains retained.

- [Contracts and consumer obligations](contracts.md)
- [Exact integration crosswalk](crosswalk.md)
- [Schema](schema.sql), [empty/disposable rollback](rollback.sql), [machine-readable handoff](manifest.json)
- [Current qualification](../../verification/total-recall-learning/integration-preparation/README.md)

## Migration ownership and application

Only the owner of `codex/digital-worker-integration` allocates a migration filename and changes `apps/eve/lib/database-schema.ts`. This branch has changed neither the shared 0057 nor that registry nor any file under `apps/eve/migrations/`. The observed canonical head is recorded in the manifest; it is a read-only snapshot, not permission to claim a number. Other workstreams may advance before integration.

After ownership is resolved, copy `schema.sql` byte-for-byte to `apps/eve/migrations/<allocated>_total_recall_learning.sql`. Set `CURRENT_DATABASE_MIGRATION` in `apps/eve/lib/database-schema.ts` to the actual latest canonical migration (this new filename if it is last). The existing migration runner discovers the file, splits PostgreSQL dollar-quoted functions safely, hashes exact bytes, and records the ledger entry in its migration transaction. Preserve every existing checksum, reconciliation manifest and canonical migration. Do not edit the historical deployed-lineage JSON.

The schema depends on canonical `engineering_work`, Work version/scope ownership, and application-managed Knowledge/Memory tables already in the chain. It adds only:

| Object | Purpose and constraint |
| --- | --- |
| `recall_learning` | Owner/family primary key; personal scope; exact repository/work-type/optional Work binding; revision CAS; consistent JSON aggregate; Work foreign key; owner/repository/type/Work index |
| `recall_learning_events` | Owner/event UUID uniqueness across families prevents feedback/decision replay into a different scope; family foreign key |
| `recall_learning_uses` | Owner/Work/family/version/context identity, exact candidate hash, Work/family foreign keys; Work/time index; verifies active matching version on insert |
| Integrity triggers | Append-only event prefix and immutable version identity/evaluated evidence; ordered versions, closed behaviors/statuses, one active qualified version, provenance owner/Work/repository check, 40 versions/100 evidence/400 events |
| Read policies | RLS on all three tables; explicit SELECT grants only; authenticated SQL role name must equal owner ID; no client-set session variable as an owner grant |

The trusted existing application/table-owner connection bypasses RLS in the normal PostgreSQL way and must retain the service's authenticated owner predicates. Do not expose that connection to clients. The package does not create roles, grant DML to public/restricted readers, or invent a role-provisioning scheme. Restricted role writes are denied. A shared restricted pool cannot impersonate owner IDs with `set_config`; without a trusted role mapping it sees no owner's rows. Trigger functions are not granted to PUBLIC.

Backfill: **none**. Existing Memory, Knowledge, Work, Result and `engineering_learning_drafts` remain untouched. Drafts do not become candidates or promoted versions. Earlier disposable proposal records are test data, not migration sources. Any future retained-data import needs explicit mapping and reevaluation; do not silently rehash or activate old records.

## Qualification and rollback

From the integrated root with dependencies installed, run:

```sh
npm run test --workspace=eve-agent
npm run typecheck --workspace=eve-agent
npm run build
node --import tsx apps/eve/test/total-recall.integration.mjs
node --import tsx apps/eve/test/recall-integration-preparation.mjs
```

The two database scripts pin loopback PostgreSQL port 55479 and an administrative `postgres` connection, create uniquely named disposable databases, apply the branch's canonical migration chain plus this proposal, and remove their databases. The second also creates and removes a unique NOLOGIN test reader role. It tests the existing statement splitter/transaction semantics, installation retry failure, constraints, actual cross-owner RLS, forbidden writes, and rollback isolation. They never apply this proposal to a live database. Both harnesses skip proposal installation when the canonical migration chain already provides `recall_learning`; rerun the same journeys against the combined chain and the normal migration runner's applied/no-op retry checks. Do not add a second copy of the tables.

For a failed migration transaction, the canonical runner must roll back schema and ledger together. After activation, operational rollback means disable retrieval/review feature exposure and preserve retained families, evidence and usage receipts. The supplied destructive rollback SQL is for a disposable database or confirmed empty, unactivated installation only; the test exercises it inside a transaction and proves canonical Works survive. Removing data-bearing production tables is not an approved rollback. Application learning rollback is separate: exact qualified replacements can restore their prior version; owner-corrected guidance can never be restored automatically.

Do not change the qualification API gate to claim production readiness. Activate canonical hooks only in the integrated qualification environment first; prove real Sofie context delivery, accepted Result provenance and owner decisions with the integrated schema. Live-model improvement remains NOT_PROVEN until a real comparative journey and owner acceptance exist.
