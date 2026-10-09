---
status: complete
priority: p1
issue_id: "002"
tags: [security, auth, dependencies, runtime, testing]
dependencies: ["001"]
---

# Make Sofie's runtime foundation shippable

## Problem Statement

Sofie's operations hub renders, but production access is anonymous, required providers are not reported as one readiness state, dependency advisories remain, and route/browser coverage is incomplete. Personal data and consequential tools cannot ship behind that baseline.

## Findings

- The resolved Next.js 16.3.0 package has a critical advisory fixed in 16.3.3 and newer.
- `requireWebAuth()` permits every request and the Eve channel explicitly admits anonymous callers.
- The app is a personal, single-owner deployment; multi-user accounts are not needed for this release.
- Builder-created agents need the same access credential contract or they will deploy into an unusable state.

## Proposed Solutions

### Option 1: Deployment protection only

**Pros:** Small code change.

**Cons:** Platform-specific, does not create an application principal for Eve, and produces inconsistent local/app behavior.

### Option 2: Signed single-owner application session

**Pros:** One identity across Next routes and Eve sessions, portable, no auth database, polished login flow.

**Cons:** Password rotation signs the owner out; not suitable for multiple users.

### Option 3: Multi-user identity provider

**Pros:** Ready for teams and account lifecycle.

**Cons:** Premature provider and schema complexity for a personal assistant.

## Recommended Action

Implement Option 2, keep local development open, fail closed in production, update the builder contract, then add readiness and route/browser tests. Revisit a managed identity provider only when a second human account is required.

## Acceptance Criteria

- [x] Next.js and safe transitive dependencies have no known npm advisories.
- [x] Production pages, APIs, and Eve sessions reject anonymous access.
- [x] The owner can sign in and sign out with complete loading and error states.
- [x] Builder deployments collect an access password and provision a signing secret.
- [x] A protected readiness endpoint reports required configuration without secrets.
- [x] Auth unit tests and browser smoke tests pass in both development and production modes.
- [x] Typecheck, unit tests, audit, and production builds pass.

## Work Log

### 2026-09-12 - Dependency and auth implementation

**By:** Codex

**Actions:**

- Upgraded both workspaces to Next.js 16.3.5.
- Applied safe transitive dependency patches; `npm audit` reports zero vulnerabilities.
- Began a signed, HttpOnly, single-owner session shared by Next route handlers and the Eve channel.
- Added the owner login/logout flow, production page proxy, cross-origin mutation rejection, and
  direct Eve auth-chain coverage.
- Added System readiness UI and provider probes with explicit setup, degraded, and ready states.
- Added structured API failures with request IDs so missing providers no longer look like empty data.
- Added ordered, checksum-protected SQL migrations and a migration validation CI step.
- Constrained builder template reads; the production builder now emits no dynamic tracing warnings.
- Verified development Manage UI plus production login, setup-required, cookie, logout, and
  anonymous-rejection flows.

**Learnings:**

- Eve route auth is independent from Next route auth, so both must validate the same browser session.
- The builder must provision auth credentials at initial deployment; update deployments can preserve them.
- `next start` does not boot Eve's embedded local backend; the production Eve boundary is covered by
  the auth-chain contract test against a non-loopback deployment origin.
- Database readiness must verify the current migration, not only that `SELECT 1` succeeds.
