---
status: complete
priority: p1
issue_id: "014"
tags: [browser, profiles, authentication, computer, security]
dependencies: ["013"]
---

# Add persistent authenticated web work

## Problem Statement

MyEve had one persistent cloud desktop for signed-in browser work. That made login state durable, but it did not isolate Agents, govern profile sharing, represent authentication failure, or give the owner a safe recovery path. An Agent could not reliably hand off login, MFA, CAPTCHA, or a sensitive form without an ambiguous overlap between owner and Agent control.

## Recommended Action

Keep account authentication inside the existing Orgo desktop boundary. Create one persistent browser profile per Agent by default, allow only explicit and revocable sharing, pause Agent automation before owner takeover, and store profile ownership and lifecycle state without storing raw account passwords.

## Acceptance Criteria

- [x] Each active Agent receives a separate persistent browser profile by default.
- [x] An Agent cannot use another Agent's profile without an explicit active grant.
- [x] Profile sharing is visible, owner-controlled, and revocable.
- [x] Owner takeover covers login, MFA, CAPTCHA, and sensitive forms and pauses Agent automation first.
- [x] Authentication failure becomes an explicit reconnect-required state instead of an automated credential retry.
- [x] Profile reset permanently deletes the scoped desktop, revokes sharing, and advances to a clean generation after exact confirmation.
- [x] MyEve stores profile ownership, status, and grants but no raw account passwords, cookies, or authentication tokens.
- [x] A pinned legacy Orgo desktop fails closed when it cannot isolate a secondary or reset profile.
- [x] The Computer workspace combines persistent Profiles with the existing isolated-session Activity record.
- [x] Empty, setup, live, takeover, reconnect, failure, and reset states are represented.
- [x] Database integration, contract tests, unit tests, typecheck, production build, and browser verification pass.

## Work Log

### 2026-09-18 - Completed

**By:** Codex

**Actions:**

- Added durable owner- and Agent-scoped browser profiles with explicit sharing grants and audited lifecycle transitions.
- Scoped Orgo desktop resolution, VNC relay access, computer tools, and web controls to the selected profile.
- Added owner takeover and login-complete transitions; Agents now stop and request takeover instead of asking for or retrying credentials.
- Added reconnect handling and an exact-confirmation reset that deletes only the selected desktop, revokes grants, and advances its generation.
- Added the Profiles and Activity Computer workspace with profile selection, sharing, revoke, takeover, reconnect, and reset controls.
- Preserved the original primary desktop name for backward compatibility while isolating secondary and replacement profiles.

**Verification:**

- 127 Node contract tests and 321 Vitest tests passed.
- The real database scenario verified per-Agent isolation, denied-by-default sharing, explicit grant, revocation, reconnect state, and reset generation.
- All 14 migrations validated; TypeScript, capability registry, and skill routing passed.
- The 71-route production build passed.
- Browser verification confirmed Profiles and Activity, both Agent profiles, security copy, sharing and reset controls, historical sessions, and a clean browser console.

**Risk Notes:**

- Stopping a desktop preserves its Orgo state; resetting is intentionally permanent and requires exact profile confirmation.
- MyEve does not become a password vault. The owner enters secrets directly during takeover, and the remote desktop provider retains the resulting browser session.
