# Action Gateway completion qualification

Branch: `codex/openbot`
Starting commit: `81979b6` (preserved)
Implementation commit: `d75b498`
Final HEAD: the documentation commit containing this report (reported with its hash in the completion response).

**Recommendation: ROUTINE EXECUTION MUST REMAIN DISABLED.**

The completion slice closes reviewed unqualified transports by blocking them and
adds receipt-based recovery, exact-binding deduplication across tool-call IDs,
handle expiry/revalidation, and an explicit release gate. It does not make blocked
features available. The coupled gateway state machine, provider-boundary changes
and recovery migration are one implementation commit; audit/report evidence is a
separate documentation commit. Nothing was squashed into the accepted foundation.

| Requirement | Result |
|---|---|
| Executor inventory | 488 classified source files; every entry has a reason and fingerprint |
| ENFORCED | 23 |
| BLOCKED | 89 |
| READ_ONLY | 33 |
| INTERNAL | 319 |
| NOT_APPLICABLE | 24 |
| UNKNOWN | **0** |
| Opaque MCP | BLOCKED at connection and native transport boundaries |
| Original 28 tools | All intentionally remain BLOCKED; individual decisions in audit |
| Legacy owner paths | Authenticated owner CRUD remains INTERNAL; unqualified provider mutations BLOCKED |
| Channel paths | Slack, Telegram, Phone and iMessage channel admission BLOCKED; email legacy writes BLOCKED; in-app delivery INTERNAL |
| Phone | BLOCKED; existing live qualification, consent, quiet-hour and spend controls preserved |
| Connected apps | Opaque/native mutations BLOCKED; no transport-wide write grant |
| Computer/Browser | Agent adapters ENFORCED; AGENT/OWNER/version fences; unqualified recreation, owner input, remote teardown and VNC BLOCKED |
| Persistent Browser Profiles | Existing ownership/grant code preserved; Orgo execution and live credentials BLOCKED; no expansion |
| Routine occurrence identity | PASS — deterministic identity, unique occurrence and canonical Run |
| Renewable leases | PASS — occurrence heartbeat/expiry/stale-worker fencing |
| Retry/backoff | PASS — bounded attempts/delay; unknown or completed effects do not rerun |
| Missed occurrences | PASS — SKIP, RUN_LATEST, bounded recent catch-up |
| Auto-pause | PASS — failure threshold, one durable owner notice, owner-authorized resume |
| Execution/delivery separation | PASS — work stays completed, one work attempt despite denied/failed delivery |
| Recovery | PASS — read-only inspection; exclusive recovery lease; completed/retryable/Needs You; no blind resend |
| Recovery UX | PASS — actual component in isolated browser fixture; Recover does not resend; retry eligibility only after proof |
| Action History | PASS — owner-scoped target, Agent, trigger, authority, approval, attempt, receipt/history and recovery |
| Builder manifest | PASS — fixed three missing existing manifest entries; new shared files ship automatically |
| Unit tests | **434 PASS**, 70 files |
| Core contract tests | **130 PASS** |
| Gateway/executor/recovery contracts | PASS — isolated DB suite plus six capability matrices |
| Race/concurrency | PASS — occurrence claims, one-use handles, distinct call IDs sharing a binding, recovery claims, stale workers |
| Database qualification | PASS — fresh schema and populated 0025→0026 upgrade, local PostgreSQL only |
| TypeScript / root typecheck | PASS — both workspaces |
| Capability Registry | PASS — 133 definitions, 98 authored tools |
| Skill routing | PASS — 93 checks; 50/57 rank one (87.7%) |
| Eve production build | PASS |
| Builder production build | PASS |
| Source hygiene | PASS — git diff checks; targeted staged added-lines secret scan, no matches |
| Live Computer regression | PASS with fake/local providers: AGENT → Take Over → OWNER denial → Return Control → AGENT; stale control and approval invalidation checks |
| Real-provider acceptance | NOT RUN; no billable sandbox, phone call, real send or provider mutation |
| Shared/Production mutation | **NONE** |
| Routine execution | **DISABLED**, no environment override |
| Worktree | Clean after the report commit |

## Qualification evidence

- `apps/eve/test/execution-reliability.integration.mjs`: disposable local PostgreSQL
  fixture; includes action executor, coverage and recovery suites. Provider calls
  are fake, and database configuration never reads DATABASE_URL or a shared host.
- `apps/eve/test/action-upgrade.integration.mjs`: populated 0025 schema upgraded to
  0026, preserving binding/receipt/attempt/history and enforcing recovery states.
- `apps/eve/test/action-coverage-cases.mjs`: six capability boundary contracts for
  DENY, pending approval, approved, expired, declined, changed binding, replay,
  unavailable authority/target and the local Computer control sequence.
- `apps/eve/test/action-recovery-cases.mjs`: receipt loss, verified completion without
  another write, proven non-execution requiring fresh authority/approval,
  indeterminate outcome, owner isolation, duplicate inspectors, handle expiration,
  revocation after handle creation and concurrent distinct call IDs.
- `apps/eve/lib/action-recovery-route.test.ts`: anonymous/cross-origin requests deny;
  owner identity comes from the signed session, not a supplied body.
- `apps/eve/scripts/qualification-recovery-ui.mjs`: reproducible offline fixture for
  actual React/Kumo recovery UI. Browser checks covered loading, empty, failure,
  approval, confirmed success, retry eligibility and Needs You. These are component
  acceptance checks, not a claim of deployed end-to-end acceptance.

Existing legacy protocol tests explicitly mock the new block guard so credential,
consent and payload-format tests continue exercising those old protocols. Separate
boundary tests use the real guards and assert no provider invocation. No production
flag or runtime escape hatch was introduced for those test mocks.

## Known limitations and rollout requirements

1. Blocking is the chosen disposition for unqualified channels, connected-app writes,
   Phone, Orgo profiles, owner remote input, provider teardown and opaque QA browser
   execution. This is a substantial availability change, not a completed replacement
   for those features. The preserved owner-control lease state machine can still
   take over/return control, but real owner input is unavailable.
2. Email recovery requires durable message identity; file recovery requires a checksum
   and the existing sandbox. Missing evidence cannot establish non-execution. Generic
   browser business effects return Needs You and keep unresolved control reservations.
3. Retry eligibility is shown only after authoritative non-execution evidence. The
   owner resubmits the original request through current authorization; this slice does
   not store raw secret-bearing payloads or expose an automatic resend endpoint.
4. Migration 0026 refuses duplicate legacy live bindings. Inspect and reconcile such
   rows before any separately authorized shared rollout. Never silently discard a
   potentially transmitted action to make the unique index succeed.
5. Revocation is checked immediately before provider invocation, but cannot recall a
   request that has crossed that final check. Provider uncertainty requires inspection.
6. The source inventory is comprehensive for the audited runtime TypeScript and is a
   build-time change detector, not formal whole-program verification. Dependency or
   harness changes still require a new execution-path review.
7. No live-provider acceptance was performed or authorized. Routine release stays
   disabled; enabling, merging, deploying and shared migrations remain separate work.

The local database and offline UI server were stopped after qualification. No
production settings, credentials, provider accounts or deployed state were changed.
