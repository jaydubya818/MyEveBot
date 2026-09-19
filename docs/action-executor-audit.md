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

## Remaining qualification work

This is an incremental enforcement slice, **not qualification of all execution
paths**. `ROUTINE_EXECUTION_READY` remains hard false. Owner review remains required
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

## Local validation

- Production Next build passed after clearing a stale generated `.next` cache.
- TypeScript, capability registry (133 definitions), executor inventory (164
  sources), and imported-skill routing checks passed.
- Vitest: 409 tests passed across 65 files. Core Node suite: 130 passed.
- Disposable local PostgreSQL: all migrations including 0025 plus claim races,
  owner review/revocation, exact approval, changed account/recipient, expiry,
  provider-call denial, receipt recovery, computer control fences and notification
  denial tests passed. Fixtures use no real providers or shared database.
- Migration 0025 is prepared only. Nothing was deployed or migrated to production.
