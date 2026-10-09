# Pluto visual / IA refinement qualification

Date: 2026-10-02. Source: `codex/agent-native-work-experience`, following remote-verified `a1cbd0c77ce3150f4730a7f81a0d0145077fe130`.

**Implemented Product scope: PASS. Full agent-native mission: PARTIAL / NOT_READY.** This is an isolated source candidate, not a production deployment or canonical integration.

## Changes

Live Agent Cards read identity, handle, purpose, Work/responsibility status and authority from canonical sources. They refresh while visible and on reconnect, and remove stale state on read failure. Current Work takes priority over profile configuration. The server reuses `effectiveCapability` and the capability registry; availability, agent-policy access and approval are displayed separately. A connection or assignment does not grant an external action. Resource-specific Relay authority and exact publication decisions stay in their existing flows.

Today now foregrounds Needs You, Working, Monitoring, Recently completed and Waiting, followed by agents and responsibilities. The duplicate decision/operational lists are removed from Today. One owner rail adds Agents, Rooms and Work-state filters; mobile collapses it behind Menu. Recently completed does not invent an owner absence interval; a cross-device last-seen cursor remains a schema/integration proposal.

The existing specialist editor adds a bounded persistent Look using the existing avatar JSON column and moves model/budget/risk/notification settings under Advanced. Profile section navigation covers Chat, Work, Profile, Knowledge and Activity. Knowledge links to the existing owner workspace with scope explained. No second Builder, environment assignment or permission system is introduced.

Rooms is the owner-facing name for Groups. The sample Room combines objective, members, conversation, Work, Results, artifacts, Needs You and expandable proof. It is explicitly labeled sample data. Production Room membership, distinct Relay identities and shared schema remain unqualified. The landing/design proposal uses persistent agents, ongoing responsibilities, governed access, Results and owner control without claiming general CLOUD availability.

## Verification

| Check | Result | Evidence |
| --- | --- | --- |
| Application unit suite | 1,997 passed; 94 environment-gated skipped | [Unit log](visual-ia-unit.log) |
| Typecheck/registry/governance | PASS; 760 classified sources; UNKNOWN=0; Routine release disabled | [Checks](visual-ia-typecheck.log) |
| Production build | PASS | [Build](visual-ia-build.log) |
| Canonical authoring + appearance persistence | 22 PostgreSQL checks passed | [Authoring](visual-ia-authoring.log) |
| Agent home/policy/owner isolation | 15 PostgreSQL checks passed | [Agent home](visual-ia-agent-home.log) |
| Full agent-native browser suite | 50 passed, including 12 visual and 2 navigation/owner-attention cases | [Full browser run](visual-ia-full-playwright.log) |
| Visual regression | 32 saved baselines compared successfully without update mode | See matrix below |
| Scoped accessibility and layout | WCAG 2 A/AA and 2.1 AA axe checks; keyboard activation; no horizontal overflow | Assertions in visual-ia.spec.ts and existing P0 specs |

The final 50-case suite passed in one complete run against the final production build. Baselines were captured, representative desktop/mobile and light/dark images were visually inspected, then all 32 images were compared in normal test mode. Pixel difference tolerance is 0.5%, animations disabled, time fixed for visual determinism. These checks are not complete manual accessibility certification.

Evidence category: **DETERMINISTIC**. Live cards/Work/publication reads use the real authenticated local preview and task-owned PostgreSQL. Agent-list/chat bootstrap data is controlled. The Room is a static interaction fixture; Routine Monitoring uses an explicitly named response fixture. Browser specialist-save failure is controlled, with real appearance persistence verified separately in PostgreSQL. No claim is made that a fixture means real agent execution, cloud scheduling, registered Relay delivery or productive natural browser E2E.

The visual pass found and fixed an existing light-theme Primary Agent badge contrast issue. It also removed conflicting duplicate Today decision counts. Harness repairs matched the Inbox query URL, restored the real owner-decision read route and stopped per-file teardown from closing the shared Work test pool. An exploratory run during rebuild was discarded; qualification runs used the completed build and restarted preview. No execution/authority assertion was weakened to pass tests.

## Visual evidence

Each row includes the requested light/dark and desktop/mobile coverage. Result and Needs You are intentionally captured inline in the Work thread, where the owner encounters the decision.

| Surface | Desktop light | Desktop dark | 390px light | 390px dark |
| --- | --- | --- | --- | --- |
| Today | [light](../../../output/playwright/agent-native/visual-baselines/desktop/light-today.png) | [dark](../../../output/playwright/agent-native/visual-baselines/desktop/dark-today.png) | [light](../../../output/playwright/agent-native/visual-baselines/390px/light-today.png) | [dark](../../../output/playwright/agent-native/visual-baselines/390px/dark-today.png) |
| Live Agent Card | [light](../../../output/playwright/agent-native/visual-baselines/desktop/light-live-agent-card.png) | [dark](../../../output/playwright/agent-native/visual-baselines/desktop/dark-live-agent-card.png) | [light](../../../output/playwright/agent-native/visual-baselines/390px/light-live-agent-card.png) | [dark](../../../output/playwright/agent-native/visual-baselines/390px/dark-live-agent-card.png) |
| Agent home / profile | [light](../../../output/playwright/agent-native/visual-baselines/desktop/light-agent-profile.png) | [dark](../../../output/playwright/agent-native/visual-baselines/desktop/dark-agent-profile.png) | [light](../../../output/playwright/agent-native/visual-baselines/390px/light-agent-profile.png) | [dark](../../../output/playwright/agent-native/visual-baselines/390px/dark-agent-profile.png) |
| Specialist creation | [light](../../../output/playwright/agent-native/visual-baselines/desktop/light-specialist-creation.png) | [dark](../../../output/playwright/agent-native/visual-baselines/desktop/dark-specialist-creation.png) | [light](../../../output/playwright/agent-native/visual-baselines/390px/light-specialist-creation.png) | [dark](../../../output/playwright/agent-native/visual-baselines/390px/dark-specialist-creation.png) |
| Room | [light](../../../output/playwright/agent-native/visual-baselines/desktop/light-room.png) | [dark](../../../output/playwright/agent-native/visual-baselines/desktop/dark-room.png) | [light](../../../output/playwright/agent-native/visual-baselines/390px/light-room.png) | [dark](../../../output/playwright/agent-native/visual-baselines/390px/dark-room.png) |
| Room Needs You | [light](../../../output/playwright/agent-native/visual-baselines/desktop/light-room-needs-you.png) | [dark](../../../output/playwright/agent-native/visual-baselines/desktop/dark-room-needs-you.png) | [light](../../../output/playwright/agent-native/visual-baselines/390px/light-room-needs-you.png) | [dark](../../../output/playwright/agent-native/visual-baselines/390px/dark-room-needs-you.png) |
| Routine Monitoring — fixture | [light](../../../output/playwright/agent-native/visual-baselines/desktop/light-routine-monitoring-fixture.png) | [dark](../../../output/playwright/agent-native/visual-baselines/desktop/dark-routine-monitoring-fixture.png) | [light](../../../output/playwright/agent-native/visual-baselines/390px/light-routine-monitoring-fixture.png) | [dark](../../../output/playwright/agent-native/visual-baselines/390px/dark-routine-monitoring-fixture.png) |
| Work thread / Result / Needs You | [light](../../../output/playwright/agent-native/visual-baselines/desktop/light-work-result-needs-you.png) | [dark](../../../output/playwright/agent-native/visual-baselines/desktop/dark-work-result-needs-you.png) | [light](../../../output/playwright/agent-native/visual-baselines/390px/light-work-result-needs-you.png) | [dark](../../../output/playwright/agent-native/visual-baselines/390px/dark-work-result-needs-you.png) |

## Remaining gates and ownership

The [specific dependency audit](../../product/current-product-dependencies.md) still applies: canonical staging composition, Fabric integration and actual cloud execution qualification. All six real CLOUD gates remain NOT_RUN. Room shared-schema and distinct Relay identity gates remain open. Routine release is disabled. No protected engineering/beta runtime, Relay/MyFactory worktree, cloud branch or numbered migration changed. No production deployment, paid model execution, merge, publication or authority expansion occurred.

The [IA addendum and landing proposal](../../product/pluto-visual-ia-addendum.md) records design choices and limitations. Screenshots retain MyEve's original design system. Commit → push → exact remote SHA verification is required for this checkpoint; its final SHA is reported in the task handoff.

Today also retains non-Work canonical Inbox decisions in an Owner attention section when present. This avoids losing email/other owner requests while eliminating contradictory zero-count summaries. The keyboard navigation checks cover this controlled Inbox projection.
