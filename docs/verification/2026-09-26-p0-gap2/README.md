# P0 Gap #2 — conversation budget and fresh-chat recovery

**Latest live checkpoint:** [60-minute isolated qualification](../2026-09-26-m1er1-window/README.md) reached real failure and autonomous repair, then common-budget denial before resubmission. Additional spend $0.777654; temporary authority revoked. Fresh native Run parity fails; M1/ER1 NOT QUALIFIED, ER2 BLOCKED. The earlier record below is historical.

**PARTIAL. Implementation and isolated qualification pass. The positive authenticated Sofie journey is NOT_RUN. M1/ER1 remains NOT QUALIFIED; ER2 remains BLOCKED.**

The owner explicitly approved the additive [conversation-budget proposal](../2026-09-26-authenticated-sofie-native/conversation-budget-proposal.md). Work began at `d8efe978e36494873e81ee9c3ea6294d0838f930` on `codex/digital-worker-mvp`. No remote publication, PR, production migration/deployment, Relay or MyFactory action occurred.

## Changes and boundaries

Migration 0051 adds only the two proposed tables. The selected-Work model wrapper now reserves durable conversation spend before every provider dispatch, including admission and read-only recovery. It retains completed responses before exposing them, fences unknown usage and process loss, and checks the frozen Work/criteria/generation/Agent/configuration binding again before dispatch. Existing native spend, reservations and request counts are carried forward once. Conversation total includes native execution; its independently enforced subtotal is never added again.

The owner UI defaults to read-only recovery. An explicit productive selection supplies authenticated current-turn intent; it is not a writer grant. Observation advertises only inspect and rejects write/admit output. The authored tool independently rejects mutations without current productive intent. Productive calls still use the unchanged native model ledger, native admission, writer session, Action Gateway and exact candidate checks. A fresh observer cannot take over another writer.

The shared Work projection, context and UI expose the extra accounting. The Work panel is height-bounded and scrollable on mobile. Browser testing also found a pre-existing Eve integration mismatch: conversation metadata labels the channel `channel:eve`, while the current adapter is `http`. Context assembly now supplies `ctx.channel.kind` to the existing HTTP-only binding check, with a child-channel regression. No owner/thread/mode/role check was removed. Dynamic model-selection errors throw in the installed Eve runtime; they do not fall back to an ordinary model.

Changes span persistence, model admission, authenticated intent/tool boundaries and shared UI because those surfaces must agree. Tests, inventory fingerprints and evidence accompany them; no new execution architecture was introduced.

## Required report

PASS below means the stated local component/integration scope, not an unrun model journey.

| Gate | Result | Evidence scope |
| --- | --- | --- |
| P0 GAP #2 | PARTIAL | Live positive gate remains open |
| MIGRATION 0051 | PASS | Fresh chain, populated 0050 upgrade, transactional rollback, exact rerun, actual isolated role |
| PRE-MODEL BUDGET ADMISSION | PASS | Durable reserve precedes dispatch; denied budget dispatches zero calls |
| CONCURRENT BUDGET SAFETY | PASS | Real PostgreSQL final-allowance race; one reservation wins |
| PROCESS-LOSS ACCOUNTING | PASS | Actual wrapper in child process; SIGKILL before dispatch, after dispatch, after retained response |
| FRESH-CHAT READ-ONLY RECOVERY | PASS | Scoped projection/tool and controlled-model tests; no writer acquired; live explanation not run |
| READ-ONLY → PRODUCTIVE TRANSITION | PASS | Existing admission and native writer service transition, auth intent/tool tests; live transition not run |
| WRITER CUSTODY | PASS | Current writer persists; foreign/stale/unknown sessions denied |
| AUTHENTICATED SOFIE JOURNEY | NOT_RUN | Real owner UI/session and context receipt reached wrapper; expired qualification stops model dispatch |

## Verification

- Application: **1,315 passed, 40 skipped**, 171 files (168 passed, three skipped).
- Root authentication/security: **151 passed**.
- Focused new model/tool tests: 19 passed; transport-binding tests: five passed.
- PostgreSQL: conversation budget, native host, protected verifier, direct development, Knowledge, context receipt and route admission pass. Knowledge/context scripts intentionally succeed silently.
- TypeScript, capability registry (147 definitions / 125 tools), skill routing (93 checks), executor governance (634 classified, UNKNOWN=0), 51 ordered migrations and final webpack production build pass. Existing noVNC/dependency build warnings remain in the build log.
- Historical migrations 0001–0050 and native model/budget/routing/Action Gateway sources match the starting commit byte-for-byte; see source manifest.

Commands and outputs: [test-results.json](test-results.json), [logs](logs), [SQL](sql-results.json), [traceability](traceability.md).

## Authenticated browser observation

The existing real owner session at localhost:3108 was reused; no synthetic authentication bypass was installed. The app used the exact approved isolated PostgreSQL fixture through a loopback SQL proxy. External fetches were disabled and no model credentials loaded. A fresh UI conversation selected the approved Work and defaulted to read-only; the productive selection could be requested and returned to read-only. Reload cleared the selection as documented.

The initial context guard refused the conversation-label mismatch. After correcting the adapter input, the real Eve path persisted the selected Work v2 context receipt with exactly the two active approved facts (current convention and prior decision). The superseded fact and unrelated canary are absent. It then reached the new wrapper and failed closed: **“Native provider qualification is unavailable or expired. No model call was dispatched.”** See [refusal](logs/authenticated-refusal.log).

Desktop and 390×844 screenshots show the new access controls and failure state; width and scroll width were both 390. These are not candidate/Result qualification screenshots. [Desktop](browser/desktop.png), [mobile](browser/mobile.png). The test tab and isolated app were stopped afterward; PostgreSQL remains available.

## Spend and safety

Additional model spend: **$0.000000 of $1.313161 authorized**. Previous historical accounting remains $0.686839. Approved Work ceiling stays $1.30; qualification expiry stays `2026-09-26T22:12:51.199Z`. Exact five-file source and runtime fixture configuration remain unchanged. The approved fixture has zero conversation/native model rows, writer rows, routing decisions, candidates and Results; Work remains v2/generation2.

Observed violations in the bounded tests: **unbudgeted selected-Work calls 0; authority bypasses 0; duplicate consequential effects 0; lost candidates after custody 0; stale-writer authoritative updates 0; expired-authority revivals 0; false Ready states 0.** The positive authenticated journey has not supplied evidence for these claims. Controlled-provider calls in process tests do not incur model spend. No source was manually edited between autonomous failure and repair because that live sequence was not started.

Local native verification continues to produce PARTIAL only. No READY_FOR_REVIEW promotion is enabled by this change.

## Remaining Q37 gate

A fresh, explicitly approved isolated provider qualification is needed before the existing authenticated failure → repair → verification → recovery sequence can run. The exact request is [provider-qualification-approval.md](provider-qualification-approval.md). Payload consent remains valid and is not requested again. Then qualify live read-only recovery, explicit read→productive transition, behavior, all restart cases and desktop/mobile Result states. Do not start ER2, Q38 or Q39.

Automatic approval review rejected a combined command that would have issued a new one-hour provider qualification, because fixture authority must not be silently renewed. That command made no changes. A subsequent migration-only command was approved and applied 0051 to the exact local fixture. An earlier proposed removal of a TypeScript-incompatible parent check was also rejected; the check was retained using a type-safe property existence check. Neither rejection was bypassed.
