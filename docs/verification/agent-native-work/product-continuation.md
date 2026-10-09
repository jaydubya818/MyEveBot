# Product continuation — 2026-10-02

Overall: **PARTIAL / NOT_READY**. This is a qualified Product source checkpoint on `codex/agent-native-work-experience`, following accepted `6b277d97300ea35e835a0d4bb2613d456632beb3`. It is not a deployment, merge or release of background Routines/Groups/CLOUD.

## Actual current dependencies

`WAITING_FOR_CANONICAL_Q37` is **STALE / RENAMED** as a blanket dependency. Current canonical main already provides accepted local Work, custody, verification, Result/Proof and owner publication contracts. See [exact source pins and dependencies](../../product/current-product-dependencies.md).

The execution owner explicitly confirmed **WAITING_FOR_CANONICAL_STAGING_COMPOSITION** for real Eve browser natural request → productive Work → Result. No qualified deterministic model/worker hook currently spans that endpoint. Hosted configuration/source loading, router admission, existing harness/model boundary, cloud custody/verification and authenticated browser composition remain missing. A static worker diagnostic does not satisfy this gate. **WAITING_FOR_CANONICAL_ENVIRONMENT_FABRIC** covers its remaining published-contract integration; **WAITING_FOR_CLOUD_EXECUTION_QUALIFICATION** covers the six live gates below. Groups separately need **WAITING_FOR_GROUP_SCHEMA_INTEGRATION** and **WAITING_FOR_DISTINCT_RELAY_IDENTITIES**.

Read-only fetched source: MyEve main `d75091eb333a531fa91ed9d39e273948aa9d0eaf`; Relay main `a61f0ef697b02cf22da72ff2904c584d7faa026a`; MyFactory main `c0b4c1155a6a98f91375163443938042e6a0be10`. Latest MyEve cloud handoff `a7e63c3a4c061f24059ac1c597893a6cc0ba30dc` and Fabric handoff `d156f07fc62f5519beb2c481679b8a0902bbf79c` were inspected, not merged. Optional sessions are observation only; HEADLESS needs no session provider. No duplicate session schema or execution engine was added.

## Implemented and qualified scope

| Capability | Status | Evidence and limit |
| --- | --- | --- |
| Unified Work Thread | PARTIAL | Retained controlled Work → Current Truth → Result/Proof → exact decision → same conversation passes. Controlled natural SDK authoring creates canonical Work idempotently. Combined natural browser productive execution remains NOT_RUN |
| Work Inbox | PASS, deterministic engineering scope | Needs You / Working / Monitoring / Completed plus truthful Waiting derive from canonical projections/readback. Private-result settlement appears without chat archival or Work lifecycle mutation. Bounded pagination; non-engineering Work kinds not claimed |
| Persistent Agents | PASS for implemented deterministic profile/home scope; PARTIAL overall | Direct-owner approved profile lifecycle; fresh copies with zero grants; edits preserve grants/risk/limits; home Work/history/Routines/results; cross-owner guards. Autonomous specialist productive execution remains unqualified |
| Routine deterministic lifecycle | PASS for tested scope; PARTIAL overall | Controlled natural proposal, real tool/schema/persistence, explicit harness approval/review, canonical scheduler, duplicate tick/exactly one occurrence, retained quiet Result, last/next, notification/condition, pause/reviewed resume/stop |
| Routine recovery | PASS, deterministic | New store and worker identity; expired claim recovery; stale completion fenced. Not a physical process/Mac shutdown or real CLOUD test. Distinct-trigger coalescing remains NOT_QUALIFIED |
| Today/Inbox | PASS for implemented deterministic scope | Canonical engineering Work lanes plus Routine responsibility/notification data; reconnect/outage states; disabled release never called active monitoring |
| Persistent Groups | PARTIAL | Bounded domain/repository, proposed SQL in isolated PostgreSQL, membership/reference authorization, CAS/audit, durable read after repository restart, canonical attention reference. Shared migration/API/UI integration remains unqualified |
| Relay coordination | PARTIAL | Existing transport unchanged; canonical draft/envelope/result schemas with four distinct fixture identities. No new real Group round-trip or Alpha canary was run |
| Designer → Engineer → Reviewer → Sofie | PASS, deterministic domain only | Design Result/artifact references → correlated handoff → implementation/visual references → reviewer → synthesis reference → canonical Needs You. These are fixtures, not real productive agents or signed peer delivery |
| P0 Playwright | PASS, implemented scope; PARTIAL full mission | 36 desktop/390px cases, keyboard settlement/continuation, scoped axe checks. Productive natural browser authoring, full browser Routine trigger and Group delegation are not covered as complete journeys |

## Reproducible evidence

All current evidence is **DETERMINISTIC**, including real task-owned local PostgreSQL and production-build browser routes backed by controlled fixtures. It is not CONNECTED external-peer or LIVE execution evidence. The environment-gated skipped tests are not counted as passes.

| Check | Result | Retained log |
| --- | --- | --- |
| Application unit suite | 1,997 passed; 94 skipped | [unit log](product-continuation-all-tests.log) |
| Natural controlled agent/Work authoring | 19 checks passed | [authoring](product-continuation-authoring.log) |
| Group proposed-schema golden journey | 25 checks passed | [Group journey](product-continuation-group-journey.log) |
| Routine natural controlled lifecycle/recovery | 18 checks passed | [Routine journey](product-continuation-routine-journey.log) |
| Routine condition/notification regressions | 27 checks passed | [conditions](product-continuation-routine-condition.log) |
| Work Inbox derivation/settlement/isolation | 12 checks passed | [Work Inbox](product-continuation-work-inbox.log) |
| Agent profile/home identity boundaries | 12 checks passed | [agent home](product-continuation-agent-home.log) |
| Agent-native Playwright | 36 passed | [browser log](product-continuation-full-playwright.log) |
| Typecheck/registry/governance | PASS; 760 sources; UNKNOWN=0; release disabled | [checks](product-continuation-typecheck.log) |
| Production build | PASS | [build](product-continuation-build.log) |

The six PostgreSQL scripts total **113 checks**. Run from repository root using `node --import tsx apps/eve/test/agent-native/<name>.integration.mjs`. They enforce the disposable local database `postgresql://postgres@127.0.0.1:55509/myeve_beta_publication`, via `MYEVE_PRODUCT_TEST_DATABASE` (Work Inbox also needs `MYEVE_PUBLICATION_TEST_DATABASE`). Authoring/publication fixtures use the existing dogfood engineering configuration. Browser command from apps/eve: `npx playwright test -c test/agent-native/playwright.config.ts --reporter=list`. The local preview and captured canonical publication fixtures are prerequisites; this harness is not standalone from a clean clone.

Initial added browser tests exposed missing unrelated channel/email/responsibility bootstrap stubs and an incorrect URL assertion after chat consumed its thread parameter. Stubs and the assertion were corrected; final full suite passed. The assertion now verifies the selected canonical thread, not a retained query parameter. No production behavior was weakened to pass tests. PostgreSQL authoring warns about concurrent queries through its single-client fixture adapter; all isolation/persistence assertions pass.

## Screenshots

- [Desktop settled Work Inbox](../../../output/playwright/agent-native/desktop-work-inbox-settled.png)
- [390px settled Work Inbox](../../../output/playwright/agent-native/390px-work-inbox-settled.png)
- [Desktop agent home](../../../output/playwright/agent-native/desktop-agent-home.png)
- [390px agent home](../../../output/playwright/agent-native/390px-agent-home.png)
- [Desktop Today](../../../output/playwright/agent-native/desktop-today-responsibilities.png)
- [390px Today](../../../output/playwright/agent-native/390px-today-responsibilities.png)

Scoped automated accessibility checks and no-horizontal-overflow checks passed; this is not complete manual accessibility certification. MyEve's existing design system is retained. Infrastructure/provenance stays in existing expandable details.

## Explicit remaining gates

**NOT_RUN:** Natural Work → real CLOUD; Routine → real CLOUD; browser-off real CLOUD Routine; Mac-off real CLOUD Routine; real cloud Result/Proof return; real cloud cancellation/recovery. No infrastructure-only or fixture result promotes these statuses.

**NOT_RUN:** Combined natural browser request/approval → productive specialist → new Result; production Group UI/persistence and registered distinct-agent delivery/synthesis; second real MyEve; Muse/GrokBots. Existing Alpha code/evidence is preserved, not presented as a new Group success. Routine general release remains disabled. Other previously documented non-cloud product gaps are not silently marked complete by this checkpoint.

## Ownership and durability

No protected engineering execution/publication backend, beta integration runtime, Relay source, MyFactory source or numbered migration changed. Group SQL is an unnumbered proposal installed only in isolated test schemas. Agent profile edits intentionally exclude capability/limit columns. The Product branch remains a source candidate; canonical integration stays with its existing owner. Checkpoint commit → push → exact remote SHA verification is required before reporting acceptance. The commit containing this report is the checkpoint; its verified SHA is reported in the task handoff rather than embedded self-referentially here.
