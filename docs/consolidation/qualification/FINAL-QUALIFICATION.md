# Final local candidate qualification

Production/package source: `ccadb66c6226f45d5fd8f25856a0467a532dba45`. Final controlled harness: `1b72192957d603a60221b7c13937a3af4b68fa47`. Source SHA is recorded per evidence; docs-only descendants do not invalidate identical runtime bytes. Application source is unchanged after the 1,870-test run; the final fresh clone repeated 1,870 app / 141 root / 15 builder checks at ccadb66 with uncached typecheck/build PASS. Final whole-product rerun at 1b72192 exits 0 with Result classification PARTIAL, exact producer 6e164ca and zero observed counters.

## Repairs discovered during independent fresh-clone execution

The initial fresh clone failed builder typecheck: the adopted engineering_work, engineering_direct, engineering_factory tools and four nearby test files were unclaimed by the builder manifest. Cached worktree checks had missed the cross-package dependency. ccadb66 claims those files as core, with existing runtime/owner gates unchanged and tests still excluded from deployment. Typecheck caching is disabled so the source completeness guard always runs. No template deployment or release was performed.

The whole-product test once exited 1 after all seven assertions passed because DROP DATABASE WITH FORCE raced an idle pg client during closure. The failed log is retained as whole-product-teardown-failed.log. The existing connected harness's bounded quiescence pattern was applied and the whole-product test reran successfully. This is a test-lifecycle repair, not changed producer behavior.

## Evidence

- final-controlled-checks.json records initial fixture setup failures and successful explicit reruns; no historical PASS substitutes for a rerun.
- final-app/root/builder-tests/typecheck/build logs and fresh-clone-* logs record repository checks.
- final-published-main-bridge.json: nine checks. The separate legacy negative fixture reconstructs archived Phase 1 ledger rows; it does not pretend to be the original deployed database.
- final-connected-producer.json: 16 connected checks / 13 scripted loopback responses / zero real model requests.
- final-producer-crosswalk.json and final-safety.json: exact source and fixture-scoped assertions/counters.
- final-canonical-browser.json: anonymous denial, six real owner API reads and fourteen desktop/mobile accessibility audits.
- final-product-browser.json: 32 product/preview browser cases; 136 accessibility scans across the retained screenshots.
- chat-failure-browser.log: preserved failed-turn UX survives waiting/reload and clears on a later turn; no model session request.

## Open gates

Shared-business membership and shared Goals/Results are proposals only. Explicit release-scope decision and final independent combined review remain pending. No main merge, post-merge check, milestone tag or branch/worktree deletion is represented as complete.
