---
status: complete
priority: p1
issue_id: "001"
tags: [frontend, eve, manage, product]
dependencies: []
---

# Ship Sofie's first operations-hub slice

## Problem Statement

Sofie's current Manage page is a horizontal tab strip inside the chat shell. It hides unconfigured capabilities, masks some API failures as empty lists, has no appearance controls, and does not expose the existing receipt data as a Finance surface. The repository also treats `apps/eve` as a mirror of an inaccessible Ruth repository, preventing independent product development.

## Findings

- `apps/eve/components/manage-panel.tsx` owns all management data and UI in one large client component.
- `/api/features` exposes four booleans instead of setup/ready/error states.
- Receipt tools exist, but there is no receipt API or Finance UI.
- The root layout hardcodes dark mode even though Kumo supports light and dark modes.
- CI rejects direct `apps/eve` changes and a sync workflow can overwrite them.
- The Product Owner approved making this repository Sofie's independent source of truth.

## Proposed Solutions

### Option 1: Add more horizontal tabs

**Approach:** Extend the existing component in place.

**Pros:** Small initial diff.

**Cons:** Poor mobile navigation, more hidden coupling, and no improvement to status clarity.

**Effort:** Low

**Risk:** Medium

### Option 2: First operations-hub slice

**Approach:** Make the repository independent, add a responsive list/detail management shell, explicit capability states, Appearance preferences, and Finance backed by the existing receipt store.

**Pros:** Shippable user value, clean expansion path, honest setup states, and preserves existing features.

**Cons:** Touches UI, API, repository workflow, and tests together.

**Effort:** Medium

**Risk:** Medium

### Option 3: Build every reference section now

**Approach:** Add Email, Phone, Computer, Card, Billing, agents, and groups in one release.

**Pros:** Broad screenshot parity.

**Cons:** Placeholder UX, unapproved providers, financial risk, and a long path to a usable release.

**Effort:** Very high

**Risk:** High

## Recommended Action

Implement Option 2 on `feat/sofie-operations-hub`. Preserve all existing Manage capabilities, keep provider- and money-dependent sections out of this slice, and verify desktop, mobile, failure states, typecheck, and production build.

## Technical Details

**Affected areas:**

- repository CI and obsolete upstream sync automation
- capability status API
- appearance preference storage and application
- receipt query API
- responsive Manage navigation and panels
- browser smoke coverage and documentation

**Database changes:** No schema change. Finance reads the existing `receipts` table.

## Acceptance Criteria

- [x] Repository no longer rejects or overwrites independent `apps/eve` changes.
- [x] Sofie/Jay identity remains configured locally.
- [x] Manage uses responsive list/detail navigation without a horizontal tab overflow.
- [x] Existing Reminders, Triggers, Memory, Connections, and Skills remain reachable.
- [x] Included but unconfigured capabilities show actionable setup states.
- [x] Appearance supports Dark, Light, and System themes and persists locally.
- [x] Finance shows receipt totals and history, with complete loading/empty/setup/error states.
- [x] Direct `/manage/<section>` links and browser history work.
- [x] Typecheck and production build pass.
- [x] Desktop and mobile browser smoke checks pass with screenshots.

## Work Log

### 2026-09-12 - Scope and repository decision

**By:** Codex

**Actions:**

- Reviewed the approved implementation plan and current UI/API architecture.
- Confirmed the upstream Ruth repository is inaccessible.
- Received Product Owner approval to make this repository Sofie's source of truth.
- Created feature branch `feat/sofie-operations-hub`.

**Learnings:**

- The existing receipt store and Kumo theme tokens allow Finance and Appearance to ship without new providers.
- Persistent agents, channels, Card, and Billing remain intentionally deferred.

## Notes

- The implementation plan remains the source for later phases.
- No external provider or payment decision is included in this todo.

### 2026-09-12 - Implementation and verification

**By:** Codex

**Actions:**

- Removed the Ruth mirror guard, sync workflow, and sync script after Product Owner approval.
- Made Sofie/Jay the app defaults and removed hard-coded personal names from active agent tools.
- Added typed capability states and actionable setup guidance without exposing secret values.
- Replaced horizontal tabs with responsive desktop list/detail navigation and mobile drill-down.
- Added direct section URLs, history handling, focus-safe labels, and scroll restoration.
- Added persistent System, Light, and Dark appearance preferences.
- Added a read-only Finance API and responsive receipt summary/history UI with currency separation.
- Added unit coverage for ready/setup/excluded capability behavior and ran an agent-native parity review.

**Verification:**

- `npm run typecheck` passed for both workspaces and the builder manifest check.
- `npm test` passed: 3 tests, 0 failures.
- `npm run build` passed for Eve and the builder. The builder still reports the four pre-existing dynamic filesystem tracing warnings.
- Browser smoke passed at 1440 × 900 and 390 × 844, including direct routes, history, mobile drill-down, setup states, and theme persistence.
- Final screenshots: `/tmp/sofie-manage-desktop-final.png`, `/tmp/sofie-manage-mobile-list.png`, and `/tmp/sofie-manage-mobile-detail-final.png`.

**Agent-native review:**

- Reminders, triggers, memory, connections, skills, and Finance use the same stores and primitives available to Sofie.
- Theme remains deliberately device-local; Sofie does not claim she can change appearance on a different device.
