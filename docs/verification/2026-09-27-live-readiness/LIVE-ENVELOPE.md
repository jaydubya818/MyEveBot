# One live Golden Journey proposal — BLOCKED, NOT AUTHORIZATION

| Bound | Exact value / qualification state |
| --- | --- |
| MyEve source | Reviewed baseline 21973e5bf646ceec4c68dc90625ff020d405d7a9 plus the bounded router correction in this report's commit; final commit SHA is supplied in handoff |
| MyFactory | d9564beef41590c3700069ec340d926db23b7ba7 |
| Factory | Proposed dedicated factory-q37-live-01 |
| FactoryVersion | UNQUALIFIED: must bind the actual spend-enforcing executor/configuration; synthetic version cannot be reused |
| Fixture repository | /private/tmp/q37-readiness-qualification/live-fixture; local synthetic repository, no remote |
| Base SHA | 024bab53fbde4577deab812a1e9705f8118b176f |
| Reproduction artifact | live-fixture.bundle, SHA256 6e72f003b10d9e37d4d4df6cd8e57c44cb8e25556b2ac10b180f078f31d45b1b |
| Objective | Implement quantity.mjs: trim stdin, print JSON quantity for positive integers, otherwise invalid_quantity |
| Acceptance | Ten exact protected checks in live-fixture.json; signed exact-attempt Gate C; terminal/quiescent custody; independent PASS; PARTIAL Result; truthful fresh Sofie explanation; zero safety violations |
| Model / executor | Proposed gpt-5.5; installed Codex CLI 0.157.0 is authenticated but NOT qualified for this Work's hard ceiling. Dedicated bounded runtime remains required |
| Attempts | One logical Factory execution, one consequential dispatch, no blind replay or automatic native fallback |
| Duration | 600 seconds maximum; producer timeout STOP; never release writer before authenticated quiescence |
| Spend | USD 1.30 maximum complete Work; reserve execution and fresh explanation before any paid request; unknown usage retains the conservative reservation |
| Artifact limits | Only quantity.mjs changes; text tree ≤200 files/500 KB, each file ≤100 KB; signed artifact ≤4 MiB and result envelope ≤12 MiB |
| Allowed effects | Isolated local candidate commit, signed receipt/evidence, local protected Docker verification and retained PARTIAL Result; one separately authorized bounded model execution |
| Forbidden effects | GitHub publication/push, live Relay, deployment/merge, account or repository administration, secrets/workflow changes, unrelated files |
| Cleanup | Retain immutable receipt/candidate/evidence; reconcile all execution groups/verifier containers; remove only task-created disposable resources after retention |
| Revocation | Owner STOP/revoke disables further calls, persists the terminal fence; UNKNOWN remains held until resource proof; credential revocation is not proof that remote work stopped |
| Stop conditions | Owner revocation, deadline or reservation exhaustion, UNKNOWN usage/state, identity/version mismatch, authentication failure, scope drift, duplicate start, competing writer, missing quiescence or failed protected acceptance |

This proposal must not run. An actual qualified spend-enforcing runtime and its scoped provider access are required before FactoryVersion and the live authorization can be finalized. Existing ambient CLI authentication and provider account caps are insufficient proof of this invariant.
