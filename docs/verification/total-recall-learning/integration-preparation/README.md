# Integration-preparation qualification

**Overall: READY_FOR_INTEGRATION. Schema activation: BLOCKED.** All work in this tranche independent of shared migration/schema activation is complete. This is integration readiness, not production or design-partner readiness.

Supersedes checkpoint `4b31ddebe8235fc1efca154d41ee37061be2a444` and the [historical dossier](../README.md). Baseline remains `be090db93b35c8edb9f38a3cac1344a2289c49bc`; branch remains `codex/total-recall-learning`. Historical logs, results and the original unapplied proposal remain retained. The committing revision owns this report; exact tested source digests are in [source-hashes.json](source-hashes.json).

| Area | Status |
| --- | --- |
| MEMORY CORE | LOCALLY QUALIFIED |
| CANONICAL WORK RETRIEVAL | INTEGRATION PENDING |
| LEARNING CORE | LOCALLY QUALIFIED / RUNTIME ACTIVATION PENDING |
| LIVE SOFIE REUSE | NOT_RUN |
| LIVE MODEL IMPROVEMENT | NOT_PROVEN |

## Qualification

| Check | Result and evidence |
| --- | --- |
| Full unit regression | PASS: 179 files / 1,568 tests; 4 existing environment-dependent files / 56 tests skipped. [unit.log](unit.log) |
| Existing Memory/Learning database journeys | PASS: 23 checks, real disposable PostgreSQL, concurrent clients, lost-response replay and fresh processes. [core-results.json](core-results.json), [core-integration.log](core-integration.log) |
| New Work/runtime/schema integration fixture | PASS: 23 checks, real canonical Work/Knowledge/Memory persistence and synthetic retained Result; restart consumers parse the actual bounded user-role message. [results.json](results.json), [fixture.log](fixture.log) |
| Typecheck / capabilities / skills / governance | PASS: 660 classified sources, UNKNOWN=0. Existing skill routing remains 50/57 rank one, not a perfect score. [typecheck.log](typecheck.log) |
| Production workspace builds | PASS: both workspace builds; no deployment. [build.log](build.log) |
| Schema migration package | PASS in disposable DB only: transaction/splitter, constraints, null rejection, event scope replay denial, restricted-reader RLS with foreign rows, forbidden writes, retry failure and rollback isolation |
| Beta UX contract | PASS: memory lineage/source/why-used and learning behavior/status/evaluation/version/usage projection. This tranche changes no UI; historical browser evidence is not represented as new browser qualification |
| Capsule contract | PASS: validated read-only representation, retained original privacy/Work scope and learning reference, portability false, no grants. No Capsule implementation or live export |
| Protected-file preservation | PASS: [preservation.json](preservation.json); migrations, registry, canonical Work/Factory/protected code and context entrypoints unchanged from continuation checkpoint |

The schema proposal was applied only to uniquely named test databases on loopback port 55479, then removed with those databases. A uniquely named NOLOGIN reader test role was also removed. No production schema, shared 0057, registry, another worktree or main merge was modified. The normal application feature gate remains qualification-only and refuses hosted production.

## New-Work reuse and recall quality

**CONTRACT/INTEGRATION FIXTURE PASS; CANONICAL RUNTIME NOT_RUN.** Work A retains a launch deadline, explicitly corrected Monday → Tuesday → Friday, plus timezone evidence. A new process reconstructs stores and authorized selection for Work B in the same repository; it retrieves Friday and UTC, serializes bounded attributed context, and consumes that exact message into a plan. It does not replay the original transcript. Monday and Tuesday remain superseded historical records. Private owner Memory independently follows the same two-correction sequence without becoming shareable.

| Measured fixture result | Value |
| --- | --- |
| Expected relevant facts / retrieved | 2 / 2 |
| Precision / recall at this lexical query | 1.0 / 1.0 |
| Irrelevant / stale / superseded injected | 0 / 0 / 0 |
| Correct Current Truth / provenance coverage | 2 of 2 / 100% |
| Historical Knowledge predecessors retained | 2 |
| Owner Memory corrections followed | 2 |
| Duplicate fact with identical provenance | 1 injected; 1 excluded |
| Conflicting source facts | 2 explicitly labeled; neither used as current plan facts |
| Cross-scope violations | 0 |

The candidate set includes irrelevant lunch information, a stale deadline, unsafe source reference, exact duplicate and conflicting vendor sources. Cross-owner/repository selection, unselected private records, forged objective/revision and shareable scope fields fail closed. These are bounded fixture metrics, not broad semantic-search performance claims. Confidence/truth are stored evidence labels, not an oracle; unmarked natural-language contradictions are not automatically discovered.

## Learning lifecycle and measured comparison

The fixture verifies a synthetic immutable Result's canonical schema, digest, owner and Work revision, then records feedback → candidate → server evaluation → owner promotion. A replacement version is evaluated/promoted while retaining the original as SUPERSEDED. Explicit rollback restores the prior exact qualified version/hash, retains the rolled-back version and historical usage receipt, and survives a fresh process. A failed candidate remains REJECTED and is not retrieved. Unit tests deny restoring unrelated, unqualified or owner-corrected guidance and test replay identity.

Both runs use the same Work B, independently specified expected facts and selected sources. The deterministic consumer parses the serialized evidence. Correctness measures the distinct actual/expected fact intersection against the larger set. Acceptance additionally requires original source references on all plan facts. Missing references produce explicit source lookup and owner clarification steps. Promoted `cite_sources` supplies the closed behavior; arbitrary feedback prose is never injected.

| Metric | Without learning | With promoted learning |
| --- | --- | --- |
| Correctness | 1.0 | 1.0 |
| Acceptance | 0 | 1 |
| Unnecessary steps | 4 | 0 |
| Retrieval relevance | 1.0 | 1.0 |
| Failure count (uncited facts) | 2 | 0 |
| Clarification/coordination count | 2 | 0 |

This demonstrates deterministic acceptance/source-use improvement, not improved factual accuracy (already 1.0), lower real agent cost, or live model adoption. No real model, external semantic provider, design partner or owner acceptance session was used. LIVE MODEL IMPROVEMENT remains NOT_PROVEN.

## Adversarial evidence and invariants

Twelve new hostile feedback cases plus the retained core and unit fixtures cover instruction spoofing, hidden/Unicode credential patterns, private forwarding, approval bypass, policy/authority expansion and poisoned source references. Additional scenarios cover cross-project decisions, private→shareable schema rejection, source/Result hash and owner poisoning, conflicting promoted scopes, event replay across scopes, immutable evaluated evidence and SQL null bypasses. Restricted-role tests contain a real foreign learning row and prove it is invisible even after spoofing a session owner variable; inserts and updates remain denied.

Measured memory authority grants = **0**; learning authority expansions = **0**; secret promotions = **0**; cross-scope violations = **0**. Existing authority/approval/budget table counts remain unchanged in both fixtures. These are tested invariants with a closed behavior boundary, not a claim that heuristic text filters detect every encoding or possible attack.

## Integration handoff and remaining activation work

Use the [schema package](../../../integration/total-recall/README.md), [runtime/UI/Capsule contracts](../../../integration/total-recall/contracts.md), [exact canonical crosswalk](../../../integration/total-recall/crosswalk.md), and [manifest](../../../integration/total-recall/manifest.json). They identify the canonical owner, unallocated migration/registry change, no-backfill behavior, trusted selection dependency, exact Work and Sofie hooks, Result feedback, projections, and canonical Factory/Q37 files that must win conflicts.

The remaining work is the explicitly deferred integration boundary: canonical migration allocation/application and runtime wiring/qualification under its owner. The isolated adapters and repeatable fixtures are complete. Do not call live reuse FAIL because it was not run; do not call it PASS because the deterministic consumer passed. Broad semantic recall, remote Supermemory qualification, project/corporate tenancy, new Skill/procedure learning, automatic result-to-learning inference and Capsule consent/activation remain outside this bounded contract.
