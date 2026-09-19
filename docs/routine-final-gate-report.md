# Routine final gate — local qualification

**ROUTINE EXECUTION MUST REMAIN DISABLED**

Branch: `codex/openbot`. Starting HEAD: `4d3f1eb`.
Implementation commit: `82fbc7b`. Documentation commit / final HEAD is recorded in the completion response.
Worktree is clean after the documentation commit. Disposable database and UI services were stopped.
No merge, deployment, activation, real send, billable sandbox, or shared database migration was performed.

## Decision and scope

The candidate first release supports research, goal/task review, structured knowledge observations,
email reading, drafts saved in the private Routine result, and one terminal email send after exact
approval. Owner notifications are separate from third-party communication. Provider qualification
requires explicit owner authorization and has **not** been run. This is not a production acceptance claim.

Files, browser interaction, messaging, phone and opaque connectors are intentionally blocked for
initial Routines. Existing interactive workspace write authorization is preserved; Routines do not yet
have a persistent approved workspace binding. Campaign analysis can use supplied knowledge/public
reports, but a workflow that requires a file or private analytics connector cannot be approved under
this initial graph. No new analytics integration, provider draft API or generic messaging integration
was invented.

## Repository executor inventory

Counts are **classified source files**, not tool or provider counts. Mixed sources terminate their
external effects at separately reviewed leaves.

| Classification | Count |
|---|---:|
| ENFORCED | 25 |
| BLOCKED | 89 |
| READ_ONLY | 33 |
| INTERNAL | 322 |
| NOT_APPLICABLE | 24 |
| UNKNOWN | 0 |
| Total | 493 |

The hash inventory requires review whenever an inventoried source changes. It is not a formal proof
of every third-party dependency. No previously blocked provider transport was broadly unblocked.

## Routine-reachable inventory

Scope: 14 explicit candidate tool entries in `lib/routine-capabilities.ts` plus three delivery leaves
(in-app, Telegram and blocked push). Intentionally denied candidates count as BLOCKED. Other tools,
roles, delegation, skill loading, browser tools, terminal and opaque connections are denied by the
runtime policy, even if an Agent independently has those capabilities.

| Classification | Count |
|---|---:|
| ENFORCED | 2 |
| BLOCKED | 4 |
| READ_ONLY | 9 |
| INTERNAL | 2 |
| UNKNOWN | 0 |
| UNENFORCED CONSEQUENTIAL | 0 |

Tools map to existing capability IDs:

| Tools / leaf | Capability | Disposition |
|---|---|---|
| web_fetch, web_search | web.read, web.search | READ_ONLY |
| list_goals, get_goal | tool.list_goals, tool.get_goal | READ_ONLY; get_goal includes tasks |
| search_knowledge, search_owner_knowledge | tool.search_knowledge, tool.search_owner_knowledge | READ_ONLY |
| record_observation | tool.record_observation | INTERNAL; explicit standing authority and risk limit |
| list_emails, search_emails, read_email | corresponding tool.* IDs | READ_ONLY; label mutation blocked |
| send_email | tool.send_email | ENFORCED; exact approval every send |
| read_file, write_file | files.read, files.write | BLOCKED for initial Routines |
| imessage | tool.imessage | BLOCKED |
| private result delivery | internal thread/outbox | INTERNAL |
| owner Telegram delivery | notification.send | ENFORCED; claimed outbox, configured owner only |
| web push delivery | notification.send | BLOCKED |

Every initial type uses the reviewed active owner Agent. Its role intersects these tools through
`effectiveCapability`; it cannot add permissions. Authored skill text is instructional only. Runtime
`load_skill`, delegation, opaque MCP and workflow tool expansion are denied for Routines. The tool
sets below are executable data in `INITIAL_ROUTINES`, not authority derived from prose.

| Routine | Tools before result delivery |
|---|---|
| Daily Brief | web_fetch, web_search, search_knowledge, search_owner_knowledge, record_observation, list_goals, get_goal |
| Weekly Goal Review | list_goals, get_goal, search_knowledge, record_observation |
| Stalled Work Review | list_goals, get_goal, search_knowledge, record_observation |
| Competitor Monitor | web_fetch, web_search, search_knowledge, search_owner_knowledge, record_observation |
| Research Digest | same research set |
| Campaign Performance Review | research set; read_file explicitly blocked if requested |
| Draft Follow-Up | list_emails, search_emails, read_email, search_knowledge; draft in saved result |
| Approved Follow-Up Send | draft set + send_email; one pending terminal send |

## Channels: operation-level audit

READ/DRAFT/SEND/MANAGE/DELETE are separate operations. DRAFT below means a private saved result,
not a remote provider mutation. An absent provider operation is not treated as an authorization.

| Channel/provider | READ | DRAFT | SEND | MANAGE | DELETE |
|---|---|---|---|---|---|
| In-app | owner-scoped internal | private saved result | internal owner result | authenticated internal CRUD | authenticated internal CRUD |
| Web push | subscription state internal | N/A | BLOCKED | subscription storage internal; no grant to send | owner-scoped unsubscribe internal |
| Telegram | bot read transport; inbound channel disabled | private result | owner result notification ENFORCED; general messages BLOCKED | BLOCKED where implemented | BLOCKED where implemented |
| AgentMail email | existing inbox/thread/message GET | private result; no remote draft adapter | send_email ENFORCED; reply/legacy sends BLOCKED | labels/inbox/domain writes BLOCKED | BLOCKED |
| AgentPhone/SMS/voice | existing provider read transport | private result | BLOCKED; consent/spend gates retained | BLOCKED | BLOCKED |
| iMessage/Spectrum/router | inbound channel disabled | private result | messages, reactions, attachment and typing writes BLOCKED | BLOCKED | BLOCKED |
| Slack | channel disabled | private result | BLOCKED | no qualified mutation adapter | no qualified mutation adapter |
| Generic attachments, webhooks, opaque MCP | only declared read paths | private result | BLOCKED | BLOCKED | BLOCKED |

## Security and continuation

- Exact-action approval: PASS locally. Existing account, recipients, subject, complete content,
  optional HTML/CC/BCC, target and expiration are bound. The authored send does not support attachments;
  adding an attachment-bearing path requires qualification. Natural language is not approval.
- One-use handles: PASS locally. Replay, forged/copy, expired, changed binding and revoked authority
  invoke zero additional providers. Existing final pre-transmission checks are preserved.
- Cross-tool circumvention: PASS. Attempts to use browser Send, Publish, Deploy, Delete or Buy are
  rejected before sandbox/provider access and enter the existing Gateway denial path when runtime
  identity exists. Model-supplied effect labels are not trusted.
- Browser effect enforcement: conservative DENY for ambiguous interaction, including fill, click,
  find-action and JavaScript wait predicates. No claim that arbitrary DOM labels prove a business effect.
  Initial Routines have no browser capability. Existing permitted reads/navigation retain their
  account, domain, profile and Computer controller checks.
- Opaque MCP: BLOCKED. Skills, roles, replanning or self-modification cannot expand the finite graph.
- Profile grants: existing ownership/grant + Agent capability + Gateway + controller checks preserved.
- Live Computer: owner keyboard/mouse authority and transport were not changed. Local AGENT → OWNER
  denial → AGENT return, stale version and approval invalidation regression PASS. No sandbox was
  created. Previously allowed ambiguous Agent interactions now deny, so their old qualification does
  not imply supported interaction. **LIVE COMPUTER REQUALIFICATION REQUIRED before restoring those
  interactions**; initial Routines do not depend on them.

`routine_pending_sends` stores one immutable terminal email request per owner/Run, privately, alongside
its Action identity. Approval does not rerun research or invoke a model. A worker claims the waiting
occurrence only after exact unexpired approval, uses the same Run and draft, refreshes its occurrence
claim, and re-enters the Gateway. Changed provider/account/payload, revoked Agent/Routine, expired
budget/deadline or lost lease cannot transmit. The pending payload is sensitive owner data with the
same database protection expectations as saved conversations; it is not exposed by Actions APIs.

A stream failure after a pending approval still preserves the draft. A crash before the checkpoint
or result becomes durable fails closed and requires recovery; it does not restart the whole workflow.
The original Run deadline is not extended while awaiting approval. Expired work needs owner attention.
Multiple pending sends, automatic send batching and replay of a full workflow are outside this release.

## Recovery and reliability

| Requirement | Status |
|---|---|
| Unknown → inspect before write | PASS; no blind Retry |
| Provider occurred / not executed / indeterminate | PASS with fake provider evidence; production absence never proves non-execution |
| Owner decision | PASS; owner/action/decision/time/resolution receipt, microsecond stale token and concurrent CAS |
| Owner confirmed not done | clears approval; fresh authorization required; never sends by itself |
| Cancel uncertain action | recorded cancellation, no assertion about provider outcome; no automatic replay |
| Receipt persistence interruption | PASS; provider inspection before another write |
| Occurrence identity | PASS; period deduplicates occurrence and logical Run |
| Renewable leases | PASS; worker/version/heartbeat/expiry fencing |
| Attempts | PASS; previous attempts retained |
| Worker death | PASS; recovery_required, no blind workflow restart |
| Bounded retry | PASS; backoff only for safe transient cases |
| Auto-pause | PASS; configured threshold, one owner event |
| Resume | current version/Agent/capabilities/dependencies/budget revalidated; no backlog storm |
| SKIP / RUN_LATEST / CATCH_UP_BOUNDED | PASS; bounded to at most five |
| Work vs delivery | PASS; notification failure preserves completed work |
| Daily Brief fixture | PASS; Sarah/Ava, one occurrence/Run/winning claim/result/delivery, durable observation |
| Approved follow-up fixture | PASS; zero sends before approval, same work resumes once, send count one |

Owner attestations are labeled as owner decisions, never as provider proof. Retry remains an explicit
resubmission for fresh authority. No one-click raw payload replay was added. Unsupported recovery
remains Needs You. Cancelling an uncertain Computer action does not release its unresolved reservation.

## Qualification evidence

| Check | Result |
|---|---|
| Complete Vitest suite | 447 tests / 73 files PASS |
| Core contract suite | 130 PASS |
| Action Gateway / executor matrices / leases / races | PASS in isolated PostgreSQL integration |
| New Routine continuation and recovery decisions | PASS; same database SQL used by production |
| Cross-tool circumvention | PASS, real browser entry point + zero sandbox calls |
| Fresh migrations | PASS, disposable schema through 0027 |
| Populated upgrade | PASS, 0025 → 0026 → 0027; existing action receipt/binding retained |
| Migration sequence check | PASS |
| Root typecheck / both workspaces | PASS |
| Capability Registry | 133 definitions / 98 authored tools PASS |
| Skill routing | 93 checks; 50/57 rank one PASS |
| Executor inventory | 493 classified sources; UNKNOWN=0 PASS |
| Builder manifest | PASS |
| Eve production build | PASS |
| Builder production build | PASS |
| Recovery UI | offline actual component: unknown, Recover, owner-done/not-done/cancel; no blind Retry |
| Diff / targeted secret scan | PASS; no new credential patterns detected |
| Real provider sends / billable sandbox | NOT RUN — owner authorization required |

The Daily Brief fixture simulates model/web output and delivery while exercising real isolated SQL
persistence. The approval fixture uses a fake provider and injected exact-approval authority. These
prove orchestration and enforcement contracts, not live model/provider acceptance. Unit coverage
separately verifies production authority policy and that pending-send resume creates no model session.

Local logs: `/tmp/myeve-final-gate-{unit,core,integration,upgrade,migrations,typecheck,eve-build,builder-build}.log`.
Reproducible fixtures: `test/routine-final-gate-cases.mjs`, `test/execution-reliability.integration.mjs`,
`test/action-upgrade.integration.mjs`, `scripts/qualification-recovery-ui.mjs`.

## Remaining real-provider gate — explicit authorization required

Minimum proposed live qualification: one AgentMail email to an owner-controlled address, with no
attachments/CC/BCC, through exact approval and the canonical adapter; verify provider message identity
and Action receipt, then attempt handle replay and a changed binding with zero additional sends.

Proposed subject: **[MyEve qualification test] Exact-action send**

Proposed body: **This is an owner-authorized MyEve qualification test. One email should be sent.
No reply or action is required.**

Owner must identify/approve the sending account and owner-controlled destination before transmission.
The owner notification category should use in-app delivery for the initial controlled release. If
external Telegram notification is required for that release, its real owner-only send/receipt must
also be authorized and qualified; no general Telegram messaging becomes available. No phone or
Live Computer sandbox test is necessary for the proposed restricted Routine graph.

Configured credentials are not authorization. Nothing in this report flips `ROUTINE_RELEASE.enabled`.
Even after live qualification, enablement is a separate owner decision.
