# Sofie multi-agent integration qualification — 2026-10-25

**CONDITIONAL PASS: isolated, dormant engineering candidate. Release, beta merge, live execution and activation: HOLD.**

The candidate implements and qualifies a managed synthetic multi-agent project through existing Goal/Work, Factory admission, accounting, signed custody and independent verification. It is ready for paired source review and merge approval consideration. It does **not** establish production readiness or live AI coding-agent qualification. Both serving beta installations and their conversations were preserved. Nothing was pushed, merged, deployed, enrolled or activated.

## Exact source

| Component | Qualified source | Dependency/base |
|---|---|---|
| MyEve candidate | `f2fbfb96fef25ee1877b0d4c60f75e6ff37c1ed1` | `95cbd216d09724b1a0e346e7076c92aae99cb09b`, plus exact upstream QA commit `de7f229d752a2d7ef07e172bf0c4c54b156b3b95` |
| Paired MyFactory candidate | `12912314f0a9f851fd07daf8f8ece207cd82b2db` | Required CI source `39b686660571bf8f93b46756378126fafb7c4d7c` |
| Relay | Unmodified | Existing CI pin `f05a5639e2f95994778753e6021603ca5a1777fb` |
| Serving chat-only beta lineage | Unmodified | `5895b129b61c22b1bd276c8ddcdedfd0048228da`, [PR #99](https://github.com/jaydubya818/MyEveBot/pull/99) |

MyEve implementation commits are `35ef8885`, `1895f111` and the exact QA-only backport `f2fbfb96`. Factory implementation commits are `4595d444` and `12912314`. The earlier `7028439b` facade is adapted onto current qualified source; the experimental Python prototype is not imported.

Both isolated branches are named `codex/sofie-multi-agent-integration-20261025`. The MyEve checkout remains the existing managed isolated worktree. The paired Factory source is an isolated disposable clone; the canonical Factory checkout is untouched. The [incremental Factory bundle](evidence/myfactory-integration.bundle) and [patch](evidence/myfactory.patch) preserve the full paired change. The bundle requires the exact base above and passed `git bundle verify`.

[Source hashes](evidence/source-pair.json) bind every changed file at the reviewed commits. A subsequent evidence-only commit adds this report and updates the task record; it changes no runtime source.

## Release lineage and nine conflicts

At final readback, [PR #101](https://github.com/jaydubya818/MyEveBot/pull/101) is draft, based on serving `5895b129`, and advanced from `95cbd216` to `de7f229d` during qualification. The exact seven-file QA/docs/CI delta was reconciled onto this candidate without changing any beta branch. Its mandatory positive-Work preflight remains fail closed.

| Branch snapshot | Tip | Disposition |
|---|---|---|
| `beta/unified-candidate-20261022` | `72354e7d` | Same five relevant runtime files; retain selected lineage and port two qualified refusal/readback corrections |
| `codex/beta-feedback-20261023` | `931487c4` | Relevant runtime identical; selected lineage already includes it |
| `codex/beta-qa-adoption-20261023` | `de7f229d` | Current QA successor; seven-file delta reconciled exactly |
| `codex/unified-beta-myeve-20261011` | `38def710` | Relevant runtime identical; selected lineage already includes it |
| `cursor/qa-beta-port-b54d` | `2ccf0c7d` | Relevant runtime identical; unrelated UX branch changes remain on that preserved branch |
| `reconcile/myeve-89-unified-beta-on-main` | `ff2ac89e` | Relevant runtime identical; retain qualified serving authentication/accounting lineage |
| `release/myeve-beta-review-15m` | `c9da866b` | Relevant runtime identical; retain selected lineage |
| `codex/beta-product-experience` | `105aeb75` | Older divergent source lacks these implementation files; no replacement of serving guards |
| `codex/managed-eve-beta` | `0d7b1cdf` | Older divergent source lacks these implementation files; no replacement of serving guards |

All nine remote tips were checked at final freeze. The comparison covers the Factory tool, Work tool, Factory proposal contract, worker and connected integration harness, with adjacent authority/inventory review. This is a bounded integration disposition, not a nine-way merge or a blanket import of unrelated branch work. Full commit identities and file results are in [branch-reconciliation.json](evidence/branch-reconciliation.json).

Two safety corrections absent from selected `95cbd216` were retained from `5989f908` and `cce8e017`: refused dispatch requires authenticated absence readback; ambiguous absence stays UNKNOWN; only an exact `{"error":"NOT_FOUND"}` 404 proves missing preparation. A filename comparison alone was insufficient, so equivalent inline behavior was inspected before rejecting duplicate helpers.

## Implemented behavior and authority

- Sofie exposes canonical Work/Attempt progress, assigned role, repository, detached worktree, base/candidate commits, retained history and byte-checked artifacts. Session completion, independent checks and release readiness have distinct states.
- Existing GoalWork task generations, owner-scoped links and immutable intent retain assignment and context. Owner-authorized handoff requires terminal/fenced execution and settled historical V2 accounting. Context is advisory; fresh Work re-enters normal admission.
- Factory has bounded concurrent synthetic test execution, one writer per WorkOrder, isolated Git worktrees and durable continuation claims. Claims precede initialization; unknown outcomes prevent replay.
- Interrupted managed fixture work retains a signed CANCELLED checkpoint. It remains STALE, unverified and without custody or writer authority. Full request binding, signature, manifest digest and artifact bytes are rechecked before it can supply successor context.
- Financial history is read across retained Work generations. Cancellation or a new current generation cannot erase liabilities. Old cancelled ledgers remain retained; no cancelled allowance is silently reused.
- Human takeover uses the existing guarded Factory action. Wrong owners, stale revisions, failed authorization, missing qualification, exhausted budgets and UNKNOWN all remain denials. Takeover does not call an alternate executor, alter accounting or bypass MissionControl.

No new task database, controller, permission system or accounting ledger was added. Sofie owns interaction/presentation; Relay retains external connectivity; MyFactory retains execution, Attempts, isolation, accounting and checks; MissionControl retains governance; MyApps retains delivery. The optional fixed profile catalog is a narrowing admission configuration, not an accounting ledger.

Review found and qualification corrected three substantive defects: checkpoint reads initially omitted full immutable-binding attestation; valid escaped continuation text could exceed the 4,000-character objective limit; crash recovery initially counted an absent predecessor's hold as occupied capacity. Each has a regression test. The complete workspace check also caught and corrected the new tool test's missing Builder manifest claim.

## Required project journey

The [30-check connected evidence](evidence/managed-project.json) includes one project with two concurrent coding roles and four normally admitted Works:

1. Engineer intent creates a Goal and assigns two coding tasks. Sofie's session facade starts their canonical Works through the existing Factory HTTP/action path.
2. Two deterministic synthetic coding workers overlap in separate Git worktrees. One writes partial code and is interrupted; the other completes and passes protected Docker checks.
3. The interrupted Work retains an exact signed checkpoint and its settled, cancelled ledger. The coordinator is reconstructed from durable state, and owner-authorized Goal handoff transfers checkpoint context.
4. A new Work starts from that exact checkpoint through fresh approval, configuration, request, Attempt and spend admission. It completes the first role.
5. An integration Work applies the second role's exact signed patch. The independent Docker verifier checks the combined tree (`one=2`, `two=3`, sum `5`). Retained TestEvidence and DiffEvidence bytes are independently checked.
6. Reconciliation/replay starts no additional coding work. Four productive coding calls, zero live-provider calls, zero duplicate consequential effects. Four fixed $1.30 synthetic allocations fit the $5.20 narrowing envelope; original accounting remains retained.

The consolidated candidate passes independent checks. Its canonical Result remains PARTIAL and `ready:false` because publication, CI, owner acceptance and release qualification are separate obligations. The fixture does not manufacture release success.

This journey uses real PostgreSQL, HTTP, SQLite, Git worktrees, signatures, evidence readback and Docker. Coding/model responses are **synthetic**. It exercises the Sofie session facade and Goal coordinator, not an actual Sofie model conversation or a separately provisioned live Relay service. The existing local Relay composition contract is also tested; it is not substituted for real external connectivity qualification.

The separate crash regression kills a real disposable supervisor while its real synthetic child survives. A reconstructed host refuses recovery while the child group exists; after absence is confirmed, it retains partial code, resumes a new local Run and deduplicates replay. This is component-level process-crash evidence. The single managed project demonstrates interruption and coordinator reconstruction, not a paid managed child surviving an actual deployed Factory crash.

## Qualification results

| Check | Result |
|---|---|
| Configured Eve unit suite | 2,977 pass, 0 fail; 474 skipped and 19 separately gated pending assertions |
| Repository Node suite | 359 pass, 0 fail, 3 skipped |
| Complete Factory workspace suite | 849 pass, 0 fail, 94 skipped across 943 tests |
| Affected PostgreSQL owner/admission/accounting/refusal suite | 79/79 pass |
| PostgreSQL validation lifecycle | 55/55 pass; 134 affected PostgreSQL tests pass in total |
| Current QA/composition/preflight regression suite | 641/641 pass |
| Connected managed project and existing integration scenarios | 30/30 checks pass |
| Durable Goal handoff integration | Pass: owner isolation, replay, restart and bounded retained context |
| MyEve workspace TypeScript, Builder manifest, capabilities and skill routing | Pass |
| Factory workspace and producer TypeScript | Pass |
| Governance | MyEve 909 classified sources; Factory 151 reviewed changed sources; UNKNOWN=0 |
| Database migration ordering | 105 existing migrations pass; no new schema migration |
| Exact component browser checks | Seven active states pass, including cancelled checkpoint/accounting, progress, reconciliation, failed verification and verified artifacts |
| Independent source review | Accepted exact final pair; no unresolved P1/P2 finding |
| Three actual positive-Work release preflights | Expected refusal: `BLOCKED_NOT_QUALIFIED`, `POSITIVE_WORK_CHAT_ONLY_RELEASE`, `positiveWorkQualified:false` |

The unit-suite pending/skipped fixtures are not counted as passed. The disabled validation describe block reports 19 pending assertions; enabling its dedicated URL expands the actual lifecycle cases to 55, all passing in the separate run. PostgreSQL suites use explicit dedicated localhost URLs. Existing optional environment-dependent skips remain visible in raw reports. App unit/Node/type/governance runs qualified `1895f111`; `f2fbfb96` changes only the inherited seven QA files, separately qualified by the full 641-test suite and three actual preflights. The connected journey was rerun on exact `f2fbfb96`/`12912314`.

Independent reruns passed 57 MyEve tests, 33 Factory tests and 19 new QA tests. See [independent-review.json](evidence/independent-review.json), [summary.json](evidence/summary.json) and the raw reports in `evidence/`.

### Six historical SDK failures

The six Jev assertions predate `7028439b` and reproduce with the old installed dependency state on the selected baseline: the installed SDK emitted the `/v4/ai/decision-model`/`stateParts` contract while the assertions expected `/evaluation-model`/`state`. The session implementation does not change this path. The preserved [original baseline run](evidence/previous-baseline-jev.json) and [source comparison](evidence/previous-source-comparison.json) bind that conclusion to `f9b2623c` and `7028439b`. Installing the selected source's exact lockfile and applying its required existing postinstall patches resolves all six: the Jev suite passes 24/24, and the complete configured unit suite has no failures. No Jev assertions or provider implementation were weakened. [Selected-lineage historical failure report](evidence/sdk-historical-failures.json); [exact installed dependency rerun](evidence/sdk-installed.json).

## Integration dependencies and limits

| Dependency | Requirement |
|---|---|
| MyEve | Exact candidate above, Node 24, locked dependencies and existing root `postinstall`; migrations through `0109_external_alpha_chat_only.sql` |
| Existing Goal/Work records | Existing GoalWork and beta binding schemas; same-connection transaction/advisory-lock support in the worker |
| Factory | Paired candidate above, SQLite/Git/Docker, existing pinned verifier image, strict signed V1/V2 compatibility plus opt-in V3 workspace metadata |
| Fixture project profiles | Explicit `MYEVE_FACTORY_WORK_PROFILES` file, exact owner/Work/profile/criteria/repository bindings and fixed allocation ceiling; dogfood/nonproduction and LOCAL fixture modes only |
| Handoff API qualification | Explicit `MYEVE_ENGINEERING_SESSIONS_QUALIFICATION=true` together with dogfood/nonproduction; remains disabled by default |
| Concurrent/checkpoint Factory fixture | Explicit synthetic worker **and** verifier; default executor and real-provider combinations are rejected; default single-slot behavior preserved |
| Relay/MissionControl | Existing scoped identity, authorization, capability, Factory Version and accounting contracts; no new grant or substitute |
| Delivery | MyApps publication and acceptance gates remain separate; no automatic merge/deploy |

The Factory source identity has a new **isolated-only** successor record. Historical qualification records and the production execution configuration are preserved. The changed source cannot inherit an old installed Factory Version approval. No installed pin, enrollment, secret or production credential was modified.

### Deferred capabilities and blockers

- **Real Relay → Factory → Codex/Claude execution: BLOCKED.** This candidate has no reviewed exact-source live installation/profile with scoped provider authorization, a strict existing spending envelope and execution permission. Existing host login or old approvals are insufficient. No paid call was enabled or attempted.
- **Live concurrent AI agents: DEFERRED.** Parallel execution in this candidate is deliberately synthetic-only. Enabling a real executor requires further adapter/resource qualification and source review; a fixture flag cannot activate it.
- **In-place managed Codex/Claude thread resume: DEFERRED.** Reconciliation observes the same Work; terminal interrupted work continues through a newly admitted Work with explicit checkpoint context. Terminal identities are not restarted.
- **Autonomous owner-free agent handoff, Deep Agent execution, a second Claude adapter, remote/cloud recovery and named execution branches: DEFERRED.** Current handoff is owner-authorized and current task worktrees are explicitly detached.
- **Live Sofie browser conversation and installed positive Work journey: BLOCKED by the current chat-only release.** Golden, E3 and independent release preflights deliberately refuse this source. The component browser fixture is not that journey.
- **Deployment, publishing, live improvement/promotion: DEFERRED and unauthorized in this task.** Existing delivery gates remain closed.

## Merge-readiness recommendation

Approve review of the paired, dormant source candidate. **Hold merge into the serving beta/production release and hold all activation** until the positive Work/Golden/E3/independent release gates and fresh exact-source live qualification pass under the existing authority. Hosted CI has not run for this unpushed candidate. The current chat-only preflight must not be removed or treated as a passing positive journey to obtain a green release.

The bounded synthetic engineering work is complete and independently reviewed. The North Star's real productive AI and delivery stages remain explicitly gated/deferred; this report does not present them as implemented live capabilities.

## Reproduce safely

Use the paired source commits above, a disposable localhost PostgreSQL server and the existing Docker verifier image. These commands use synthetic execution; do not replace them with production URLs or credentials.

```sh
# MyEve repository root
npm ci --offline --ignore-scripts
npm run postinstall
npm test
npm run typecheck
MYFACTORY_SOURCE_ROOT=/absolute/isolated/MyFactory node --test scripts/myapps-composition/*.test.mjs

# MyEve apps/eve
../../node_modules/.bin/vitest run
MYEVE_EXTERNAL_ALPHA_TEST_DATABASE=postgresql://fixture@127.0.0.1:55493/postgres ../../node_modules/.bin/vitest run --fileParallelism=false --testTimeout=60000 lib/external-alpha/work-controller-postgres.test.ts
MYEVE_VALIDATION_POSTGRES_URL=postgresql://fixture@127.0.0.1:55493/postgres MYFACTORY_SOURCE_ROOT=/absolute/isolated/MyFactory ../../node_modules/.bin/vitest run --fileParallelism=false --testTimeout=60000 lib/engineering/production-validation-postgres.test.ts
GOAL_TEST_PORT=55493 node --import tsx test/goal-handoff.integration.mjs
FACTORY_TEST_DATABASE_URL=postgresql://fixture@127.0.0.1:55493/postgres MYFACTORY_SOURCE_ROOT=/absolute/isolated/MyFactory FACTORY_MULTI_AGENT_QUALIFICATION=1 FACTORY_SPEND_FIXTURE=1 FACTORY_BETA_EVIDENCE=/tmp/managed-project.json node --import tsx test/factory-live.integration.mjs

# Paired isolated MyFactory root; build test UI before browser regressions
npm run build --workspace=@factory/web
npm test
npm run typecheck
npm run typecheck:producer
npm run check:producer-governance
```

The Goal fixture defaults to database user `myeve_goals`; use that disposable role for its command. Tests create and remove owned temporary repositories/databases. The saved result IDs are disposable evidence identities, not production artifact links. Raw evidence is integrity-indexed by `evidence/SHA256SUMS`.
