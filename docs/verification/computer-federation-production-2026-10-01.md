# Approved Computer/federation production rollout — October 1, 2026 UTC

**Exact approved runtime deployed. Full Computer qualification is incomplete.** This supersedes the pending deployment gate in the [earlier continuation](computer-federation-continuation-2026-09-30.md), while preserving its historical results and limitations.

## Production identity and ownership

- Approved and deployed source: `fff8feef84ccfa8e43c81201653dab08182adacd`.
- Vercel deployment: `dpl_DjiW59cXWYfNiJkbtmHrtoGtjuJb`, READY.
- Production: https://sofie-personal-agent.vercel.app
- Immutable deployment: https://sofie-personal-agent-o6pkt76c1-jaydubya818.vercel.app
- Alias/source confirmed at `2026-10-01T01:04:18Z`. Sofie `/eve/v1/health` and Relay `/api/health` both returned HTTP 200 and ready database/runtime status.
- Remote main had advanced to `63cd10fe45c1d0a139c72bdd7c665b1362e1e69b`. The approved SHA remained its ancestor. The advancement was the separate Factory admission-proposal guidance repair; no Computer/federation contract or migration changed. Its isolated deployment and execution settings were preserved. This release used an exact clean snapshot of the approved SHA, not the newer main.
- Existing migration 0077 and prepared five Computer scopes were retained. Real-Factory approval/approved-Work production settings remained absent. No real Factory execution, retry, admission repair, custody or Result was attempted here.

## Fresh production results

| Requested check | Result | Evidence / limit |
| --- | --- | --- |
| Production deployment | PASS | Exact source and READY alias in [receipts](computer-federation-production-2026-10-01/production-receipts.json) |
| Sofie / Relay health | PASS | HTTP 200 ready responses |
| Authenticated chat | PASS | Normal owner browser, GPT-6.1 Sol; original prompt completed |
| Mac pairing | PASS | Existing device `mac-998df73639154e45`, authenticated heartbeats before and after rollout/restart |
| Mac read | PASS | Exact original prompt `hello sol, can you review my read.me and tell me about this app`; discovery and read completed without path or repeated consent request |
| Mac shell | PASS | Exact `pwd` approval, one dispatch, exit 0; `/Users/jaywest` |
| Mac screenshot | FAIL — WAITING_FOR_OS_INTERACTION | Persistent app Screen Recording false; no fresh screenshot claimed |
| Mac desktop | FAIL — WAITING_FOR_OS_INTERACTION | Persistent app Accessibility false; observation/positive interaction not qualified |
| Desktop approval boundary | PASS | Exact Cmd+w proposal cancelled; denied approval, zero attempts/jobs. Action row remains awaiting_approval; it is not reported as a completed action |
| Mac restart persistence | PASS | Verified worker SIGKILL 11101 → launchd recovery 48331; clean service restart → 49976; authenticated heartbeat and new actual read after restart. Actual logout/login not tested |
| Completed-task continuation | FAIL — CURRENT_BROWSER_BLOCKER | Prior live backend PASS retained, but fresh follow-up composer repeatedly remounted and discarded input. New tracked-task prompt could not be submitted; do not relabel prior evidence as a fresh pass |
| Alpha federation | PASS, with response-format caveat | One approved send, authenticated correlated answer `ORION-7`, two identical readbacks. Alpha omitted optional marker OCT1-COMPUTER; exact requested reply formatting failed |
| Generic federation | PASS for discovery/contract and Alpha example | Registered peer identity, capability version 1.0, outbound support and exact active grant checked. This is not a claim for arbitrary peers, Muse/GrokBots, a second MyEve installation or delegated Work |
| MyFactory intake/readback | PASS | Existing request read twice; same verified received_by_factory / queued receipt, no new intake or execution |
| MyFactory execution | DEFERRED_TO_PRIVATE_ALPHA_EXECUTION_OWNER | Live execution remains FAIL/BLOCKED; custody/verification/Result/Proof not reached |
| README/docs | PASS | Component roles, authority boundaries, live results and remaining gates explicit |

README read checksum matched the Mac file: `b06d65982097a6afda0df43faa15aac00b350ed3471afe2be145988bb5b5bf46`. Original read session: `wrun_41M3TFXDJX0GMD8E6TSZG4XKGW`. Find/read jobs: `30e2d030-f1a7-4251-a52a-0293140f3a08`, `b03a2739-f376-4ddd-9eb1-661ab5d9f6c6`. The read after restart returned the same hash. The primary checkout and its independently edited README were not overwritten.

Shell Action `action_9608a1f9-93ee-4985-aabc-7afb0b6ac986` has one approved attempt/job. Desktop negative Action `action_4904c8e8-0a03-4669-a7c9-b034c46daa42` has a denied approval and no job.

Alpha request `frq_bec2e5dd7895490a91b3876833fee54a` was read by Actions `action_3b99fe66-686a-4854-b75f-9cad6de244ae` and `action_5eb443ee-3acf-468f-a231-75bf62ed16d4`. The grant was still active until October 3; no grant was renewed or expanded. MyFactory request `ee32a8c7-3243-4332-a602-0ad6d678bc1b` / MYE-14 retained WorkOrder `98e4dd04-d11c-46d1-ad15-f04d6f201034`, queued. Read Actions `action_2f581cd7-f657-4771-b0e0-755d46ef8171` and `action_92b13727-1fc8-48c4-a80f-416f3ff065bc` returned the same signed receipt.

## Owner interaction still required

Only the exact Sofie Local Accessibility switch was selected. macOS displayed a Touch ID/password sheet, where automation stopped. The owner was asked to authenticate directly in System Settings. No password was collected, no permission has yet changed, and no unrelated node/terminal/helper entry was enabled. After that interaction, Screen Recording must be enabled for the same app, followed by restart and actual screenshot/observation/harmless interaction tests. The installed background companion still honestly reports overall ready=false.

## Concrete compatibility defect and prepared candidate

Fresh chats execute correctly, but completed-response follow-up text disappeared as the composer repeatedly remounted; a reload also restored an older locally saved chat. Production's browser storage quota was not directly inspected. Code analysis and controlled quota-failure regressions reproduce loss of current chat state: failed browser writes are discarded, while recovery repeatedly loads/remounts the server copy. Storage failure is the supported working diagnosis, not a directly measured production quota result.

A narrow candidate repair retains failed writes in owner-namespaced current-page memory. Native persistence is preferred whenever it succeeds. Fallback is cleared on owner change or logout, remains separate for local/session storage, and grants no server authority. No chat history or browser cache is deleted. It does not change Computer approvals or Factory admission/execution.

Three initial regression cases failed before the repair. The final 72 relevant tests (storage, owner boundaries, chat/session sync, Computer selection and voice/thread), typecheck, capability/skill/executor governance and production webpack build pass. [Logs](computer-federation-production-2026-10-01/) retain the evidence. The candidate has not been deployed or live-qualified; a fresh completed-task follow-up remains required after its separately authorized deployment.

The exact-SHA approval was consumed only for the specified runtime. A different runtime needs explicit approval. This workstream makes no further production changes while those gates are pending; MyFactory execution remains with the Private Alpha execution owner. Resume only the recorded Computer compatibility defect and OS qualification, then freeze the completed workstream.
