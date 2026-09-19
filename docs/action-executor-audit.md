# Action executor enforcement audit

Base: `74fee5b`. Local implementation only; no production migration or deployment.

## Pre-change inventory

READ means no intended remote mutation; WRITE includes owner data. CONTROL changes
execution or device authority. DELIVERY is an external send, independent of work.
Registry IDs remain canonical; provider-specific names need explicit adapters.

| Executor / source | Capability / class | Concrete target | Existing check | Gateway at base | Approval / evidence needed |
|---|---|---|---|---|---|
| `send_email`, `reply_to_email`, email send API | email.send via tool IDs / EXTERNAL_SIDE_EFFECT | AgentMail inbox + all recipients or original message | guest gate / web auth | none | exact content/account/recipients; provider message ID |
| `read_email`, label/domain/inbox helpers | email.read/write / READ or WRITE | inbox/thread/domain | guest gate; inbox lookup may provision | none | no mutation under a read label; label/domain action receipt |
| AgentPhone tools and outbound channel | message.send/call / EXTERNAL_SIDE_EFFECT, DELIVERY | configured number + recipient | guest/transport auth | none | exact recipient/content; provider ID |
| iMessage tools, attachments and channel sends | message.send / DELIVERY | authenticated conversation/handle | channel pinning, guest checks | none | exact conversation/content; transport receipt |
| `write_file`, `share_file`, artifacts | files.write/share / WRITE, EXTERNAL_SIDE_EFFECT | sandbox ID + canonical path; blob/artifact ID | computer capability or guest gate | none | checksum / blob ID; exact share target |
| `bash`, sandbox commands | terminal.execute / READ (bounded diagnostic) | sandbox + working directory | command allowlist, computer control | none | preserve restriction; do not allow arbitrary shell |
| persistent-agent browser override | browser.* / READ, CONTROL, EXTERNAL_SIDE_EFFECT | exact computer/browser session, domain, selector | capability, provisioning, event ledger | none | executor control fence; submission distinct from navigation |
| browser evaluate, tabs, uploads | browser.execute/control, files.write | exact browser context and resource | coarse browser.read/write classification | none | JavaScript is not a harmless read |
| Orgo computer task/bash/control | computer.execute/input / CONTROL, EXTERNAL_SIDE_EFFECT | persistent profile/desktop | profile ownership/status; no canonical action | none | opaque multi-action instructions cannot receive blanket authority |
| local computer task / MCP | computer/file/shell / READ, WRITE, CONTROL | paired machine + exact path/action | guest gate, Eve approval | none | exact resolved target; canonical approval |
| Composio MCP | connected-app read/write / READ, EXTERNAL_SIDE_EFFECT | provider, connected account, resource | primary Agent bypass; coarse integration permission | none | explicit operation mapping; unknown meta-tools deny |
| Agentcard MCP and card tools | card/spend / EXTERNAL_SIDE_EFFECT | account/card/amount | guest/connection approval | none | typed financial adapter; no generic tool-name inference |
| QA subagent browser/tools | browser, probe, test execution / READ, EXTERNAL_SIDE_EFFECT | approved preview URL / sandbox | task/specialist scope | none | child identity and delegation ceiling; arbitrary scripts may write |
| reminders / routines | scheduler / CONTROL | owner + reviewed routine version | owner review; production activation blocked | drafted only | retain gate until every reachable executor qualified |
| inbound webhooks / background chat | tool-dependent / CONTROL | webhook event -> owner/run | secret or channel auth | none | trigger is not authority; fail closed absent bounded grant |
| review/push/Telegram notifications | notification.send / DELIVERY | owner subscription/chat + durable result | owner prefs and Phase 3 delivery claim | none | gateway denial leaves work completed; no blind resend |
| goals/tasks/evidence/leases/audit | internal bookkeeping / WRITE | owner-scoped DB row | owner/task scope | not required for bookkeeping | preserve canonical runs and evidence |
| skills, memory, consent, Agent configuration | configuration / WRITE, CONTROL | owner + skill/memory/policy record | owner gates / DB scope | none | authority expansion cannot be self-granted; skill text grants nothing |
| owner UI profile deletion, live input, uploads | CONTROL, WRITE, EXTERNAL_SIDE_EFFECT | exact authenticated owner resource | web auth + live OWNER lease | none | preserve owner takeover; track separately from Agent adapters |
| deployment/publish | DEPLOY/PUBLISH via shell, connectors, browser | project + environment | no dedicated root tool | none | deny opaque paths; dedicated target adapter required |

The runtime's `actions.requested` event is observational and cannot replace checks
inside `execute`. Dynamic tools need inline executors to survive Eve replay. No
framework patch, model prompt, Skill, Role or Solution Pack may grant authority.

## Acceptance boundary

An executor is migrated only when direct invocation without gateway authority
cannot reach its provider, approval binds the concrete target and payload, fake
provider counts prove DENY=0 / exact approved=1, and uncertain outcomes cannot
retransmit. Anything else stays explicitly unqualified; Routine activation stays
blocked. Internal lease/receipt bookkeeping is not an external-action bypass.

## Implemented coverage

| Surface | Disposition | Verification |
|---|---|---|
| Agent `send_email` | Gateway at tool, adapter and bound AgentMail send helper | Exact account/recipients/content hash; provider message lookup; one-use handle |
| Agent `write_file` | Gateway with computer lease and sandbox/path binding | Canonical path check and content checksum readback |
| Browser static extension and dynamic override | Shared gateway; JavaScript/unsupported operations denied | Domain/session binding and snapshot hash; semantic mutations remain unknown until reconciliation |
| On-demand computer provisioning | Gateway before session/network provisioning | Persisted session/sandbox identity and executable state |
| Routine Telegram delivery | Narrow system authority plus exact outbox claim | Provider message ID, chat and fixed message confirmation |
| Routine push delivery | Blocked pending subscription-target adapter | Zero sends |
| 28 opaque or unqualified tool write surfaces | Explicit denial inside execute | Provider unreachable from those tool bodies |
| Composio, local-computer and Agentcard MCP | Denied pending typed adapters | No connection-wide write grant |
| QA child browser, shell and generic file writer | Denied pending child identity/delegation grant | No inherited parent authority |
| Email reads | Existing read path retained; mark-read denied | Account resolution no longer provisions an inbox |

The broad blocks intentionally affect mixed read/write tools too (phone, artifacts,
opaque MCP). They are a compatibility cost of lacking a trustworthy operation-level
target resolver, not a claim that those reads are themselves consequential.

## Historical gaps at accepted commit 81979b6

At 81979b6 this was an incremental enforcement slice, **not qualification of all execution
paths**. The completion audit below supersedes these historical gaps. `ROUTINE_EXECUTION_READY` remains hard false. Owner review remains required
before legacy reminders can execute, including after instruction or schedule edits.

- Owner UI sends/uploads/live controls, channel-generated replies and legacy Phase 3
  review/push delivery retain their existing checks. They are not canonical-gateway
  adapters yet. Exported legacy provider helpers still serve those paths.
- Computer recovery/stop and bounded QA preview/evidence helpers retain existing
  scope checks; their full lifecycle is not claimed as gateway coverage.
- On-demand role attribution must match the canonical Run. Missing role/delegation
  grants fail closed; this slice does not supply a general delegation system.
- Browser clicks cannot generically prove business effects. They retain the computer
  reservation and require reconciliation; there is no automatic resend or owner UI
  recovery button. Read-only receipt recovery is an internal API.
- A process crash after the durable execution claim is conservatively uncertain,
  even if it may have occurred before transmission. It is never blindly retried.
- Concurrent requests can produce extra pending approval cards; execution still
  requires the single Action-bound approval and a successful claim. Approval-card
  creation needs atomic deduplication before broad rollout.
- Executor fingerprints detect new/changed registration sources, not arbitrary
  transitive helper mutations. The 164-source inventory explicitly distinguishes
  existing reviewed code from qualified adapters; it is not a security proof.
- No live-provider qualification or browser visual acceptance was performed.

Revocation semantics: queued occurrences of old versions cannot execute; active
Runs recheck current Agent/Routine authority at each new gateway Action. Completed
Actions remain historical facts. Notification denial preserves completed work and
does not create another work attempt.

## Historical local validation at 81979b6

- Production Next build passed after clearing a stale generated `.next` cache.
- TypeScript, capability registry (133 definitions), executor inventory (164
  sources), and imported-skill routing checks passed.
- Vitest: 409 tests passed across 65 files. Core Node suite: 130 passed.
- Disposable local PostgreSQL: all migrations including 0025 plus claim races,
  owner review/revocation, exact approval, changed account/recipient, expiry,
  provider-call denial, receipt recovery, computer control fences and notification
  denial tests passed. Fixtures use no real providers or shared database.
- Migration 0025 is prepared only. Nothing was deployed or migrated to production.


## Completion qualification (from 81979b6)

**Recommendation: ROUTINE EXECUTION MUST REMAIN DISABLED.** No automatic enablement,
merge, deployment or shared-database migration is part of this slice.

### Canonical final inventory

The complete path-by-path source inventory is
`apps/eve/scripts/executor-inventory.json`. It now fingerprints all Agent TypeScript
(including channels, helpers, bootstrap, extensions and child registrations), all
server/shared `lib` TypeScript and every API route. The checker rejects missing
classifications, new files and unreviewed modifications. These are **source counts**,
not independent capabilities or a claim that every function in a mixed file writes.

| Classification | Sources |
|---|---:|
| ENFORCED | 23 |
| BLOCKED | 89 |
| READ_ONLY | 33 |
| INTERNAL | 319 |
| NOT_APPLICABLE | 24 |
| UNKNOWN | **0** |
| Total | **488** |

Mixed transport modules classify their consequential leaf: reads may remain
available in a BLOCKED module. INTERNAL orchestration can call an ENFORCED or
BLOCKED leaf, but cannot bypass it. The file-level reason documents this scope.
This inventory is review evidence and a change detector, not a whole-program proof.

### Consequential leaves and owner paths

| Surface | Final classification | Boundary / effect |
|---|---|---|
| Agent email send | ENFORCED | Exact inbox, recipients and payload; adapter handle plus second transport handle; provider ID verification |
| Legacy email owner send, channel replies, labels, domains, inbox provisioning | BLOCKED | AgentMail HTTP mutators require the exact bound send handle; all other mutators deny |
| Sandbox file writer | ENFORCED | Owner/Computer lease, sandbox identity, canonical workspace path, content checksum |
| Static/dynamic browser operations | ENFORCED | Canonical gateway, AGENT controller, session/domain/target binding; opaque JS and unsupported operations BLOCKED |
| Computer provisioning/network expansion | ENFORCED | Exact runtime target, one-use handle, persisted sandbox/session verification |
| Routine Telegram result notification | ENFORCED | Fixed message, exact owner/chat, completed Run, current routine and outbox lease; provider message evidence |
| Routine/legacy push and legacy review Telegram | BLOCKED | Lower-level sends deny; originating work/checkpoint is preserved |
| Telegram/Slack framework channels | BLOCKED | Default export registers only 503 admission, no model turn or outbound event/receive handlers |
| AgentPhone text/voice, provisioning and administrative provider mutations | BLOCKED | Channel admission disabled and HTTP mutators deny; consent/spend/quiet-hour logic and live qualification flag remain intact |
| iMessage deployment/router/Spectrum writes | BLOCKED | Channel admission, router POST, SDK initialization and stub POST guards cover sends, OTP, typing, reactions and attachments |
| Composio MCP/native RPC, Agentcard, local-computer MCP | BLOCKED | Connection policy plus direct transport guards; no arbitrary remote tool dispatch |
| Orgo task/input/lifecycle and persistent profile use | BLOCKED | Mutating HTTP, model task endpoint and live credential export blocked; VNC relay cannot open upstream |
| Live Computer owner input/provider teardown | BLOCKED | Real provider leaf denies; owner lease Take Over/Return Control remains INTERNAL; live observation is read-only |
| Computer recovery/recreation | BLOCKED | Cannot provision a new session outside the gateway |
| Computer stop/pause/lease revocation | INTERNAL | Owner/Agent scope checked; deny-all network restriction and durable revocation only; provider teardown remains blocked |
| QA child browser/suite and child shell/file tools | BLOCKED | No inherited parent grant; fixed QA suite cannot bypass browser/file authority |
| Public file sharing / authored video rendering | BLOCKED | Leaf guards prevent public blob publication or execution of arbitrary authored rendering code |
| Operations alert webhook | BLOCKED | Fixed infrastructure webhook still cannot become an ungoverned external send |
| Owner Agent/Goal/Knowledge/Memory/settings/Routine/profile-grant CRUD | INTERNAL | Signed owner route authentication and scope; Agents do not receive owner cookies/admin tokens; provider writes still hit leaf guards |
| Agent Knowledge writes | INTERNAL | Authenticated owner, active attributed Agent capability, signed occurrence/manifest checks when applicable; no ambient owner fallback |
| Private owner files/artifacts, receipts, evidence, leases, in-app delivery | INTERNAL | Owner-scoped application storage and bookkeeping, not publication or messaging |
| Deployment/publish | BLOCKED | No authored deployment tool; shell forbids scripts/network clients, opaque connectors deny, browser actions require gateway |
| Packaged Skill scripts | NOT_APPLICABLE | Not registered executors; root diagnostic shell and disabled child shell cannot launch them |

Narrow INTERNAL infrastructure exceptions are explicit: canonical SQL/private
application storage, model inference/session transport, configured privacy-filtered
telemetry, fixed sandbox template installation, and live-view/control transport
setup. None accepts an arbitrary business action or grants a tool capability.
Provider lifecycle teardown and owner input are deliberately not treated as these
exceptions. Framework/default tools are scoped by the installed Eve default-harness
contract: bash/write_file are replaced; read_file/glob/grep are observations;
web_fetch/web_search are read operations; todo/load_skill do not grant authority.
Builder deployment endpoints are NOT_APPLICABLE to the MyEve runtime: they run in a
separate authenticated builder application, not in the Agent's reachable tool graph.

### Disposition of the original 28 blocked tools

All remain intentionally **B — BLOCKED**. None was mass-enabled. Mixed read/write
operations stay blocked until a typed operation/account/target adapter exists.
The provider-specific domain verification operation is also a write, despite its
name. Internal configuration/memory tools stay blocked until their direct-execute
scope contracts are qualified separately; existing authenticated owner CRUD remains.

| Tool | Decision |
|---|---|
| `agentphone` | B — intentionally BLOCKED |
| `artifacts` | B — intentionally BLOCKED |
| `assign_skill` | B — intentionally BLOCKED |
| `attach_own_card` | B — intentionally BLOCKED |
| `check_email_domain` | B — intentionally BLOCKED |
| `computer` | B — intentionally BLOCKED |
| `connect_card` | B — intentionally BLOCKED |
| `connect_email_domain` | B — intentionally BLOCKED |
| `create_skill` | B — intentionally BLOCKED |
| `delete_skill` | B — intentionally BLOCKED |
| `forget` | B — intentionally BLOCKED |
| `fund_agentcard_wallet` | B — intentionally BLOCKED |
| `imessage` | B — intentionally BLOCKED |
| `label_email` | B — intentionally BLOCKED |
| `local_computer_task` | B — intentionally BLOCKED |
| `manage_agent` | B — intentionally BLOCKED |
| `record_agentcard_consent` | B — intentionally BLOCKED |
| `record_computer_artifact` | B — intentionally BLOCKED |
| `remember` | B — intentionally BLOCKED |
| `remove_email_domain` | B — intentionally BLOCKED |
| `render_video` | B — intentionally BLOCKED |
| `reply_to_email` | B — intentionally BLOCKED |
| `send_attachment` | B — intentionally BLOCKED |
| `share_file` | B — intentionally BLOCKED |
| `start_agentcard_phone_verification` | B — intentionally BLOCKED |
| `unassign_skill` | B — intentionally BLOCKED |
| `verify_agentcard_phone` | B — intentionally BLOCKED |
| `verify_card_code` | B — intentionally BLOCKED |

### Handles, approval and revocation

A handle binds Action ID/authority ID, executor, target, payload and a 30-second
expiry. Consumption removes it before awaiting fresh DB/policy validation, so two
consumers cannot both execute. Agent status/revision, approval, Run budget/deadline,
routine version/lease and Computer controller are checked again at consumption.
There is no distributed atomic transaction with the provider: revocation after the
last successful check cannot recall a request already entering transmission.
Uncertainty is retained; no rollback or automatic resend is claimed.

Active exact bindings are unique across tool-call IDs. A new model call ID cannot
resend an unresolved Action. Canonical approval creation uses stable Action/attempt
request keys; expired approvals get a new generation. Database CAS still controls
transmission independently of the card or process-local handle.

### Recovery contract and UI

`ActionRecovery` has a read-only provider-neutral inspection contract and a
renewable-by-reclaim 60-second inspection lease/token. Concurrent inspectors cannot
both complete it. Active executing/verifying workers have a two-minute grace period;
stale worker recovery never invokes the executor.

- Proven succeeded → COMPLETED, preserve provider evidence, no additional write.
- Proven not executed → RETRYABLE, invalidate exact-action approval; subsequent
  invocation requires current authority and any new approval.
- Missing/ambiguous/unavailable evidence → NEEDS YOU; no resend.

Recovery receipts record original Action/attempt, strategy, evidence/outcome, and
`anotherExecutionOccurred: false`. Existing email ID/account/thread inspection and
existing-sandbox checksum inspection are supported. A missing ID, 404, lost sandbox
or checksum mismatch is not proof of non-execution. These production strategies
therefore never infer RETRYABLE from absence. Fake authoritative provider evidence
qualifies the retry state machine. Browser business-effect reconciliation remains
manual; Recover truthfully returns Needs You for unsupported strategies.

Control Center exposes Recover and progressive disclosure for authority, approval,
attempt, result, receipt, history and recovery. Retry is distinct: only a proven
non-execution shows retry eligibility and instructions to resubmit through current
authority. There is deliberately no blind resend button or stored raw-payload replay.
Loading, empty, error, approval, completion, retry-eligible and Needs You states were
exercised using the actual component/Kumo controls with an offline browser fixture.
`scripts/qualification-recovery-ui.mjs` reproduces that fixture; no app/Agent runtime
or provider credentials are loaded.

### Routine reachability and reliability

`ROUTINE_RELEASE.enabled` remains false, with no environment escape hatch. The
current proposed graph is the finite `ROUTINE_READ_TOOLS` map: web_fetch, web_search,
list_goals, search_knowledge, search_owner_knowledge. Dynamic policy denies other
known tools for signed occurrences. workflow/delegation, load_skill expansion,
connection discovery and browser tools are not routine grants. Global lower-level
write blocks remain in place even if a model requests them directly. Roles, Skills,
models and instructions cannot expand this graph or standing manifest.

Preflight checks active/version/claim/Agent, capability dependencies, manifest and
budget before model invocation. Unique occurrences, renewable claims, heartbeat,
attempt/backoff limits, unknown-result recovery, automatic pause and one owner
notice remain qualified. Resume checks authority and skips stale queued backlog.
Missed policy supports SKIP, RUN_LATEST (existing conservative default) and
CATCH_UP_BOUNDED (at most three recent periods, hard maximum five in planner).
Delivery denial/failure preserves completed work and never reruns it.

### Database rollout constraint

0026 was assigned after inspecting migrations through 0025. Fresh and populated
0025→0026 simulations use only disposable local PostgreSQL. The new live-binding
unique index intentionally refuses pre-existing duplicate live bindings. Before
any separately authorized shared rollout, duplicates must be inspected and
reconciled; migration must not silently cancel a potentially transmitted Action.
No shared/production migration or live-provider qualification occurred.

### Remaining product limitations (explicit, not unknown executors)

External channel replies, native connector writes, Phone, persistent Orgo profiles,
owner remote input and provider teardown remain unavailable by design. Provider
shutdown may require owner/provider management; local revocation prevents further
Agent actions but does not claim remote resource deletion. No Relay federation,
persistent-profile expansion, automatic Routine activation or generic resend API
was introduced. Full real-provider/runtime acceptance remains outstanding and would
require separate authorization for billable/external resources.

Final qualification results and rollout limitations: [completion report](action-gateway-qualification-report.md).
