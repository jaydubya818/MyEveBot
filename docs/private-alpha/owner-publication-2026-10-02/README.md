# Attempt 8 owner decision and exact-candidate publication

Attempt 8 is the first accepted real local Golden Journey. Its candidate `1253fcbd5a4e11d72f8ee43c7025b0729d9fa298` and tree `ddcb301db219a744fe741d745f85a97da8a3cd22` are unchanged. Implementation and independent protected verification both passed 11/11. Current settled model cost is $0.019032: Sofie $0.005100 and Factory $0.013932. The immutable pre-final-Sofie Proof remains unchanged. Production publication and owner acceptance have not run.

The real Results and Needs You surfaces link to `/work/<workId>/decision`. That page reads the canonical retained Result, current accounting, independently verified custody and signed implementation evidence. Proof is expandable. Selecting an option is not approval: a second confirmation records an exact owner/Work/Result/candidate/tree/repository/revision/generation/action binding. This decision is separate from owner acceptance. Rejection and keep-private are durable candidate decisions with no GitHub writes; rejection requires a fresh explicit decision before publication.

Publication is a local host consumer, separate from the web process and the model executor. It accepts only a current confirmed owner decision. It reconstructs authenticated Git objects in a fresh bare repository, never reads or stages a mutable Factory workspace, and requires the exact candidate tree and single-file diff. The qualified base ref is `codex/private-alpha-release`; its expected commit is `7380d3324224a5660daa1556384c7a1a17d7d21e`. Ref movement fails closed. The candidate branch is deterministically bound to the original Factory WorkOrder. An empty expected ref lease provides create-only compare-and-swap, never overwrite of an existing branch.

A per-Work advisory lock and per-Result durable effect row record each push/PR attempt before it happens. Browser refresh and retries return the existing decision. Restarted consumers reconcile attempted effects; UNKNOWN cannot issue another write. If a concurrent observer fences an operation UNKNOWN, the original consumer also stops before another effect. PR mode allows one exact branch push and one draft PR. Push-only mode allows one exact branch and no PR. No merge, deployment, regeneration, rebase, tree changes or implicit owner acceptance exists in this boundary.

Pre-publication readiness means valid signed custody and current independent verification. It deliberately does not mean global Ready or owner acceptance. Canonical Result/Proof remain PARTIAL until separately established downstream evidence and explicit acceptance are assessed. GitHub CI and independent review are not represented as completed by local test results.

## Qualification

- 25 real PostgreSQL contract/controlled-GitHub checks: custody, exact tree, immutable materialization, stale generation/decision, wrong owner/repository, failed verification, rejection, all four actions, duplicate/concurrent requests, lost responses and restart/UNKNOWN recovery.
- 10 P0 Playwright journeys against real app routes and real isolated persistence, with only GitHub effects controlled. Desktop and 390px; keyboard, WCAG accessibility scans, refresh, exact one push/PR, push-only, keep-private, reject, authentication and CSRF.
- Application: 1,991 passed, 94 environment-gated skips. Root: 144 passed.
- Typecheck, capability registry, executor governance (745 classified sources), routing validation and production build passed.
- Protected pre-0079 backup verified and restored into an isolated database. Additive migration passed on restored and production databases. Scoped before/after hashes prove historical Attempts 1–8 records unchanged. New production decision/publication tables are empty.
- No additional model operations and no real candidate publication occurred during qualification.

The loopback browser harness uses `http://localhost:3197`, matching Next's request origin; same-origin protections remain enforced. Test credentials are synthetic. `test/publication/setup.mjs` imports approved captured records into a disposable `myeve_beta_publication` database; capture/receipt paths can be supplied with `MYEVE_PUBLICATION_TEST_CAPTURE` and `MYEVE_PUBLICATION_TEST_RECEIPT`. It cannot target production. Protected verification inputs are never returned by the owner API or supplied to an implementation model.

## Operations and remaining owner gate

The production UI records a confirmed bounded decision. A scoped host runs `scripts/candidate-publication.ts <workId> --watch` with the existing in-memory database mechanism, local engineering configuration, exact `MYEVE_PUBLICATION_WORK_ID`, and existing GitHub host authentication. It waits without effects until an owner confirms a publication choice. Unknown outcomes require read-only reconciliation. A push-only publication cannot silently escalate into a PR.

After separate publication approval, observe the real `quantity-ci` workflow and check results bound to the exact candidate commit; obtain independent review/readback without modifying the candidate. Neither implies owner acceptance. Preserve historical Proof and record any later conclusion as new canonical evidence. Do not create Attempt 9 or regenerate this candidate.

Detailed receipts, hashes, browser captures, backup/restore evidence and final source/deployment identity are retained in the private-alpha qualification archive. The existing qualified candidate is not part of this source release.
