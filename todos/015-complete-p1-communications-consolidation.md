---
status: complete
priority: p1
issue_id: "015"
tags: [channels, email, slack, imessage, push, ux]
dependencies: ["014"]
---

# Consolidate communication channels

## Problem Statement

Email, Slack, iMessage, and browser push were individually capable but scattered across unrelated navigation and Manage sections. The owner could not see which channels were reachable, search the history MyEve was allowed to read, understand delivery failures, or determine which provider owned retention and deletion without visiting each implementation separately.

## Recommended Action

Add one Channels workspace over the existing provider-native flows. Keep message bodies and attachments in their current systems of record, federate search at request time, preserve iMessage's separate transcript lock, and expose provider limitations instead of building a second message store.

## Acceptance Criteria

- [x] One Channels workspace reports Email, Slack, iMessage, and browser-push readiness independently.
- [x] A provider failure degrades only that provider and does not hide the rest of the workspace.
- [x] Federated search covers AgentMail and the separately authorized iMessage transcript without retaining a second search index.
- [x] Search coverage states explicitly explain disconnected, locked, and provider-owned history.
- [x] Email results preserve query and thread deep links; attachment counts and delivery status remain visible.
- [x] Slack history remains in Slack rather than being copied into MyEve.
- [x] Existing Email, Slack, iMessage, Push, approval, and attachment flows remain the source of truth.
- [x] Recent proactive delivery attempts expose provider, status, retry outcome, fallback, and failure summary.
- [x] The workspace explains retention, deletion, redaction, and content ownership for every channel.
- [x] Existing signed webhook, idempotency claim, reset barrier, and retry boundaries remain enforced and are covered by contract tests.
- [x] Loading, empty, disconnected, locked, degraded, unavailable, success, and failure states are represented.
- [x] Tests, typecheck, production build, browser interaction, and visual verification pass.

## Work Log

### 2026-09-18 - Completed

**By:** Codex

**Actions:**

- Replaced the standalone sidebar Email entry and device Push toggle with one Channels entry while retaining the complete Email and iMessage pages.
- Added independently resolved provider health for Email, Slack, iMessage, and browser push.
- Added request-time federated search across AgentMail and the protected iMessage transcript, with source-by-source coverage reporting.
- Preserved the iMessage admin-token boundary and made locked history an explicit partial-search state.
- Added recent proactive-delivery audit history and clear provider data-control guidance.
- Added Email query/thread deep links so a result opens in the existing full inbox rather than a reduced duplicate reader.

**Verification:**

- Channel contract tests verify web authentication, protected iMessage search, provider-owned Slack history, Email claim/release idempotency, signed iMessage inbound delivery, and Slack credential verification.
- Browser verification confirmed navigation, all provider setup states, partial federated search, iMessage lock guidance, and Email query deep linking.
- The desktop dark-theme layout was visually inspected and the browser console remained clean.

## Post-Deploy Monitoring & Validation

- **Logs:** watch `GET /api/channels`, `GET /api/channels/search`, `Inbound email rejected`, `iMessage inbound rejected`, and provider-specific delivery failures.
- **Healthy signals:** Channels returns independently populated states; disconnected providers show setup guidance; Email/iMessage search completes without weakening transcript authorization.
- **Failure signals:** sustained 5xx responses from either Channels endpoint, cross-provider search failure caused by one provider, or any unauthorized iMessage result.
- **Mitigation trigger:** disable the Channels navigation entry and retain direct `/email`, `/imessage`, and Manage links while investigating; no provider data migration or rollback is required.
- **Validation window and owner:** verify after the first production deployment and monitor for 24 hours; product owner owns provider credential remediation.
