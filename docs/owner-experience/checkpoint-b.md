# MYEVE OWNER EXPERIENCE / ALPHA UX

Checkpoint: B — Today + clean owner, with shared Work presentation required by C/D.

Status: PARTIAL. Canonical base: `8338309582d6806829dec1ae1beef301d6b52425`. Branch: `codex/myeve-owner-experience`. Candidate is the commit containing this report (exact remote SHA recorded in chat after push).

Implemented readable Work lists and a shared chat/detail summary from the existing canonical projection. Today surfaces Work needing attention, active Work, candidates ready for review and accepted history. Private verified partial candidates remain distinct from completed/accepted outcomes. Failed, paused, not-dispatched and UNKNOWN records cannot become successful or active execution. Raw technical summaries remain under Proof. No controller or lifecycle mutation was added.

| Area | Verdict and scope |
| --- | --- |
| Unified shell / alpha navigation | PASS for initial routes and populated paused Work detail |
| Feature-policy UI | PARTIAL — initial route/control coverage passes; rich journey pending |
| Today | PASS for clean, queued and paused synthetic Work |
| Sofie / Work | PARTIAL — shared presentation implemented; richer result/fault and durable conversation coverage pending |
| Needs You / Files | PARTIAL — populated redesign pending |
| Settings | PASS for theme/signout shell scope |
| Clean-owner isolation | PASS for prior cross-owner Work/Goal/thread/file cases on PostgreSQL |
| Historical-data filtering | PARTIAL — no predicate regression; exact screenshot provenance remains unknown |
| Desktop / 390px | PASS for populated paused Work and clean core routes |
| Accessibility | PASS in tested scope, no critical/serious axe findings |
| Visual regression | Clean baselines updated with settled-data waits; populated paused captures reviewed |
| Route/API authority regression | PASS, original denial checks retained |
| PostgreSQL qualification | Synthetic queued/paused Work persistence and reload, owner exclusion/readback |
| Fresh-clone suites | Pending final candidate |
| Hosted CI | A: 8/9 browser tests passed; one login exceeded the 15-second dev-server timeout. CI request allowance raised to 60 seconds; B pending push |
| Independent product review | PASS for limited B/C/D presentation foundation after six concrete mapping/copy corrections |
| Public disclosure review | PASS: synthetic records only; no tester data or credentials |

Focused Work/projection tests: 29 passed, including 20 presentation cases. TypeScript passed. Full browser run: 11 passed; baseline comparison repeated separately after correcting a hydration capture race.

No new migrations, execution API, authority, FactoryVersion or accounting changes. Work Inbox read API adds presentation fields and Ready/Stopped lane counts only. Existing owner predicates remain intact.

Paid model operations: 0. Production deployments: 0. Tester mutations: 0. Executable tester grants: 0. Publication effects: 0. External-alpha authority changes applied: 0.

Remaining: richer verified/failure/UNKNOWN and inline-chat fixtures, complete durable golden journey, unified decision/history, coherent Files, final accessibility/visual coverage, fresh-clone and hosted qualification, exact historical screenshot attribution.

Next checkpoint: C — Sofie and durable Work, then D–H automatically. This report is not a release PASS.
