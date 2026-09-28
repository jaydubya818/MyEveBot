# Real-provider qualification preflight — BLOCKED

**PRODUCER LOCAL SPEND QUALIFICATION: PASS**  
**CONSUMER LOCAL SPEND QUALIFICATION: PASS**  
**REAL PROVIDER QUALIFICATION: PENDING**  
**LIVE MYFACTORY: NOT_RUN / NOT READY**

Consumer input is `b15905f273b7a1c62f1a840de92ab6caa78f21dd`; producer local candidate is `8f5e3774129b5f9f4b1c9655ffbbb531cd20fa0f`. Canonical producer remains `d9564beef41590c3700069ec340d926db23b7ba7`. No source/configuration activation, paid call, migration, inventory change, protected-worktree change, or external publication occurred. Final documentation/evidence commit is identified in the task handoff.

Supersedes the release-status wording and blocked dollar proposal in [consumer preparation](../2026-09-27-spend-consumer-preparation/REPORT.md), its handoff/summary, and [earlier live proposal](../2026-09-27-live-readiness/LIVE-ENVELOPE.md). Historical test results remain valid for their stated local scope. Runtime source bytes are unchanged from b15905f.

## Disposition

Stop condition **C** applies: the exact pinned producer cannot satisfy the requested completion reserve, stop-on-UNKNOWN, and maximum-paid-operation invariants. These are additional real-provider release gates, not a withdrawal of its passing local ceiling/accounting qualification. Human credential setup is also unresolved (condition B), but supplying a key alone cannot clear C.

[Reproduction](probe.mjs) imports only the clean exact producer pin, creates disposable SQLite and loopback fake providers, and never reads a real credential. Run `MYFACTORY_SOURCE_ROOT=/private/tmp/q37-producer-spend-inspection node docs/verification/2026-09-27-real-provider-preflight/probe.mjs` from this checkout. Exit zero means the counterexamples reproduced; it does **not** mean the release gate passed. [Observed results](probe.json):

| Release invariant | Reproduced observation |
| --- | --- |
| Stop at UNKNOWN | With 4,000 micro-USD ceiling and 1,200 per-call reservation, the second request reaches the fake provider after the first becomes UNKNOWN. Both reservations remain held. One post-UNKNOWN call. |
| Protect mandatory completion | Three earlier calls settle 1,200 each against 3,600 ceiling. The mandatory completion request is then denied. No phase distinguishes completion from implementation. |
| Enforce maximum operations | Four 30-micro-USD settlements are accepted even when the proposed envelope permits only three calls. Ceiling accounting remains correct, but there is no operation-count gate. |
| Reuse a completion reservation | A pre-held 1,200 operation survives, but the gateway generates a new operation ID and cannot consume that hold; finalization is denied when the other 1,200 is spent. |

Do not bypass these gates with a prompt instruction, manual cancellation after observing a response, a synthetic completion evidence flag, a larger ceiling, an unrelated ledger, or a fake LIVE fixture. Corrections belong at the existing producer ledger/gateway boundary and require a newly qualified producer pin. This task did not modify the independently owned producer.

## Independent review

The requested reviewer responded that its latest direct user instruction explicitly stopped its task. It declined to start a review or issue a PASS. **b15905f independent review is PENDING (release gate not passed), not a reported code defect.** No implementation was delegated and the reviewer remains stopped. A user-authorized independent reviewer must inspect b15905f plus this documentation/evidence commit before live readiness can be asserted.

## Producer evidence promotion

The producer dossier at the exact 8f5 pin and its source were inspected. SQLite migration v7 checksum independently matches `208fd0facca9f2535c30e558bf261243efd3ababd3113697e34dbefdf8f1598e`. Versions 1–6 remain identical to d956; the consumer's 57 migration files and executor inventory remain unchanged. See [lineage](lineage.json).

The local producer suite reran: **116 PASS / 1 opt-in skip**. It covers immutable Work ceilings across retries/generations, exact reservations, settlement, retained UNKNOWN, restart recovery, concurrent oversubscription denial, cancellation, stale pricing denial and readback. The separate installed-CLI loopback test reran **1 PASS**. It proves CLI routing to the metered loopback boundary on a synthetic 503, not real-provider success or an entire paid journey. [Producer log](producer-tests.log), [CLI log](installed-cli.log).

## Current Truth and Q37 continuation

Affected consumer admission, routing, projection and Run-truth tests reran **46 PASS**. Existing Current Truth renders current Run purpose/route, Factory identity/version/attempt, execution state, ceiling/settled/reserved/UNKNOWN, candidate, protected verification, completion qualification, blockers and next action. Factory accounting and common conversation accounting remain distinct observations; neither claims a combined completion reservation or grants authority. On the present configuration the truthful next action is to resolve the release gates, not START.

The b159 dossier retains passing connected Gate B/C, single-writer, native repair, synthetic GitHub/CI/review continuation, Work-bound Relay, learning/reuse and strongest synthetic Q37 evidence. Those are unchanged local contracts, not external production qualification. No unrelated feature was added while the provider boundary was blocked. Existing webpack PASS and the documented Turbopack dependency-symlink limitation remain applicable to the unchanged runtime. This tranche reran typecheck/capability/routing checks, governance (**659 classified, UNKNOWN=0**) and canonical validation of **57 migrations**; all PASS. Exact source/evidence hashes and [qualification summary](qualification-summary.json) are retained here.

## Envelope and cleanup

[Blocked envelope and human handoff](ENVELOPE.md) record public pricing, conditional cost arithmetic, every potentially billed component, pinned fixture, exclusions, stop conditions and cleanup. No qualified live FactoryVersion or executable live budget exists. The required **same-envelope full dry run is FAIL / NOT EXECUTABLE**: the counterexamples fail prerequisite invariants and there is no configured real-provider path to reproduce. Prior synthetic journey PASS must not be relabeled as that dry run.

Probe cleanup is **PASS**: four isolated cases closed their gateway/provider servers, denied post-cancel calls, retained exposure through reopened storage, and removed only their disposable data after preserving the redacted results. Existing installed-CLI test waits for process-group shutdown and cleans its temporary resources. Live cleanup is specified but NOT_RUN.

Safety scope: real paid calls **0**, unauthorized activations **0**, post-cancel probe calls **0**, lost UNKNOWN exposure **0**, false Ready claims **0**. Negative release probes found post-UNKNOWN synthetic calls **1**, starved completion cases **1**, calls beyond proposed operation cap **1**, and unusable pre-held completion cases **1**. Do not fold these counterexamples into an all-zero live-safety claim.
