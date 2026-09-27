# Fresh authenticated M1/ER1 against 90d668f — BLOCKED

Bounded repair context passed live: all three REPAIR payloads were **12355–12574 bytes**, below the 13000-byte target and unchanged 14336-byte ceiling. The journey did not complete. After inspecting the protected failure, Sofie twice proposed a write with `expectedRevision: 2` while production context supplied current workspace revision **5**. Both writes returned **“Result needs verification before retry.”** Neither changed the retained draft or candidate. The session then hit `Model-step hard stop reached (10/10)` after nine actual paid provider calls; the earlier no-provider verification-wait step also counted toward the session step limit.

No harness changes, alternative provider, extra repair, retry window, or final-explanation call were attempted. M1/ER1 remains **NOT QUALIFIED**.

## Qualification report

| Field | Outcome |
|---|---|
| LIVE M1/ER1 | **BLOCKED** |
| Commit | `90d668f76b5156a304906522295180515cfe85d4` |
| Calls | **9 / 10** |
| Spend | **$0.118796 / $1.30** |
| Duration | **2m 37.711s**, authority issue → revocation |
| Admission | PASS — production v2/g2, one admission |
| ORIENT | PASS |
| PLAN | PASS |
| IMPLEMENT | PASS |
| VERIFY failure | PASS — exact frozen candidate, ten protected check artifacts |
| Bounded repair context | PASS — 12355, 12573, 12574 bytes |
| Failure inspection | PASS |
| REPAIR | FAIL — two stale-revision write proposals, no accepted mutation |
| VERIFY repaired candidate | FAIL — not reached |
| COMPLETE | FAIL — no successful PARTIAL Result |
| Fresh explanation | FAIL — not reached |
| Productive calls | 6 |
| Coordination/nonproductive calls | 3 — admission plus two rejected writes |
| Admission / repository-open / equivalent-read loops | 0 / 0 / 0 |
| No-progress calls | 2 |
| No-progress recovery calls | 0 — session limit stopped further work |
| Duplicate Runs / writers | 0 / 0 |
| Budget violations / unbudgeted calls | 0 / 0 |
| Authority bypasses | 0 |
| Lost candidates/repair proposals | 0 — candidate/draft and both rejected provider outputs preserved |
| Stale-writer updates | 0 — stale revision proposals produced no update |
| Incorrect Current Truth statements | 0 observed; final explanation untested |
| False Ready | 0 |
| Final Result | **FAILED** — retained first-candidate Result |
| Post-qualification authority | **REVOKED** |
| README updated | PASS |
| P0 Gap #2B | **PARTIAL** |
| P0 Gap #2 | **PARTIAL** |
| M1/ER1 | **NOT QUALIFIED** |
| Next Q37 blocker | **Repair tool continuity: consume canonical workspace revision and handle the ActionGateway failure without stale repeated writes, then complete repair submission, protected PASS, PARTIAL and fresh explanation within existing limits.** |

FAIL on an unreached stage means the required live evidence is absent. Zero incident counts apply only to this observed trace. Two tool-action rows remain `result_unknown`; those are not provider usage UNKNOWN, and have not been cleared or falsely marked reconciled.

## Identity and budget

- New isolated Work: `5f658138-b176-40a3-a12e-873b21abbe74`.
- New retained DB: `golden_m1er1_90d668f_198746d9f338`.
- Session: `wrun_01M3GT75DM563MVX72DTXPCPVW`.
- Qualification: `gap2b-m1er1-b076a7b5-582a-4461-8ca7-803a6deea992`.
- Issued `2026-09-27T06:52:39.552Z`; fixed expiry `07:22:39.553Z`; revoked `06:55:17.263Z`.
- Anthropic `claude-sonnet-5`, Vercel AI Gateway, Anthropic-only. All nine receipts record exactly one provider attempt.

Fresh Gateway catalog pricing was checked before admission: input $0.000002/token, output $0.00001/token, cached input $0.0000002/token, cache creation $0.0000025/token. The full conservative ten-call plan was **$1.126410** under the unchanged $1.30 ceiling. The completion reserve covers five implementation, three repair and one explanation calls, plus admission. The new Work was created only after preflight passed. Previous failed Works and retained migrations were not reused or changed.

## Actual authenticated path

The actual Next/Eve HTTP path performed owner login, Work resume, fresh thread/session registration and production context assembly. No browser walkthrough is claimed. The runner supplied only owner intent and selected Work/Agent identity; version/generation, phase transitions and next operations came from production code. The pinned synthetic repository was read through approved GETs only. No excluded capability executed.

| Call | Purpose/operation | Actual spend | Input envelope bytes |
|---|---|---:|---:|
| 1 | admit | $0.006002 | 9375 |
| 2 | open | $0.006988 | 10744 |
| 3 | read | $0.008664 | 11866 |
| 4 | plan | $0.015450 | 12727 |
| 5 | write | $0.013174 | 12598 |
| 6 | submit | $0.010152 | 12883 |
| 7 | inspect | $0.026370 | 12355 |
| 8 | write | $0.014188 | 12573 |
| 9 | write | $0.017808 | 12574 |

The production controller drove admission → open → README read → structured plan → write → submit → protected failure → inspect → attempted write → attempted write. One neutral continuation after the verifier completed asked the existing authorized Work to continue from persisted Current Truth, without supplying phase, operation, revision or source correction.

The first frozen candidate is `1ebf8daabccfd741559dbb6e8aac511ab7330bef`. The independent verifier completed against that exact candidate and retained immutable FAILED evidence. All five original pinned source files are unchanged; only the permitted quantity.mjs implementation was added. No repaired candidate exists.

Every REPAIR payload supplied revision 5, correct Work v2/g2, the same Run/writer, failed candidate, diagnostic bindings and the unchanged repair budget. The two proposed `expectedRevision: 2` writes were rejected. `controller-events.json` records six productive observations and two nonproductive writes. `action-requests.json` preserves both `result_unknown` action rows; `validation.json` confirms the draft content hash and revision stayed unchanged across the repair attempts. The exact underlying gateway/reconciliation cause has not been repaired or independently diagnosed in this live window.

The session hard-stop is distinct from paid provider accounting: nine Gateway dispatches settled, while the runtime counted ten steps including its deterministic verification-wait response. No tenth provider call was used to rescue the journey or obtain a final explanation after failure.

## Closure and evidence

All nine provider calls are RECONCILED. Spend is **$0.118796**, provider reservations **$0**, and provider UNKNOWN exposure **0**. The unused **$0.112641** final-explanation hold remains preserved under a revoked grant; it is not reusable authority. Common-ledger revocation changed status only, preserving every receipt, amount and counter. The two action-level unknown outcomes remain retained separately.

Temporary provider qualification was removed and production authority now reports UNQUALIFIED / effect denied. The new Work is paused at v3/g3. Temporary runtime/verifier processes, listeners and Docker containers are stopped; the database, source, candidates, proposals, checks and history remain preserved. No previous Work or paused peer task was resumed.

`audit.json` binds all nine actual outbound payloads to durable request hashes and dispatch receipts. `current.json`, authenticated Work snapshots, controller/session events and action/context records preserve the journey. `closure.json`, `ledger-revocation.json` and `resource-closure.json` prove teardown. `artifact-hashes.json` pins the dossier. Secrets/cookies and continuation tokens are excluded or redacted. Product source stayed pinned to 90d668f; only evidence and documentation changed.

Stop boundary honored: no harness fix, live retry, ER2, publication, CI/review, Relay, MyFactory, deployment, learning or Capsules were started.
