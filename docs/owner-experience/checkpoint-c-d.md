# MYEVE OWNER EXPERIENCE / ALPHA UX

Checkpoint: C/D — shared Sofie and Work detail presentation.

Status: PARTIAL. Canonical base: `8338309582d6806829dec1ae1beef301d6b52425`. Branch: `codex/myeve-owner-experience`. Candidate is the commit containing this report; exact remote SHA is verified after push.

The same read-only Work card appears in conversation and Work detail. Detail polls canonical state every ten seconds while visible, refreshes on reconnect, clears data after failed reads, and aborts superseded requests. Neither polling nor recovery dispatches Work. Verification lists the current Work's acceptance criteria; missing evidence prevents a verified claim. Technical limitations and raw summaries remain inspectable under Proof.

| Area | Verdict and scope |
| --- | --- |
| Unified shell / alpha navigation | PASS in tested routes including populated Work detail and inline Sofie |
| Feature-policy UI | PARTIAL — same restrictions preserved; final rich journey pending |
| Today | PASS for prior clean/queued/paused fixture |
| Sofie | PARTIAL — inline Work/Result/Proof presentation passes; actual durable-session follow-up pending |
| Work | PARTIAL — status/proof/reconnect/error presentation passes; controller-composed browser journey pending |
| Needs You / Files | PARTIAL — next increments |
| Settings | PASS in prior shell scope |
| Clean-owner isolation | PASS for existing cross-owner browser cases |
| Historical-data filtering | PARTIAL — exact supplied-screenshot provenance unresolved |
| Desktop / 390px | PASS for Working, Verifying, verified candidate, UNKNOWN, failure and inline Work fixture surfaces |
| Accessibility | PASS in tested states; no critical/serious axe findings |
| Visual regression | Clean baseline comparison retained; populated state captures reviewed independently |
| Route/API authority regression | PASS — 81 feature/proxy checks; no execution authority changed |
| PostgreSQL | Real owner-scoped Work source; UI variants explicitly use response fixtures |
| Fresh-clone suites | Pending final candidate |
| Hosted CI | B running when report prepared; current increment pending push |
| Independent review | PASS for this limited read-only increment; full journey explicitly unqualified |
| Public disclosure review | PASS — synthetic data only |

Focused contracts: 111 passed. TypeScript passed. Populated browser run: 4/4 passed, covering repeated reads, failed-read clearing/recovery and reload. Broader 13-test run is recorded in qualification output. UI response fixtures are not evidence of a controller, provider or verifier execution.

Read API change: adds current criterion statements to the existing owner-scoped projection. No new query, migration, lifecycle mutation, accounting, FactoryVersion or authority change.

Paid operations: 0. Production deployments: 0. Tester mutations: 0. Executable tester grants: 0. Publication effects: 0. External-alpha authority changes applied: 0.

Remaining blockers include composed durable conversation/Work/Result follow-up, decision/history integration, Files, broader visual/accessibility qualification, fresh clone/hosted CI, historical provenance and release impact. Next: E, followed by F–H automatically.
