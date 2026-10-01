# Computer and federation continuation — September 30, 2026

**Partial private-alpha qualification. Full real-provider production remains unqualified.** This record preserves the earlier [connection acceptance](connections-2026-09-30.md) and [Mac acceptance](local-mac-access-2026-09-30.md). Qualified integrated runtime source: `395bf55b99f73765bcc1f5b4a6545478fb4e65f1`, remotely verified on `codex/sofie-local-access`. Includes canonical handoff repair `b41b815` via main `3ad2113`. Canonical publication/deployment receipt follows separately; do not infer deployment from a Git commit.

## Implemented and locally qualified

- Native per-user launchd lifecycle, stable Sofie Local.app identity, macOS Keychain pairing, no token-bearing JSON/env file, authenticated health, clean stop, failure restart, process exclusion, durable no-replay journal, exact-pairing revocation and unpair.
- Separate canonical Computer read/write/shell/screenshot/desktop grants. Missing/malformed scopes fail closed. Exact owner approval and live dispatch checks remain mandatory for consequential operations. Browser remains its existing separately governed capability.
- Bounded generic Relay peer discovery with stable owner/agent/address, protocol versions and provenance. Unknown/ambiguous capability or identity cannot grant authority. Existing exact grants, expiry/revocation, recipient-owner Work policy, signed correlation and deduplication remain enforced.
- Plain-language tool activity; full payloads and technical names remain in expandable **Proof of Work / Advanced**. Receipt labels do not claim execution or verified Results.

## Verification

| Check | Outcome and limit |
| --- | --- |
| App suite | 2,017 passed; 22 optional tests skipped. Includes Computer real-worker SQL, 19 durable Relay budget checks and 20 owner continuation checks |
| Repository suite | 144 passed |
| Types / governance | PASS: 153 capability definitions, 126 authored tools, 736 classified sources; UNKNOWN=0 |
| Build | PASS with Next webpack. Turbopack rejects this worktree's shared dependency symlink; this is a local dependency-layout constraint |
| Persistent crash recovery | PASS: actual worker SIGKILL recovered through native launcher/launchd, authenticated heartbeat resumed with new worker and launcher PIDs |
| Clean stop / reinstallation | PASS: waits for launchd removal; metadata-only reinstall preserves Keychain and roots |
| Revocation | PASS isolated real worker/SQL: revoked pairing exits cleanly, retains revoked health, no further polls; queued/stale results blocked |
| Login | RunAtLoad entry installed; actual logout/login NOT_RUN |
| Desktop / 390px browser | PASS isolated real Eve/Next app with deterministic model and localhost-only transport; receipt label, expanded evidence, exact 390 CSS-pixel width (no horizontal overflow), keyboard Enter disclosure, reload persistence |
| Accessibility | Focused PASS: labeled composer/actions, keyboard-focusable disclosure and retained visible focus; not a whole-app WCAG audit |
| Canonical Factory connected qualification | 20 checks PASS using actual HTTP/SQLite/Git/PostgreSQL and independent Docker verifier, synthetic model/executor. Includes Gate B/C, single writer, UNKNOWN, cancellation, restart, custody, positive/negative verification and Result/explanation. **No real provider completion claimed** |

Evidence: [test/build logs, Factory summary and lifecycle receipt](computer-federation-continuation-2026-09-30/). Browser screenshots are explicitly local synthetic fixtures: [desktop](computer-federation-continuation-2026-09-30/desktop.png), [390px](computer-federation-continuation-2026-09-30/mobile.png), [expanded evidence](computer-federation-continuation-2026-09-30/mobile-evidence.png).

Two pre-existing database fixtures used a custom search_path incompatible with newer public-schema engineering migrations. They now use disposable isolated databases; no production migration was altered. The worker test now resolves its executable from the test file rather than the caller's working directory.

## Live state and pending gates

| Requested journey | State |
| --- | --- |
| Mac README read / same-chat follow-up | Prior live PASS preserved |
| Mac approved shell | Prior live PASS preserved; new lifecycle does not widen shell authority |
| Mac desktop / screenshot | Prior foreground/manual PASS; persistent background **WAITING_FOR_OS_PERMISSION**. Sofie Local is visible in Accessibility, off. Screen Recording also false. No privacy grant was changed |
| Companion overall Ready | FALSE until background desktop and screenshot permissions are qualified; connectionReady separately true |
| MyFactory intake / signed receipt | Prior live PASS preserved |
| Full real MyFactory execution → custody → protected verification → Result → Proof of Work | **FAIL / not reached** in the separate live qualification. First failed Work `a2dcadef-0738-4194-8b8c-02c16821b5fb` preserved. Second authorized Work `dd60ac6b-5718-4844-be97-39b88eadf6ce` returned a pre-admission blocker; no retry was initiated by this tranche. See the canonical live dossier for final accounting |
| Alpha question/answer | Prior actual round trip PASS, `frq_2d2f868fb6a943e3976dc924feb695fe`; one delivery and correlated answer. No new send needed to relabel prior proof |
| Generic peer contract | PASS local contract/negative tests; live Alpha acceptance is the connected external example |
| Second MyEve | WAITING. Orchis incoming grant does not authorize acting as her owner or prove reciprocal conversation |
| Federated bounded Work | Existing receiving-owner policy, bounded analysis/drafting and negative authority tests PASS locally; separate real peer Work execution NOT_RUN |
| Muse / GrokBots | WAITING_FOR_PEER_IDENTITY |

No deployment over the concurrent real-provider attempt was performed during this qualification. Migration 0077 was applied using the checksum-verifying runner, and explicit `SOFIE_LOCAL_CAPABILITIES` now preserves the owner-authorized five operation scopes. Neither broadens configured roots, macOS permissions or exact-action approval. Server activation still requires deployment of this source. The native lifecycle is installed locally; server code and local installation have separate activation evidence.

## Safety measurements

The connected synthetic Factory suite measures concurrent writers **0**, duplicate dispatches **0**, false Ready **0**, unauthenticated admissions **0**. Computer and federation negative tests assert denied unauthorized effects, owner isolation, exact scope/expiry/revocation and no repeated delivery; these are bounded test assertions, not an unmeasured global production count.

This tranche made **0 new real-model calls**, **0 peer authority expansions**, **0 macOS privacy permission changes**, and **0 new external peer sends**. Earlier accepted Alpha delivery is retained as historical evidence. Production-wide cross-owner disclosures, stale mutations and unauthorized Computer mutations are **not globally audited here** and are not fabricated as zero.

An early lifecycle status implementation could briefly report ready immediately after asynchronous stop. This defect was observed and repaired by waiting for launchd removal and checking a fresh heartbeat against the current worker/launcher PID. Overall readiness now also requires desktop/screenshot permission. Preserve that discovered defect; do not claim no false-ready observation ever occurred during development.

## Canonical publication preparation

Repository: `jaydubya818/MyEveBot`. Target: `main`. Source `395bf55b99f73765bcc1f5b4a6545478fb4e65f1` contains the connection runtime and preserved main handoff repair. The dirty primary checkout is untouched. The production Git integration points to main, so publication triggers the normal production build. Production has no real-Factory execution approval or approved Work binding; no model attempt is authorized by this deployment. The other chat's private journey deployment is separate.

The second live controller receipt is `STOPPED_BEFORE_RETRY` with reason “Sofie did not produce an admitted command.” Its Work/envelope are not reusable. The separate deployment chat owns its requested zero-model repair; this tranche did not send it messages or execute a third attempt.
