# Task/session lifecycle repair — October 1, 2026 UTC

Local regression and production qualification PASS on canonical runtime `2efd2b70dfc27656966e2fe4ff46b01afd734835`. The original failed evidence remains unchanged. This dossier records scoped Computer/federation qualification, not MyFactory execution or arbitrary peer interoperability.

## Preserved first failure

The [original production dossier](computer-federation-production-2026-10-01.md) and its immutable failed sequence remain unchanged. Conversation `wrun_41M3TV4TCX0GWZ0KDVSST9W6HC` held current Run `action_run_dd4f0139-c978-49d5-b424-16040ef7c068`, expired at `2026-10-01T04:37:00.207528Z`. Shell Action `action_1b8c060e-df4f-4fb6-9ebb-93db89b28636` had zero attempts/jobs. The [attempted start_task payload](task-session-lifecycle-2026-10-01/original-start-task.txt) failed on `task_run_sessions_current`. The failed creator transaction rolled back; no replacement task was admitted.

## Root cause and repair

`createDelegatedTask` inserted a new current session row directly. It did not participate in the locked transition already used by owner chat recovery. Retaining the old current pointer after expiry was intentional; bypassing the retirement/eligibility transition was the divergence.

The [lifecycle contract](../architecture/conversation-runs.md#explicit-owner-task-creation-migration-0078) documents migration 0078. It preserves the unique index and history, classifies recoverable standalone Runs, forbids recovery of fatal/protected/exhausted Work, and makes the action-free owner-context → explicit task transition transactional and replay-safe. Consumed model usage and the prior deadline/limits remain constraints. Tool retries cannot renew expired authority themselves; fresh owner input is required.

## Local qualification

- Exact real-PostgreSQL production regression: original creator FAIL (`23505`, current-binding uniqueness); repaired creator PASS. [Before](task-session-lifecycle-2026-10-01/before.log), [after](task-session-lifecycle-2026-10-01/after.log).
- 25 real PostgreSQL lifecycle tests PASS: concurrent owner messages, concurrent task retries, stale response replay, fatal/active/delegated/goal/scheduled Work, budget exhaustion, approval preservation, owner/agent isolation, exact unique-index enforcement, completion and expiry continuation, process termination between retirement and new binding, restart/retry, preserved model usage, system-finalized timeout classification, and unresolved executing/unknown Action fencing.
- Existing PostgreSQL conversation suite: 16 checks PASS. Existing companion/owner continuation integrations: 28 tests PASS, including the actual outbound worker against disposable local state.
- Final reconciled app suite: 2,051 tests PASS, 22 skipped; root suite: 144 PASS. Federation and Factory intake/readback regressions included. Optional unrelated integrations remain skipped; no production Factory Work executes.
- Typecheck, capability registry, skills, executor governance and ordered migration checks PASS. Production webpack build PASS. [Logs](task-session-lifecycle-2026-10-01/).

MyFactory execution remains `DEFERRED_TO_PRIVATE_ALPHA_EXECUTION_OWNER`. The live admission/execution repair, approved Work bindings and subsequent attempts belong to that workstream and are untouched here; its newer model repair and paused fourth journey records are preserved.

## Timeout finalization observed before deployment

At the release preflight, the preserved original Run was `failed`, reason `Run exceeded its runtime boundary.`, updated at `2026-10-01T04:40:20.239Z`, with zero recorded model steps/cost and its original expired deadline. This is the canonical operations cleanup path, which updates status then records a system failure transition. The repair requires both the exact timeout classification and its durable system transition before allowing a fresh standalone task. A missing transition fails closed; unrelated fatal failures remain blocked. Original Action attempts remain zero. This does not relabel or revive the failed Run.

Canonical runtime reconciliation merged remote `df3fc0ebb677f1799c1683f5282bebca37232b73` normally. Factory admission/execution files match that canonical source byte-for-byte. The later documentation-only canonical `399c8d0fc31a954ba6989b370c471e524f17acf3` was fast-forwarded before this evidence update; no runtime source changed during that reconciliation. No separate workstream settings or execution were changed. The merged source passed the production build, typecheck/governance, 144 root tests and the application suite.


## Live production qualification

Production deployment `dpl_HyP7xVkpQuw4ZdXyTpTyxfSD8WqZ` was READY at 05:18:19 UTC on October 1, with runtime SHA `2efd2b70dfc27656966e2fe4ff46b01afd734835`. [Deployment receipt](task-session-lifecycle-2026-10-01/runtime-deployment.json). Migration 0078 was applied through the canonical migration runner after checking head 77. No manual history or binding edits were made. Sofie authenticated chat and [Sofie/Relay health](task-session-lifecycle-2026-10-01/live-health.json) passed.

The final documentation release descends from that qualified runtime and the newer canonical documentation. Its exact deployment SHA is reported by Vercel `meta.githubCommitSha` and the release handoff; this document pins the runtime actually exercised instead of inventing a self-referential commit SHA.

### One conversation, expiry, completion and follow-up

UI thread `924157c3-e17b-46e4-b037-07db030f14f3` / session `wrun_41M3TV4TCX0GWZ0KDVSST9W6HC` retained its original failed history throughout:

1. The original failed Run remained failed and historical; its shell Action still has **zero attempts and zero jobs**.
2. Fresh owner input after the system-finalized timeout admitted `action_run_54668028-8a12-4f5b-9037-82240887595b`; `start_task` atomically promoted its action-free context to `task_fad165a1-dfa7-4f06-b4ae-807dfbe7fed8` at 05:19:33 UTC. No duplicate binding occurred.
3. The exact prompt **hello sol, can you review my read.me and tell me about this app** used the paired Mac's roots, file discovery and read operations. Read job `12c0bfa5-13e8-495f-aac0-99ff8063b433` returned the actual root README; its SHA-256 `b06d65982097a6afda0df43faa15aac00b350ed3471afe2be145988bb5b5bf46` matched the local file. Sofie reviewed MyEve, Relay, MyFactory, Foreman and the experimental DeepAgent boundary.
4. `complete_work` completed that task at 05:20:43 UTC. [Completed review screenshot](task-session-lifecycle-2026-10-01/readme-completed.png).
5. An unrelated Alpha request sent in the **same conversation** created canonical Run `action_run_db12d1de-2158-4130-ac44-c365534d30b6` at 05:21:43 UTC, completed the authenticated exchange and answered the owner. No new chat or database repair was used.
6. Further native Send-button and keyboard submissions worked, including the read-only Factory request and desktop check. Simulated extension clicks on the submit button intermittently did nothing; native accessibility activation of the same button sent successfully. That automation limitation is preserved rather than reported as a product fix.

[Database receipt](task-session-lifecycle-2026-10-01/production-lifecycle-receipt.json): exactly one current binding, historical failed/completed/cancelled bindings retained, zero cross-Run approval mismatches. Local concurrency/crash tests additionally establish zero duplicate active bindings, lost history, stale authority carryover and false continuation in the exercised cases.

### Mac crash, permissions and desktop

The exact idle Sofie Local worker was killed with SIGKILL: PID 11074 → launchd automatically restarted PID 2023. No manual companion launch occurred. [Before](task-session-lifecycle-2026-10-01/crash-before.json) and [recovered](task-session-lifecycle-2026-10-01/crash-recovered.json) receipts show authenticated readiness plus Accessibility/Screen Recording enabled for the same Sofie Local application. Pairing identity, Keychain custody and shared roots persisted. The original README read above happened after this restart.

- Screenshot job `0c9b79d2-9170-47b0-b4d4-14419bff0c59` returned a real 1496 × 967 image that Sofie inspected. No private desktop screenshot is committed.
- Earlier Calculator/menu attempts were dispatched but not visibly verified in their later screenshots; those attempts remain **unverified**, not retroactively passed.
- Fresh exact-approved shell job `99537b3a-9024-495d-8640-6dbd13f1cf0a` ran `/usr/bin/open -a Calculator`, exited 0 without termination. Calculator was absent before this attempt, then independently observed running immediately afterward. Native accessibility exposed its actual Calculator window and digit controls. [Window screenshot](task-session-lifecycle-2026-10-01/calculator-observed.png) verifies the harmless desktop effect. The observer did not launch Calculator or click a calculator key.
- The separately proposed `Cmd+w` desktop action was cancelled at its normal exact approval card. Approval `approval_7eca2cf9e3b277da6cf5bb2f39789c62009f0d65c37275094a380ee841abb87c` is **denied**, with **zero execution attempts and zero jobs**. Its Action row retains the existing `awaiting_approval` label; the denied approval remains authoritative and was not reused. No consequential desktop mutation was executed.

### Federation and MyFactory limits

[Live receipts](task-session-lifecycle-2026-10-01/federation-factory-receipts.json) capture generic discovery, versioned message capabilities, scoped permissions, exact approval and correlated reply. Alpha request `frq_ccb0b44cb1814545b43c6179b20de137` completed in one attempt with actual reply **LIFECYCLE-OK**, matching its request and registered peer identity. Discovery granted no authority. Generic federation PASS means this registered peer traversed the generic adapter; it does not claim Muse, GrokBots or an unconfigured MyEve installation works.

Read-only `get_factory_work_order` returned existing request `ee32a8c7-3243-4332-a602-0ad6d678bc1b`, MYE-14, WorkOrder `98e4dd04-d11c-46d1-ad15-f04d6f201034`, receipt version 1, **queued / received_by_factory**. Existing intake/readback PASS is preserved. No new intake or live Factory execution was initiated. MyFactory execution remains **DEFERRED_TO_PRIVATE_ALPHA_EXECUTION_OWNER**; queued is not execution/completion.

## Qualification result

| Gate | Result |
|---|---|
| Exact duplicate regression, concurrent follow-up, historical preservation | PASS |
| Stale authority carryover / duplicate current bindings / lost history | 0 observed in qualified cases |
| Mac pairing, read, shell, screenshot and observed harmless desktop effect | PASS |
| Automatic companion crash/restart, reconnect and post-restart read | PASS |
| Completed-task and expired-execution continuation, same-chat composer | PASS |
| Alpha / generic adapter federation | PASS, registered Alpha scope only |
| MyFactory intake/readback | PASS, existing request only |
| MyFactory execution | DEFERRED_TO_PRIVATE_ALPHA_EXECUTION_OWNER |
| Application/root tests, typecheck/governance, production build | PASS |

Freeze this workstream after the final canonical documentation deployment and post-release checks, unless a concrete Computer/federation compatibility defect is reported.
