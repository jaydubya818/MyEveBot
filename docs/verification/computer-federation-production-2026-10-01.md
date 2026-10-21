# Approved Computer/federation production rollout — October 1, 2026 UTC

## Latest qualification — approved compatibility candidate

**Deployment PASS; full qualification FAIL/BLOCKED by a newly observed task-binding compatibility defect.** These results supersede the initial rollout status below. The historical record remains intact.

- Explicitly approved candidate `2ce3c2d2a3b7874377184d63687a406eb3a9bd06` deployed through the canonical scoped Vercel production process from an exact clean source snapshot.
- Deployment `dpl_AiYwttfVFRq6SSPcoM3dVHJt1XSp`, READY, immutable URL https://sofie-personal-agent-r3n13stnq-jaydubya818.vercel.app.
- At `2026-10-01T04:40:30Z`, production alias still resolved to that SHA; Sofie and Relay health both HTTP 200 / ready. See [final deployment receipt](computer-federation-production-2026-10-01/sofie-compatibility-final-receipt.json).
- Remote main was fetched before deployment and remained `fc5ed14a893a690b341666e18e88884cc7bf4779` at the final check. Prior Computer base `fff8feef84ccfa8e43c81201653dab08182adacd` is its ancestor. A merge-tree reconciliation with the candidate was conflict-free (`cdbdd09e20c697ede9ecbdbb6d02cf9e51d37f78`). Candidate changes do not modify Factory admission/execution source. No canonical merge, main push, history rewrite or new branch was performed because the qualification gate failed.
- Real-Factory approval and approved-Work production settings remained absent. The isolated Private Alpha admission deployment, repair and execution ownership were not changed.

| Check | Status | Evidence and limits |
| --- | --- | --- |
| Production deployment | PASS | Exact approved candidate, READY, alias/source verified |
| Mac pairing | PASS | Existing device `mac-998df73639154e45`; authenticated ready heartbeat after companion restart |
| Mac read | PASS — retained | Prior original-prompt discovery/read and post-restart checksum evidence below; new requested sequence not reached |
| Mac shell | PASS — retained | Prior approved `pwd` succeeded; the fresh Calculator launch was correctly blocked by expired execution context and did not execute |
| Mac screenshot | PASS — fresh | Two approved captures, actual images inspected; jobs `c7f5a871-e5ee-4705-ab91-4f3d961abe0e` and `9a8e0800-fdc3-46d5-a5ae-e86f4d387706` |
| Desktop observation | PASS — fresh | Sofie identified the actual foreground apps from both images |
| Mac desktop interaction | FAIL — not fully qualified | One approved Escape dispatched, but intended menu dismissal was not verified; Calculator click sequence blocked before shell launch |
| Desktop approval/cancellation | PASS — retained negative boundary | Prior Cmd+w cancellation remains valid; fresh expired shell action has zero attempts/jobs, not a new cancellation pass |
| Mac restart persistence | FAIL — requested fresh crash sequence incomplete | Earlier crash recovery passed. Fresh clean service restart preserved pairing and both permissions; post-permission crash/reconnect/read sequence not reached |
| Completed-task continuation | FAIL — concrete compatibility defect | `start_task` failed against an existing current session binding; full completion → second owner request sequence not reached |
| Follow-up composer | PASS for draft/send; full requested path BLOCKED | Same-chat drafts remained present and multiple follow-ups submitted, including after a large screenshot result. Post-completed-task follow-up remains unqualified |
| Alpha federation | PASS — retained | Authenticated correlated Alpha reply and two readbacks below; transport-format caveat retained; adapter unchanged |
| Generic federation | PASS — retained bounded qualification | Registered-peer contract/discovery and Alpha example only; no Muse/GrokBots or unidentified peer claim |
| MyFactory intake/readback | PASS — retained | Existing signed intake/readback evidence only; no new intake or execution |
| MyFactory execution | DEFERRED_TO_PRIVATE_ALPHA_EXECUTION_OWNER | This workstream did not repair, rerun, resume or bypass the owned admission/execution path |
| README/docs | PASS | Current results, remaining gates and ownership explicit |

### macOS and browser evidence

Accessibility and Screen Recording are enabled for the installed `Sofie Local.app` at `/Users/jaywest/Library/Application Support/Sofie Local/Sofie Local.app` (bundle `com.myeve.sofie-local`). The owner completed macOS authentication directly. No unrelated terminal/shell/helper permission was granted by this workstream. After `local:service restart`, status at `2026-10-01T04:40:07.883Z` reported installed/loaded/connectionReady/desktopReady/screenshotReady/ready all true, worker PID 11074, parent 11070, Accessibility and Screen Recording true. This is clean restart evidence; it is not a fresh crash test.

Live owner chat `wrun_41M3TV4TCX0GWZ0KDVSST9W6HC` accepted several follow-ups with screenshot results in its history. A typed draft was checked across an independent operation and remained present before Send. The earlier disappearing-draft symptom was not reproduced on the candidate. Browser quota itself was not measured; the controlled storage-failure tests remain the causal regression evidence.

Escape job `3d78ed66-1d31-43a7-a2b6-71b8dc2fb12f` dispatched once. The test menu was in a background System Settings window, while the actual foreground was elsewhere. A later screenshot could not establish the intended menu dismissal. This is intentionally not counted as verified desktop interaction.

### New concrete stop: durable task creation collides with current conversation binding

The Calculator shell request (`open -a Calculator`) was submitted at approximately 04:34 UTC. Approval processing occurred after its execution run's 04:37 UTC deadline. The run expiry correctly fenced execution. Sofie then called `start_task` to establish a fresh bounded task, but received `duplicate key value violates unique constraint "task_run_sessions_current"`.

Read-only production metadata confirms:

- current binding: `action_run_dd4f0139-c978-49d5-b424-16040ef7c068`, `awaiting_approval`, deadline `2026-10-01T04:37:00.207528Z`;
- shell Action `action_1b8c060e-df4f-4fb6-9ebb-93db89b28636`: `awaiting_approval`, pending approval, **zero attempts and zero jobs**;
- no new durable task replaced the existing binding;
- source `createDelegatedTask` inserts a new `task_run_sessions` row with default `is_current=true` without reconciling the already-current binding; the partial unique index correctly rejects it.

See the [sanitized run/action/job receipt](computer-federation-production-2026-10-01/sofie-compatibility-task-binding-receipt.json) and [live browser failure](computer-federation-production-2026-10-01/sofie-compatibility-expired-task-binding.png). No production database rows, approvals, deadlines, budgets or session bindings were manually edited to force a pass.

The next compatibility repair must make starting a durable task in an existing owner chat an atomic, owner/agent-scoped transition while preserving historical authority, pending-action fencing, budget limits and the completed-task follow-up contract. It needs focused transaction/concurrency tests and a new qualified candidate. No such runtime change is included in this evidence-only update. The workstream stops at this concrete defect under the owner's instruction; it is not frozen as successfully qualified.

## Historical initial rollout

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
