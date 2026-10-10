# Checkpoint H — authenticated Sofie enterprise experience

Accepted bases: MissionControl `74ccd15b5693a96f74e558eb4882f1849c4cd741`, MyEve `9f1c83b0989abaedc168b740ddcf57582cf15a92`, MyFactory `e498c31db8b749fa91b0544ecd1d1a661b971c2c`. Original commits and execution/accounting evidence remain preserved. This branch does not alter MissionControl execution engineering.

## Authenticated conversation boundary

The preserved MyEve browser sent `/eve/v1/session` while the first owner-authorized thread PUT was still pending. The canonical binding function found no persisted row, rejected the binding, and later replay routes rejected the unowned session. A deterministic browser reproduction delays the actual PUT and observes the original failure; no session cookie or owner role is fabricated.

Chat now awaits a successful thread save before sending or retrying. Non-success and network failures prevent execution and preserve the draft. The existing owner conflict quarantine remains intact. Drafts also use existing owner-partitioned browser storage so server reconciliation cannot erase input during hydration. The backend ownership and Agent binding checks remain unchanged.

## Enterprise presentation

Structured `mission_control` tool responses render a proposal, plan/workstreams, draft-only scope, Needs You, Mission creation/status, WorkOrders, and Result/Proof. Shared pure protocol schemas are separated from server-only signing code. Assistant narrative never supplies status. Result observations expire visibly; refresh requests a new canonical tool observation in the same conversation. No UI code signs commands, mints owner credentials, authorizes a draft, dispatches WorkOrders or accepts Missions.

MyEve password authentication and MissionControl Clerk authentication are separate. The approved service contract can propose, submit an owner-authorized draft, read status and consume exact Result evidence. It cannot authorize proposals or accept Missions. Selection of the linked existing owner UI versus a new federated owner-login bridge is pending the Product Owner's answer. No bridge is invented in this checkpoint.

## Qualification

- `apps/eve/test/browser/authenticated-binding.mjs <root> <output>` uses a disposable PostgreSQL database, real password login, delayed persistence, durable Agent binding, same-session reconnect/follow-up, and failed-save draft retention.
- `prepare-enterprise.mjs` records source hashes and overlays deterministic model output, loopback PostgreSQL transport, and a fixture-only runtime connection configuration file in a disposable source copy.
- `missioncontrol-consumer.integration.mjs` uses exact MC74 with the actual tool and Action Gateway. With `MYEVE_CHECKPOINT_H_BROWSER=1`, the browser asks “Build an Agentic HR platform,” displays the real canonical proposal, reloads and follows up. Subsequent owner authorization and Mission creation remain API fixtures, explicitly not browser qualification.
- `checkpoint-h-result.mjs` uses the unchanged native/delegated hybrid path and exact MyFactory. The real password-authenticated browser stays open before evidence is produced, initially using a canonical draft-only connection. An isolated source-copy adapter then reads the new canonical Result connection from a task-owned mode-0600 configuration file. The original server signing and owner validation remain in place; this adapter exists only in the disposable test copy, and cleanup removes the configuration file. It reports NOT_RUN when the locked runtime package is absent. It never rebuilds a substitute or extends evidence lifetime.
- `.github/workflows/checkpoint-h.yml` is advisory and preserves evidence. Green jobs with a NOT_RUN Result suite are not full PASS.

Local qualification details and exact final SHA evidence are retained in the workspace Checkpoint H report. Historical failures remain retained, including the initial reproduction, early reload timing failure and correctly unavailable expired Result. The full owner-created cross-system journey is not established by these separate component checks.

Release gate: ADVISORY. Independent Claude review is required before promotion; unauthenticated Claude is NOT_RUN. No production deployment, paid model operations, executable production grants, external-alpha modifications, dependency merges or publication.
