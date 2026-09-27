# Historical Total Recall + governed learning qualification

**Superseded by:** [integration-preparation qualification](integration-preparation/README.md). The current outcome is READY_FOR_INTEGRATION with schema activation BLOCKED, canonical runtime NOT_RUN and live improvement NOT_PROVEN. All evidence and tables below describe the earlier checkpoint; their FAIL labels do not describe the now-passing integration fixture.

**Historical design-partner status: NOT READY.** This branch completes safe local implementation and qualification while leaving shared schema activation blocked. It does not claim a production or live Sofie golden journey.

- Branch: `codex/total-recall-learning`
- Qualified implementation checkpoint: `3416014e9aba4aebd663e27db042ca76c6254c2b`
- Baseline: `be090db93b35c8edb9f38a3cac1344a2289c49bc`
- Worktree: `/Users/jaywest/.codex/worktrees/total-recall-learning/Myeve`
- Origin/local main and all worktree states: [baseline.json](baseline.json)
- Inventory / ownership: [INVENTORY.md](INVENTORY.md)
- User, operator, memory and architecture guide: [total-recall-learning.md](../../total-recall-learning.md)
- Unapplied schema: [proposed-schema.sql](proposed-schema.sql)

## Qualification evidence

| Check | Result | Evidence / limit |
| --- | --- | --- |
| Unit regression | PASS | 178 test files, 1,552 tests passed; 4 files / 56 existing environment-dependent tests skipped. [unit.log](unit.log) |
| Database journeys | PASS on isolated proposed schema | 23 explicit assertions/journeys, real PostgreSQL, concurrent clients and fresh child processes. [results.json](results.json), [integration.log](integration.log). Does not qualify canonical schema activation. |
| Existing Knowledge database integration | PASS | Existing `test/engineering-knowledge.integration.mjs`, executed from `apps/eve`, exit 0; source/Work isolation, correction, conflict/history assertions retained. Script is silent on success. |
| TypeScript / capabilities / skills / governance | PASS | [typecheck.log](typecheck.log), 654 classified sources, UNKNOWN=0. Skill routing retains existing 50/57 rank-one result; not represented as perfect routing. |
| Production build | PASS | Both workspace builds, [build.log](build.log). No deployment. |
| Review UI | PASS for states tested | Real production build, synthetic signed local owner session. Real disabled API state; mocked empty/evaluated/promoted/correction/rollback API states. [browser.log](browser.log). This is not a browser-to-live-database journey. |
| Live model / semantic service / owner acceptance | UNAVAILABLE | No model credentials, external Supermemory account or design-partner acceptance was used. No claims of end-to-end behavior improvement. |

Browser evidence: [unavailable](ui-unavailable.png), [empty](ui-empty.png), [evaluated](ui-evaluated.png), [mobile rollback](ui-mobile-rollback.png). Production login rejects plain HTTP as expected; UI qualification used a signed synthetic local session, not a weakened login implementation.

## Measured fixture improvement

The code-owned Work summary fixture contains three factual observations across two cases, including owner-stated current information and uncertain/conflicting inferences. Baseline original-source/origin coverage is **0/3 (0%)**; with the registered `cite_sources` behavior it is **3/3 (100%)**. The input, baseline, learned output, criteria, candidate hash and evaluation are retained in `results.json` and the persisted candidate fixture. The uncertainty behavior separately has representative fixtures.

This proves improvement of the deterministic summary renderer only. It does not prove Sofie adopted the guidance, improved a real result, or received owner confirmation. Retrieval receipts identify offered guidance, not successful use.

Representative local run (single fixture measurements, not percentile/SLA claims): memory write 30.00ms, correction 5.60ms, retrieval 10.59ms, learning retrieval 1.22ms. Retrieval returned 20 records; exact serialized size is in `results.json`. No premature indexing/latency optimization was added beyond bounded scope and result sizes.

## Journeys and invariants

Qualified locally: durable Memory write → fresh process recall → correction → fresh process corrected recall; failed replacement rollback; concurrent duplicate writes; concurrent competing corrections; old exact-fact replay rejection; cross-owner isolation; feedback → candidate → evaluation → owner promotion → process death after commit → fresh process retrieval for comparable Work; candidate/evaluation lost-response retry; negative evaluation/rejection; correction withdraws the old rule before new promotion; rollback survives process death; historical version usage receipts remain; duplicate feedback; promotion-versus-rejection; two competing candidates; cross-Work/repository/Work-type isolation; 13 malicious/secret-shaped database-ingestion fixtures plus additional unit adversarial cases.

Measured fixture violations: memory-derived authority grants **0**, learning-derived authority expansion **0**, secret promotions **0**, cross-scope learning violations **0**. Database counts remain unchanged in six existing grant/approval/budget tables. Closed behavior selection prevents free-text feedback from becoming instructions or executable behavior. These are bounded test findings, not a claim that regex detection identifies every possible secret encoding.

No policy, Action Gateway rule, approval requirement, budget enforcement, credential, writer grant, repository access, Relay backend or Capsule implementation was changed.

## Runtime qualification matrix

The following reports integrated runtime readiness, not the isolated schema proposal. Schema-dependent entries remain incomplete even though their local service tests passed.

| Requested result | Status |
| --- | --- |
| Durable Memory | PASS (local canonical persistence; real remote service untested) |
| Work Memory | PARTIAL (existing durable Work/criteria/results/facts; full learning integration pending) |
| Knowledge | PARTIAL (existing provenance/correction qualified; full file extraction not qualified here) |
| Provenance | PASS for tested Memory/Work/Knowledge paths; non-Work feedback targets remain owner claims |
| Current Truth vs history | PASS for explicit corrections and typed Knowledge; free-text semantic conflict detection is not implemented |
| Correction | PASS for tested local/Knowledge paths; remote-unknown reconciliation remains blocked |
| Cross-session recall | PASS (fresh-process canonical database recall) |
| New-Work reuse | FAIL as a complete Sofie journey; proposed learning retrieval service passes |
| Private/shareable boundary | PASS in scoped tests; no new sharing capability |
| Learning candidates | PARTIAL (proposed schema only) |
| Evaluation | PASS (deterministic bounded fixture) |
| Promotion / rejection / versioning / rollback | FAIL for integrated runtime activation; PASS only in isolated proposal qualification |
| Poisoning defense | PASS in bounded closed-behavior/secret-shaped fixtures |
| Learning authority / secret / cross-scope violations | 0 in the tested fixtures |
| Typecheck / governance / build / README | PASS |
| Design-partner Memory/Learning | NOT READY |

## Integration dependencies and known limitations

1. Integration owns uncommitted migration 0057 and the shared schema registry. Allocate/review/apply a canonical learning migration only after ownership resolves; rerun real DB concurrency/recovery on that combined chain. Never apply this proposal directly to a live database.
2. Bind trusted Work type in the runtime and connect promoted-only retrieval to actual context assembly with a budget and immutable attribution. Existing execution/routing/protected-verification paths were deliberately untouched. Run Work A → result → real owner feedback → evaluation → promotion → restart → Work B → improved result → owner acceptance before declaring READY.
3. Automatic outcome/result-to-candidate generation, independent validation of arbitrary target references, automatic file extraction, project/role/Skill/procedure scopes and Skill version modifications remain unimplemented. The selected slice supports owner-authenticated Work/repository scope and two bounded presentation behaviors.
4. Rollback withdraws the active version. It does not automatically restore a superseded rule that may have been corrected as wrong. Explicit restoration through a new candidate/evaluation/owner decision is possible; automatic rollback-to-prior-version is not qualified.
5. Exact new-path duplicate identity is qualified. Legacy random-ID memories, paraphrases, separately corrected duplicates and separate repeated-evidence provenance require further schema/service work. Conflicting free-text facts are preserved rather than automatically resolved. Current-state status is not a truth oracle.
6. Live Supermemory writes/deletes and crash windows inside its remote service were not tested. An uncertain prior remote write still blocks remote correction. Local canonical state prevents archived values from re-entering ordinary retrieval.
7. Existing environment-dependent suites (56 skipped tests) remain skipped, not silently counted as passes. UI tests use mocked API state after checking the real disabled boundary. No live design partner or external account was contacted.
8. This work changes the governance inventory only for its Memory/Learning entries; reconcile those entries with concurrent Factory inventory additions without replacing them.

The scope is intentionally a qualified local foundation, not a universal self-modifying learning platform. Readiness remains blocked rather than inferred from architecture or fixture scores.
