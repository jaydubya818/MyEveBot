# Sofie connection qualification — September 30, 2026

Status: PASS for the recorded Mac, chat-continuity, MyFactory intake/readback and Alpha round-trip paths. Named Muse/GrokBots connections and a second live MyEve installation remain unqualified.

| Path | Evidence | Status |
| --- | --- | --- |
| Real Mac read, shell approval, screenshot | [Earlier live record](local-mac-access-2026-09-30.md) | PASS for recorded operations |
| Follow-up after completed owner task | Same live chat completed a tracked task, then accepted the original README prompt and read the Mac | PASS |
| MyFactory hosted intake and signed readback | One MYE-14 request → one local WorkOrder → two matching verified Sofie readbacks | PASS for intake/readback |
| Relay peer messaging | Sofie → Relay → Alpha (Ollama) → Sofie, written answer and identical second readback | PASS |
| Second MyEve installation | Existing Orchis incoming relationship; no real cross-installation exchange in this acceptance run | NOT LIVE-QUALIFIED |
| Muse / GrokBots | Actual recipient addresses and deployments have not been supplied | BLOCKED ON PEER IDENTIFICATION |
| Deep Agents harness | Isolated historical SDK experiment, absent from this release | NOT PRODUCTION-QUALIFIED |

## Change boundaries

Migration 0076 permits fresh owner input after a successfully completed standalone tracked task. It retains the closed task and historical bindings, does not carry approvals into the new run, and leaves delegated/goal/role/scheduled and exhausted-budget recovery restricted. A tool retry cannot request this recovery. Simple README discovery/read/review no longer requires task/skill ceremony.

The dedicated `myfactory` feature enables only MyFactory intake/readback; existing `integrations` configurations retain compatibility. This does not enable coding, merge or publication, other connectors, or broad shell access for external peers.

Local checks: 89 focused Vitest cases for owner recovery, local instructions, MyFactory, Relay approval, permissions and bounded replies; 7 capability tests; 2 Alpha contract tests; 2 receipt-format/tampering tests; isolated PostgreSQL lifecycle and negative recovery checks. Type checking, capability validation (149 definitions / 126 authored tools), skill routing (93 checks), executor inventory (734 sources, zero unknown), migration manifest and production builds passed. Migration 0076 was applied through the production checksum runner.

## Live continuity

Session `wrun_41M3SYJ2W40GS906NA3MH2ZNHH` completed `task_e865f392-4a32-496d-b2aa-77c95ec903b3` after a read-only companion status check. The next owner message was exactly `hello sol, can you review my read.me and tell me about this app`. The same session moved its current execution binding to `action_run_7c3357a8-a167-4e6e-af3e-b08689dc4174`, retained the completed task as historical, and successfully used local file tools. This tests new requests after task completion; it does not revive a workflow that had already fatally terminated before the repair. [Browser proof](connections-2026-09-30/sofie-completed-task-followup-success.png).

## Live external peer round trip

The first bounded message was rejected because Alpha's installed receiver accepted only legacy `messages` resources while the sender used its canonical recipient address. Both versions already required Relay signature, audience, expiry and exact sender validation. The fixed receiver accepts its own canonical address and legacy `messages`, continuing to reject other resources, senders, targets and capabilities. Two focused contract tests pass. The existing installed Alpha service was updated and restarted; no new service or credential was installed.

A separately labeled test completed as `frq_2d2f868fb6a943e3976dc924feb695fe`, with one delivery attempt. Alpha's local model returned: “The public Orion test code is ORION-7.” Two persisted `federation_request` status results contain the same body, exact peer address and `replyTo` matching that request. The submission Action is `action_4accec5e-d499-42cd-98f9-b46749633745`. The first failed request was not replayed or disguised as a pass. [Browser proof](connections-2026-09-30/sofie-relay-roundtrip-success.png).

This is an external model-backed test peer. It is not evidence of a Muse, GrokBots or Orchis installation exchange. Muse/GrokBots identity and endpoints remain required; Orchis's existing incoming relationship still needs its real owner's message.

## MyFactory reconciliation

The first create action was denied at destination resolution, before mutation. The deterministic request `ee32a8c7-3243-4332-a602-0ad6d678bc1b` was independently queried through the existing host Linear connector and was absent. The old read adapter represented absence as an exception, which the generic Action gateway classified as unknown. The repair returns a verified `not_found` read result for an authenticated empty query and retries only the pre-admission destination read once. Mutation retries are unchanged; signature, network and destination failures do not become `not_found`. Seven MyFactory adapter tests pass.

The retry used the same deterministic ID and original parameters after the verified absence. It created `MYE-14`, and the local host admitted exactly one WorkOrder, `98e4dd04-d11c-46d1-ad15-f04d6f201034`, in `queued` state. A subsequent read failed because the host's current receipt includes `keyId` in its signed domain while Sofie's reader only understood the legacy format. The receipt verified independently with the host protocol and Sofie's existing pinned public key. The repaired reader derives the key identity from that pin and accepts both formats; it rejects altered key IDs, signatures, payloads, request bindings and ambiguous envelopes. No key was replaced and no signature check was bypassed. The original uncertain read remains recorded; no second create was sent.

After deployment `dpl_GXhSL7ooxnYeoYgjNkDG7udhhPPx` (source `3c07f9a`, production alias `https://sofie-personal-agent.vercel.app`), chat `5ae11fd7-4067-439f-98ca-eec249d1cc3a` read the same request twice. Actions `action_44c01712-f3aa-4725-8500-01f897a1c27e` and `action_66e59472-20b8-45fb-a90a-0d0de635810e` completed with identical `received_by_factory` receipts, the same WorkOrder ID and `queued` state. The local repository-scoped client independently returned exactly one matching WorkOrder, still queued. No coding, PR, merge or publication was started by this connection test. [Browser proof](connections-2026-09-30/sofie-myfactory-receipt-success.png).

## Operational boundaries

The Mac companion and MyFactory supervisor are currently manual processes. The Mac must stay awake and those processes must stay running; this qualification does not establish restart persistence. Alpha's existing service was restarted with the compatible receiver. Its current outgoing message grant expires October 3, 2026; this run did not renew grants or qualify an Alpha-initiated new conversation.

Production adds only `myfactory` to the existing feature set. Foreman is documented, but its broader `integrations` feature was not enabled or newly qualified here. Deep Agents remains absent from the production harness registry. A compatible external protocol test does not connect Muse or GrokBots automatically: their actual deployment identity, address, owner-authorized scope and live recipient remain required.
