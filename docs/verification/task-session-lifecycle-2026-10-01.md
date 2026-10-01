# Task/session lifecycle repair — October 1, 2026 UTC

Local qualification passes. Production qualification and canonical release receipts will be added after deployment; no live success is claimed here.

## Preserved first failure

The [original production dossier](computer-federation-production-2026-10-01.md) and its immutable failed sequence remain unchanged. Conversation `wrun_41M3TV4TCX0GWZ0KDVSST9W6HC` held current Run `action_run_dd4f0139-c978-49d5-b424-16040ef7c068`, expired at `2026-10-01T04:37:00.207528Z`. Shell Action `action_1b8c060e-df4f-4fb6-9ebb-93db89b28636` had zero attempts/jobs. The [attempted start_task payload](task-session-lifecycle-2026-10-01/original-start-task.txt) failed on `task_run_sessions_current`. The failed creator transaction rolled back; no replacement task was admitted.

## Root cause and repair

`createDelegatedTask` inserted a new current session row directly. It did not participate in the locked transition already used by owner chat recovery. Retaining the old current pointer after expiry was intentional; bypassing the retirement/eligibility transition was the divergence.

The [lifecycle contract](../architecture/conversation-runs.md#explicit-owner-task-creation-migration-0078) documents migration 0078. It preserves the unique index and history, classifies recoverable standalone Runs, forbids recovery of fatal/protected/exhausted Work, and makes the action-free owner-context → explicit task transition transactional and replay-safe. Consumed model usage and the prior deadline/limits remain constraints. Tool retries cannot renew expired authority themselves; fresh owner input is required.

## Local qualification

- Exact real-PostgreSQL production regression: original creator FAIL (`23505`, current-binding uniqueness); repaired creator PASS. [Before](task-session-lifecycle-2026-10-01/before.log), [after](task-session-lifecycle-2026-10-01/after.log).
- 21 real PostgreSQL lifecycle tests PASS: concurrent owner messages, concurrent task retries, stale response replay, fatal/active/delegated/goal/scheduled Work, budget exhaustion, approval preservation, owner/agent isolation, exact unique-index enforcement, completion and expiry continuation, process termination between retirement and new binding, restart/retry, and preserved model usage.
- Existing PostgreSQL conversation suite: 16 checks PASS. Existing companion/owner continuation integrations: 28 tests PASS, including the actual outbound worker against disposable local state.
- App suite: 1,995 tests PASS (before adding the extra model-usage case); root suite: 144 PASS. Federation and Factory intake/readback regressions included. Optional unrelated integrations remain skipped; no production Factory Work executes.
- Typecheck, capability registry, skills, executor governance and ordered migration checks PASS. Production webpack build PASS. [Logs](task-session-lifecycle-2026-10-01/).

MyFactory execution remains `DEFERRED_TO_PRIVATE_ALPHA_EXECUTION_OWNER`. The isolated admission repair, approved Work binding and third attempt belong to that workstream and are untouched here.
