# Final fresh M1/ER1 against 84be8db — BLOCKED

The real authenticated journey progressed through admission, ORIENT, PLAN, source IMPLEMENT and an independently verified failing candidate. The first repair continuation was blocked before provider dispatch: `completion_input`, **16040 / 14336 bytes**. The conservative economic plan fit, but the actual post-failure context did not fit its admitted input envelope. No retry, context override, budget increase or product-code fix was performed. M1/ER1 is **NOT QUALIFIED**.

## Required report

| Field | Outcome |
|---|---|
| LIVE M1/ER1 | **BLOCKED** |
| Commit | `84be8db765b738e62ef662164ac57cb1a4750361` |
| Calls | **6 / 10** |
| Spend | **$0.061718 / $1.30** |
| Duration | **2m 33.876s** — authority issuance to revocation |
| Admission | PASS — one admission using production-supplied v2/g2 |
| ORIENT | PASS — pinned repository opened; README inspected; permitted new target absent |
| PLAN | PASS — structured bounded implementation intent persisted |
| IMPLEMENT | PASS — actual `quantity.mjs` mutation and frozen candidate |
| VERIFY failure | PASS — independent protected verifier evaluated the exact candidate and retained FAIL |
| REPAIR | FAIL — required live proof absent; context rejected before interpretation/repair call |
| VERIFY repaired candidate | FAIL — not reached |
| COMPLETE | FAIL — no successful immutable PARTIAL Result |
| Fresh explanation | FAIL — not reached; no final read-only call spent |
| Productive calls | 5 — open, read, plan, write, submit |
| Coordination calls | 1 — admission |
| Admission loops | 0 |
| Repository-open loops | 0 |
| Equivalent-read loops | 0 |
| No-progress recoveries | 0 |
| Duplicate Runs | 0 |
| Duplicate writers | 0 |
| Budget violations | 0 — oversized repair context denied before dispatch |
| Authority bypasses | 0 |
| Lost candidates/repairs | 0 — one candidate retained; no repair draft created |
| Stale-writer updates | 0 |
| Incorrect Current Truth statements | 0 observed; final explanation was not exercised |
| False Ready | 0 |
| Final Result | **FAILED** — immutable result for the deliberately failing first candidate; no PARTIAL success |
| Post-qualification authority | **REVOKED** — provider and common budget |
| README updated | PASS |
| P0 Gap #2B | **PARTIAL** |
| P0 Gap #2 | **PARTIAL** |
| M1/ER1 | **NOT QUALIFIED** |
| Q37 next blocker | **Post-verification repair-context assembly must fit the admitted completion input bound through the real authenticated continuation path, then complete one repair, protected PASS, immutable PARTIAL, and fresh accurate explanation.** |

FAIL on an unreached stage means the required live qualification is missing. Zero incident counts apply to the observed trace only. This run does not close either gap.

## Identity, pricing and authority

- New Work: `b9264529-d903-4ba8-ad30-e9f53f8c0151`.
- New retained DB: `golden_m1er1_84be8db_adaeeb156cc1`.
- Owner / Agent: `m1er1-84be8db-owner` / `m1er1-84be8db-sofie`.
- Writer session: `wrun_01M3GMJDGGQZBE9JG7FE0Z44N8`.
- Run: `7e291158-f1af-4595-866a-cd9326725550`.
- Qualification: `gap2b-m1er1-8dc623e8-5d30-4e60-bf2b-c912fa07ec78`.
- Authority issued `2026-09-27T05:13:54.598Z`; fixed expiry `05:43:54.599Z`; revoked `05:16:28.474Z`.
- Provider: real Anthropic `claude-sonnet-5` through Vercel AI Gateway, Anthropic-only; each paid call has one provider attempt.

Immediately before the window, Gateway catalog pricing was fetched: input $0.000002/token, output $0.00001/token, cached input $0.0000002/token, cache creation $0.0000025/token. The full conservative ten-call maximum was **$1.126410**: admission $0.112641 plus completion reserve $1.013769 for five IMPLEMENT, three REPAIR and one EXPLAIN calls. The input bound remained 14336 bytes and maximum output 2048 tokens. See `preflight.json` and `window-authority.json`.

Only the new database received the existing migration chain during preparation. No retained database was migrated again; previous failed Works and their authority/history remain untouched. Product source stayed pinned throughout. The paused MVP task was not resumed.

## Actual execution and evidence

The Next/Eve authenticated production HTTP path performed owner login, Work resume, fresh thread registration, selected Work/Agent binding, and session creation. No browser walkthrough is claimed. `start.mjs` supplies owner intent only: no Work version/generation, phase transition or next operation. The production context supplies v2/g2; the admission proposal and durable Run/writer agree. The external guard admits only pinned repository GETs, pricing GETs, and ledger-backed model requests. No excluded capability ran.

The production controller derived ORIENT → PLAN → IMPLEMENT → VERIFY → REPAIR. All five scoped native observations are productive; no repeated admission, repository opening or equivalent read occurred. Each productive payload retains Software Engineer, JStack and potato instructions. Actual outbound payloads bind exactly to the six durable model-call request hashes; see `audit.json`, `controller-events.json`, `context-assemblies.json`, and `dispatches/`.

| Call | Purpose | Cost |
|---|---|---:|
| 1 | Authenticated admission reasoning | $0.005944 |
| 2 | ORIENT: open pinned repository | $0.006970 |
| 3 | ORIENT: read README | $0.010066 |
| 4 | PLAN: structured implementation intent | $0.017972 |
| 5 | IMPLEMENT: write quantity.mjs | $0.011278 |
| 6 | IMPLEMENT: submit exact candidate | $0.009488 |

The candidate is `57f6df6c160f59ff52625e953adb88683ccd76c6`, artifact hash `1508e4fb14743d261542c966ecd64352bce61a957a7ae4a85a5de7398ad33afb`. All five original pinned files are unchanged. Only `quantity.mjs` was added. It deliberately uses `parseInt`; protected verification recorded ten failed checks, including the fractional case. No claim is made that the fractional case was its only defect.

The verifier ran separately without provider credentials against the frozen candidate and pinned Docker image. Its completed job retained ten check artifacts and immutable FAILED Result `b713af59-1d85-4dfd-870e-5c02d62806c0`. `current.json` contains full source/draft/candidate/evidence and job records; `work-protected-failure.json` is the authenticated projection showing REPAIR/inspect and the same Run/candidate.

After submission the production session stopped while protected checks were pending. Once the independent result existed, one neutral continuation requested the existing authorized Work continue from persisted Current Truth. It supplied no phase, operation, failure contents, code, or correction. The first HTTP request used a continuationToken rejected by the session-ID route (400, no execution); the same message without that unsupported field was accepted (202). This is recorded in `transport-note.json`; it did not consume an extra model call or create another session/Work.

The accepted continuation hit `completionModelOptions`: `Current Work context exceeds the admitted completion bound (16040/14336); draft and evidence are preserved. No model request dispatched.` See `server.log`. No seventh reservation/dispatch exists. No final explanation was attempted after the blocker. The trace therefore proves forward progress through the first candidate, but not autonomous repair, final spend explanation, or complete Work↔Chat parity.

## Closure and integrity

Temporary provider qualification was removed and its state marked REVOKED. Production authority reports UNQUALIFIED and denies effects. The isolated Work was administratively paused at v3/g3. All six receipts are RECONCILED, total $0.061718; reserved and UNKNOWN exposure are zero. The remaining **$0.450564 completion hold** is preserved as accounting history under the revoked grant; it is not reusable authority. Ledger revocation changed status only; amounts, counters and receipts are unchanged.

`closure.json`, `ledger-revocation.json`, `work-closed.json` and `resource-closure.json` document teardown. Temporary supervisors/listeners and Docker containers are absent; the database and artifacts remain retained. No historical Work was cancelled/deleted, no failed qualification was retried, and no migration history was rewritten.

`validation.json` records evidence checks. `artifact-hashes.json` pins all exported artifacts. Cookies, session secrets, provider credentials, GitHub tokens and bearer continuation tokens are excluded/redacted. The synthetic login password in runner source is redacted. This is an evidence/documentation update only, with no native harness changes, additional model calls, ER2 work or automatic follow-up window.
