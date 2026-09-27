# Memory, Knowledge and governed learning

Sofie’s continuity comes from scoped durable Memory, typed Knowledge with provenance, and Work history. Learning is separate: feedback proposes a bounded change, qualification measures it, and the authenticated owner decides whether it should apply. Neither store grants execution authority.

**Status: READY_FOR_INTEGRATION; schema activation BLOCKED.** This continuation supersedes the previous partial integration status. Local contracts, restart reuse, lifecycle, rollback restoration and deterministic improvement are qualified; live design-partner readiness is not claimed. See the [current evidence](verification/total-recall-learning/integration-preparation/README.md), [integration package](integration/total-recall/README.md), [exact contracts](integration/total-recall/contracts.md), and [historical inventory](verification/total-recall-learning/INVENTORY.md).

| Area | Status |
| --- | --- |
| MEMORY CORE | LOCALLY QUALIFIED |
| CANONICAL WORK RETRIEVAL | INTEGRATION PENDING |
| LEARNING CORE | LOCALLY QUALIFIED / RUNTIME ACTIVATION PENDING |
| LIVE SOFIE REUSE | NOT_RUN |
| LIVE MODEL IMPROVEMENT | NOT_PROVEN |


## For owners

Use existing Memory/Knowledge controls to inspect sources and correct a mistaken fact. Corrections preserve history and replace the active value. A semantic provider outage does not discard a locally saved memory. `local_only` means saved locally; `remote_unknown` means a provider write may have succeeded and must be reconciled before remote deletion/correction can be claimed.

In the isolated qualification environment, open `/learning` to review learning:

1. Select Work and give feedback. Select only that Work, or comparable Work in the same repository and selected Work type. Feedback creates a candidate, never active guidance.
2. Evaluate the candidate. The source-citation fixture measures original-source coverage; the uncertainty fixture measures origin/truth labeling. The page shows baseline and learned scores and keeps the evidence.
3. Promote only after reviewing a passing evaluation. Promotion identifies the exact version/hash and scope. A competing active rule requires an explicit correction or a qualified replacement linked to the active version.
4. Correct active guidance to withdraw it immediately and create a replacement candidate. Evaluate and promote the replacement separately.
5. Roll back to withdraw a promoted version. Past Work keeps its usage attribution. The runtime contract also supports explicit restoration of the prior qualified version for a `replacesVersion` chain, retaining its original hash/evaluation. Owner-corrected rules can never be restored by rollback. The existing review page withdraws only; Beta can present the new restore action from its projection.

The current behavior choices are citing original sources and labeling uncertainty. Arbitrary feedback text cannot become a system prompt, executable procedure, modified Skill, tool grant or policy. Feedback should describe what helped; do not include passwords or credentials.

## Architecture and trust

Existing `memory_records` remain canonical for scoped Memory. Supermemory ranks only known local records within the current owner/execution scope. One configured provider container is restricted to its configured owner. Search is bounded to 20 results. A correction archives the predecessor and inserts the replacement atomically. Historical reads are owner-only and excluded from normal retrieval.

Existing Knowledge retains typed records, source identity, graph relationships and correction links. Work retains objectives, criteria and versioned activity. The memory-type and privacy matrix is in the inventory. No private memory is automatically shared with Relay, another owner, another Work, or a future Capsule.

Learning uses `LearningStore` over the existing authenticated personal `WorkStore`. Each exact Work/repository+Work-type scope has one versioned aggregate with revision compare-and-swap. Sources retain owner feedback identity and Work revision. Criteria refer back to their immutable Work revision and content hash. `LearningRuntime` verifies Result identity, canonical Proof of Work hash, owner and Work revision before retaining its reference; `/api/learning` requires `result_feedback` with its hash for Result targets. Response/Skill/memory target references remain owner assertions until their own verifier exists.

Candidates follow `CANDIDATE → evaluation → PROMOTED / REJECTED`, followed by `SUPERSEDED` or `ROLLED_BACK`. Evaluation is synchronous and atomic; no partial `EVALUATING` record is made active. An interrupted transaction leaves either the prior state or the complete next state. Stable event IDs make lost-response retry idempotent. Hashes use canonical object ordering so PostgreSQL JSONB normalization does not change identity.

Only the registered behavior ID can supply guidance; free-text notes are evidence for the owner UI, never prompt instructions. The evaluator is code-owned and API clients cannot submit a PASS. Promotion must reference the exact hash and revision. Retrieved guidance carries identity/version, explicit scope, provenance and `ADVISORY_ONLY`; retrieval records a scoped version/hash/context receipt. Concurrent opposing candidates cannot both promote. Conflicting Work/repository guidance yields no guidance. A receipt records retrieval, not proof that a model followed it or that the owner accepted a later result.

History is bounded to 40 versions, 100 total evidence items and 400 events per scope. List pages cap at 25 scopes. Retrieval selects at most two scope families. Reaching a history cap stops new writes with an operator archival error; archival is not implemented in this slice.

No component writes Action Gateway rules, grants, approvals, credentials, writer custody, routing, publication permissions, budgets, retention or privacy configuration. Corporate scopes, project tenancy and personal portability are not enabled.

## Operator integration boundary

Do not deploy this feature by manually applying the proposed SQL to a live database. The integration owner must allocate the unnumbered [exact schema package](integration/total-recall/README.md) after their active migration, update the canonical registry, and qualify the combined chain. No contested migration or registry is changed here. Existing `engineering_learning_drafts` remain unverified staging and are not silently imported.

The review API requires existing Engineering dogfood authentication, same-origin mutation checks, and `MYEVE_TOTAL_RECALL_MODE=qualification`. It returns unavailable without that mode and refuses hosted production (`VERCEL_ENV=production`). No agent tool can promote learning. There is no automatic hook injecting the new learning into Sofie until a trusted Work-type binding, final context budget and schema integration are qualified.

Use `LearningStore.retrieve(workId, workType, contextRef)` only with authenticated, server-bound Work context after integration. The Work type must not be inferred as a new permission from memory or arbitrary model text. Integrate the returned guidance as advisory context and retain its receipt alongside the real Work result before claiming measured reuse.

## Reproduce local qualification

From repository root, install the lockfile with `npm ci --ignore-scripts`, then:

```sh
npm run test --workspace=eve-agent
npm run typecheck --workspace=eve-agent
npm run build
node --import tsx apps/eve/test/total-recall.integration.mjs
node --import tsx apps/eve/test/recall-integration-preparation.mjs
```

The database qualification requires loopback PostgreSQL at `127.0.0.1:55479`, an administrative `postgres` database, and permission to create disposable databases. It applies canonical migrations plus the unapplied schema proposal only to a unique temporary database and drops that database afterward. It never reads a production DATABASE_URL. Use `RECALL_TEST_ADMIN_URL` only for that same loopback endpoint. Existing Knowledge qualification runs from `apps/eve` using `node --import tsx test/engineering-knowledge.integration.mjs` against its separately pinned local endpoint.
