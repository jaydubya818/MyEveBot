# Memory, Knowledge and governed learning

Sofie’s continuity comes from scoped durable Memory, typed Knowledge with provenance, and Work history. Learning is separate: feedback proposes a bounded change, qualification measures it, and the authenticated owner decides whether it should apply. Neither store grants execution authority.

**Status: not ready for design partners.** Memory improvements are locally qualified. Learning service, API and review UI are implemented and qualified against a disposable PostgreSQL database, but the proposed schema is not in the migration chain. There is no live model or design-partner golden journey yet. See [evidence and limitations](verification/total-recall-learning/README.md) and [inventory](verification/total-recall-learning/INVENTORY.md).

## For owners

Use existing Memory/Knowledge controls to inspect sources and correct a mistaken fact. Corrections preserve history and replace the active value. A semantic provider outage does not discard a locally saved memory. `local_only` means saved locally; `remote_unknown` means a provider write may have succeeded and must be reconciled before remote deletion/correction can be claimed.

In the isolated qualification environment, open `/learning` to review learning:

1. Select Work and give feedback. Select only that Work, or comparable Work in the same repository and selected Work type. Feedback creates a candidate, never active guidance.
2. Evaluate the candidate. The source-citation fixture measures original-source coverage; the uncertainty fixture measures origin/truth labeling. The page shows baseline and learned scores and keeps the evidence.
3. Promote only after reviewing a passing evaluation. Promotion identifies the exact version/hash and scope. A competing active rule requires an explicit correction.
4. Correct active guidance to withdraw it immediately and create a replacement candidate. Evaluate and promote the replacement separately.
5. Roll back to withdraw a promoted version. Past Work keeps its usage attribution. Rollback does not silently restore a previously corrected rule; restoration requires a fresh candidate and evaluation.

The current behavior choices are citing original sources and labeling uncertainty. Arbitrary feedback text cannot become a system prompt, executable procedure, modified Skill, tool grant or policy. Feedback should describe what helped; do not include passwords or credentials.

## Architecture and trust

Existing `memory_records` remain canonical for scoped Memory. Supermemory ranks only known local records within the current owner/execution scope. One configured provider container is restricted to its configured owner. Search is bounded to 20 results. A correction archives the predecessor and inserts the replacement atomically. Historical reads are owner-only and excluded from normal retrieval.

Existing Knowledge retains typed records, source identity, graph relationships and correction links. Work retains objectives, criteria and versioned activity. The memory-type and privacy matrix is in the inventory. No private memory is automatically shared with Relay, another owner, another Work, or a future Capsule.

Learning uses `LearningStore` over the existing authenticated personal `WorkStore`. Each exact Work/repository+Work-type scope has one versioned aggregate with revision compare-and-swap. Sources retain owner feedback identity and Work revision. Criteria refer back to their immutable Work revision and content hash. The source target for Result/response/Skill/memory feedback remains an owner assertion until an artifact-specific verifier is added.

Candidates follow `CANDIDATE → evaluation → PROMOTED / REJECTED`, followed by `SUPERSEDED` or `ROLLED_BACK`. Evaluation is synchronous and atomic; no partial `EVALUATING` record is made active. An interrupted transaction leaves either the prior state or the complete next state. Stable event IDs make lost-response retry idempotent. Hashes use canonical object ordering so PostgreSQL JSONB normalization does not change identity.

Only the registered behavior ID can supply guidance; free-text notes are evidence for the owner UI, never prompt instructions. The evaluator is code-owned and API clients cannot submit a PASS. Promotion must reference the exact hash and revision. Retrieved guidance carries identity/version, explicit scope, provenance and `ADVISORY_ONLY`; retrieval records a scoped version/hash/context receipt. Concurrent opposing candidates cannot both promote. Conflicting Work/repository guidance yields no guidance. A receipt records retrieval, not proof that a model followed it or that the owner accepted a later result.

History is bounded to 40 versions, 100 total evidence items and 400 events per scope. List pages cap at 25 scopes. Retrieval selects at most two scope families. Reaching a history cap stops new writes with an operator archival error; archival is not implemented in this slice.

No component writes Action Gateway rules, grants, approvals, credentials, writer custody, routing, publication permissions, budgets, retention or privacy configuration. Corporate scopes, project tenancy and personal portability are not enabled.

## Operator integration boundary

Do not deploy this feature by manually applying the proposed SQL to a live database. The integration owner must allocate the migration after their active migration, review the proposal, add it to the canonical registry, and qualify the combined schema. Existing `engineering_learning_drafts` remain unverified staging and are not silently imported.

The review API requires existing Engineering dogfood authentication, same-origin mutation checks, and `MYEVE_TOTAL_RECALL_MODE=qualification`. It returns unavailable without that mode and refuses hosted production (`VERCEL_ENV=production`). No agent tool can promote learning. There is no automatic hook injecting the new learning into Sofie until a trusted Work-type binding, final context budget and schema integration are qualified.

Use `LearningStore.retrieve(workId, workType, contextRef)` only with authenticated, server-bound Work context after integration. The Work type must not be inferred as a new permission from memory or arbitrary model text. Integrate the returned guidance as advisory context and retain its receipt alongside the real Work result before claiming measured reuse.

## Reproduce local qualification

From repository root, install the lockfile with `npm ci --ignore-scripts`, then:

```sh
npm run test --workspace=eve-agent
npm run typecheck --workspace=eve-agent
npm run build
node --import tsx apps/eve/test/total-recall.integration.mjs
```

The database qualification requires loopback PostgreSQL at `127.0.0.1:55479`, an administrative `postgres` database, and permission to create disposable databases. It applies canonical migrations plus the unapplied schema proposal only to a unique temporary database and drops that database afterward. It never reads a production DATABASE_URL. Use `RECALL_TEST_ADMIN_URL` only for that same loopback endpoint. Existing Knowledge qualification runs from `apps/eve` using `node --import tsx test/engineering-knowledge.integration.mjs` against its separately pinned local endpoint.
