# Authenticated Sofie native qualification — incomplete

**M1/ER1 NOT QUALIFIED. ER2 BLOCKED. GitHub publication BLOCKED.**

**Latest continuation:** P0 Gap #2 implementation is approved and implemented with migration 0051 and passing isolated tests. [Current evidence](../2026-09-26-p0-gap2/README.md) is PARTIAL: the real owner chat reaches the new guarded model wrapper, but its provider qualification is expired. New model spend is $0; the positive journey remains NOT_RUN. Earlier sections below preserve the preceding checkpoint.

This tranche starts at `3dfee3e130d610570ebda56ec98c3dba6136abee` on `codex/digital-worker-mvp`. Prior [native-host qualification](../2026-09-26-native-host/README.md) is preserved and is not represented as a new authenticated journey. No provider call or publication occurred in this tranche.

## Implemented and checked

- Selected Work context now uses the shared native Current Truth projection, including candidate, immutable proof and model accounting. Native admission no longer appears as “no Work Contract.”
- Authored `engineering_direct inspect` reads the same projection used by Work UI and returns active Work-scoped Knowledge with provenance. Selected Work avoids owner-wide Memory, unrelated thread summaries, generic Knowledge providers and unrelated goal/task context.
- Native routing records Software Engineer v1, JStack v1 and normal/potato mode v1. The inspect response supplies corresponding behavior guidance; none of these grants authority.
- Local verified native Results explicitly remain PARTIAL. New assertions reject proof retention without independent checks and reject Ready after a successful local result.
- Existing budget, session writer, gateway, provider-qualification and immutable-result boundaries remain unchanged. No migration was added.

The change spans context assembly, the authored tool, routing composition and shared projection because those are the four surfaces that must agree. Tests, executor fingerprints and this evidence record accompany them. No excluded milestone was implemented.

## Fresh checks

| Check | Result |
| --- | --- |
| App suite | PASS — 1,296 passed, 40 skipped; 169 files (166 passed, 3 skipped) |
| Root suite | PASS — 151 passed |
| Final context/behavior tests | PASS — 12 passed after the final context wording change |
| PostgreSQL integrations | PASS — native host, route admission, direct development, verifier recovery, Knowledge |
| Migrations | PASS — 50 ordered; no new number |
| Typecheck / capability registry | PASS — 147 definitions, 125 authored tools |
| Skill routing | PASS — 93 checks; 50/57 rank one (87.7%) |
| Executor governance | PASS — 632 classified sources; UNKNOWN=0 |
| Final production webpack build | PASS, with existing dependency warnings retained in log |
| Authenticated offline UI | PASS for login, saved Work, selection/navigation and no overflow at 390px |
| Authenticated model journey | **FAIL — NOT RUN**, external model transmission blocked |

See [exact test records](test-results.json), [SQL observations](sql-results.json), [browser/restart evidence](browser-and-restarts.md), [chat status](authenticated-chat.md), [Role/Pack/mode and context evidence](behavior-and-context.md), and [remaining blockers](limitations-and-next.md).

## Requested qualification matrix

FAIL here includes a required gate that was not run; it is not a fabricated runtime failure.

| Gate | PASS / FAIL | Evidence boundary |
| --- | --- | --- |
| AUTHENTICATED SOFIE NATIVE JOURNEY | FAIL | No real authenticated model/tool journey |
| WORK ↔ CHAT PARITY | FAIL | Shared read path implemented; Sofie explanations unobserved |
| CURRENT TRUTH | PASS | Shared projection and local regression/UI state; no live conversational claim |
| SOFTWARE ENGINEER ROLE | FAIL | Version/guidance wired; live behavior not observed |
| JSTACK | FAIL | Version/context wired; live application not observed |
| /POTATO-MODE | FAIL | Contract authority comparison passes; initiative comparison not run |
| CONTEXT / RETRIEVAL | FAIL | Scoped store/unit coverage passes; through-Sofie retrieval not run |
| NATIVE ROUTE | PASS | Fresh isolated service admission/denial regressions; chat admission unqualified |
| CANDIDATE CUSTODY | PASS | Fresh isolated service/process regressions; no new chat candidate |
| PROTECTED VERIFICATION | PASS | Fresh local verifier/reconciliation regressions; not a new live repository journey |
| RESTART CONTINUITY | FAIL | Offline app and host process tests pass; authenticated conversational recovery incomplete |
| DESKTOP UI | FAIL | Login/navigation pass; required live candidate/result states not reached |
| MOBILE WEB | FAIL | 390px navigation/no-overflow pass; required live result/recovery states not reached |

Observed regression violations: **False Ready 0; authority bypasses 0; duplicate consequential effects 0; lost candidates after custody 0; stale-writer authoritative updates 0.** These are bounded test observations, not proof of an unrun authenticated journey. The new authenticated fixture has zero model calls, candidates and Results.

## Release decision

- **M1/ER1: NOT QUALIFIED.** Finish budgeted pre-admission conversation and read-only fresh-session recovery design, then run the required real journey and comparisons.
- **ER2 Deep Agents: BLOCKED** by the native authenticated gate. [Deferred gap checklist](remaining-er2-gaps.md); no new spike inspection or promotion.
- **GitHub publication: BLOCKED** — intended publisher Keychain item absent (status 44), App/installation identity and credential must be installed and qualified. Personal CLI credentials were used only for read-only fixture inspection.
- **Next bounded work:** close the two chat/budget continuity gaps without relaxing execution custody; obtain explicit external-payload approval; execute and capture the real authenticated native journey within the remaining budget. No Strong MVP, Q37, managed beta or production readiness claim.
