# Live Agent Cards, Rooms and Work-oriented navigation

Status: Product refinement on the existing agent-native source candidate. This adapts the supplied Pluto interaction references; it does not copy visual branding, introduce another dashboard, or change canonical architecture.

## Decisions implemented

- **Today stays the overview.** Show Needs You, Working, Monitoring, Recently completed and truthful Waiting together. Agent cards and ongoing responsibilities follow. The duplicated operational Active Work list is removed from Today and retained in Daily Brief. Counts remain bounded to the current page of canonical engineering Work.
- **One primary navigation.** Agents and Rooms join the existing owner rail; Working, Monitoring and Recent open filtered Work Inbox views. Desktop keeps one rail. At 390px the menu collapses and content stacks. No Pluto-style double sidebar is added.
- **Live Agent Card.** Identity, handle, purpose, current Work/responsibility, capability availability and authority summary. Read-only Current Truth refreshes every 15 seconds while visible and on reconnect. Failed refresh clears status rather than showing stale Idle/Working. A configured active profile is not online presence. Current Work needing attention/running takes priority over profile configuration.
- **Capability is separate from authority.** The server uses existing `effectiveCapability` and the capability registry's approval policy. UI labels availability, agent-policy access and action approval separately. It does not claim an account is connected because a feature is configured, nor turn an assignment into an external-action grant. Unknown resource-specific authority remains checked at the action. Registry policy is not a substitute for Relay's effect-time authorization. Exact software publication choices remain on canonical Work.
- **Rooms is the owner-facing name.** Internal Group types and Relay contracts remain unchanged. A labeled interaction preview combines objective, members, conversation, Work, Results, artifacts and Needs You. Production Rooms remain unavailable pending shared-schema and distinct Relay-identity integration; the preview does not create a second message or execution system.
- **Specialist sections.** Chat starts the existing selected-agent conversation. Work, Profile, Knowledge and Activity are section navigation within the existing profile. Knowledge links to the owner Knowledge workspace with scope explained; it does not pretend to expose a new agent-specific Memory store. Environments and Rooms show their actual integration limits rather than invented associations.
- **Creation refines the existing editor.** Name, responsibility, purpose summary, standing instructions, bounded Look and capabilities; model, risk ceiling, budget and notifications sit under Advanced. Appearance uses the existing avatar JSON column, with allowlisted symbol/color values and no external URL. No Builder duplicate or migration is introduced.

## Deliberate adaptations

“Completed while you were away” requires an owner-scoped, cross-device last-seen boundary. No such canonical read cursor currently backs Work Inbox. This checkpoint says **Recently completed** rather than inventing an absence interval from local browser storage. A shared cursor proposal belongs with canonical integration; no schema number is allocated here.

The illustrated Email/Software permission examples are not hardcoded into live cards. A connected channel, assigned capability, risk ceiling, exact resource grant and action-specific approval can disagree. Cards display the available canonical policy and defer actual decisions to the existing governed action. Work still follows Goal → Task → Work → delegation → candidate → verification → Result; advanced provenance stays expandable.

Routine Monitoring is visually qualified using an explicitly named fixture. General Routine release stays disabled. Waiting remains the production display for an unreleased scheduled responsibility; this visual test does not qualify CLOUD or browser/Mac-independent execution.

## Landing/design proposal

**Headline:** Give an outcome a lasting home.

**Supporting copy:** Work with persistent agents that know their responsibilities, use governed access, and bring useful Results back for your review. Keep decisions, evidence and the next conversation together.

**Primary action:** Meet Sofie. **Secondary action:** Explore how Work stays in your control.

Suggested content order: one owner request → a named specialist → concise progress → Result with expandable Proof → a bounded owner decision. Follow with responsibilities, access/authority, and continuity. Show the existing MyEve palette, typography and quiet spacing; use original product screenshots rather than borrowed Pluto artwork.

Background Work is a capability under qualification. Current marketing must not promise general cloud autonomy, laptop-off completion, real multi-agent Rooms, or verified outcomes for unverified work. When live qualification arrives, update copy against exact evidence and environment availability rather than a generic “always on” badge.

## Qualification

Use the existing agent-native browser suite plus `visual-ia.spec.ts`: desktop/390px, light/dark, Today, agent profile, Live Agent Card, specialist creation, Room sections, Routine Monitoring fixture, Work thread, Result and Needs You. Pixel baselines supplement keyboard, scoped axe, overflow, error/retry and canonical persistence checks. They do not replace functional E2E.

Current external dependencies remain in [the dependency audit](current-product-dependencies.md). No protected execution surfaces, Relay authority, cloud admission or numbered migrations are changed by this addendum.

Today also retains non-Work canonical Inbox decisions in an Owner attention section when present. This avoids losing email/other owner requests while eliminating contradictory zero-count summaries. The keyboard navigation checks cover this controlled Inbox projection.
