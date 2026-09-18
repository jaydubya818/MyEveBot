---
status: ready
priority: p1
issue_id: "016"
tags: [phone, agentphone, safety, production]
dependencies: ["015"]
---

# Phone production qualification

## Problem Statement

MyEve has a substantial AgentPhone integration, but Phone remains hidden because it is not safe or qualified for production use. Outbound actions can incur real charges and contact real people without an operational kill switch, locally enforced caps, consent records, opt-out enforcement, or quiet hours.

## Findings

- Provisioning, signed inbound webhooks, SMS/iMessage delivery, voice bridging, verification inbox access, retries, deduplication, and owner/guest isolation already exist.
- The production UI is deliberately parked behind `PhoneComingSoon`.
- AgentPhone has no sandbox; the local provider stub is the only non-billed end-to-end environment.
- AgentPhone exposes usage reporting, but not a pre-charge dollar authorization primitive. Local action caps are therefore the reliable pre-send guardrail.
- Provider guidance requires the first outbound SMS to identify the sender, acknowledge consent, and include STOP instructions.
- No AgentPhone credentials are present in the local environment, so live billed qualification depends on production credentials and an explicit test recipient.

## Proposed Solutions

### Option 1 — Enforced safety policy and staged qualification

Add a fail-closed operational switch, daily message/call caps, consent records, STOP/START handling, quiet hours, usage visibility, and a qualification checklist. Exercise the full non-billed matrix against the independent provider stub; expose controls only after the safety layer passes.

**Pros:** Launchable guardrails, auditable behavior, bounded spend, no dependency on provider-side billing controls.

**Cons:** Live carrier delivery and billing still require credentials and a real test number.

### Option 2 — Provider dashboard controls only

Rely on AgentPhone balance, rate limits, and carrier opt-out handling.

**Pros:** Less code.

**Cons:** No application kill switch, no pre-send consent policy, and no deterministic local cap. Not acceptable for a real-money channel.

## Recommended Action

Implement Option 1. Keep Phone fail-closed by default, preserve the existing provider integration, add the minimum safety control plane, qualify it against the independent stub, and record live billed qualification as a separate release gate if credentials or a designated recipient are unavailable.

## Acceptance Criteria

- [x] Phone operations are disabled by default and can be stopped immediately without releasing the number.
- [x] Every outbound message and call passes an atomic daily cap before reaching the provider.
- [x] Non-owner recipients require an explicit consent record; STOP blocks future sends and START can restore consent.
- [x] Configured quiet hours block outbound contact with clear operator feedback.
- [x] The first outbound message includes sender, consent, and opt-out disclosure.
- [x] The management UI shows state, caps, current usage, quiet hours, consent contacts, and emergency controls.
- [x] Signed webhook, deduplication, owner/guest isolation, verification inbox, failure recovery, text, iMessage, and call paths remain covered.
- [ ] Migration, tests, typecheck, production build, and release-gated browser qualification pass.
- [ ] Live billed qualification is either completed or explicitly recorded as a blocked release gate with the missing prerequisite.
- [x] Roadmap status reflects the verified outcome without claiming unperformed live tests.

## Work Log

### 2026-09-18 — Architecture and provider audit

**Actions:**

- Audited the existing AgentPhone API client, channels, tools, management API/UI, auth boundary, independent stub, and framework channel guidance.
- Verified current provider webhook, usage, messaging compliance, retry, and delivery-failure behavior against AgentPhone's documentation.
- Selected a fail-closed, locally enforced safety policy because provider usage reporting is observational rather than a pre-charge authorization control.

**Learnings:**

- The transport implementation is already broad; the launch blocker is operational safety and evidence, not another channel rewrite.
- Local credentials are absent, so non-billed qualification can proceed now while live carrier qualification remains dependent on production access and a designated recipient.

### 2026-09-18 — Safety control plane and non-billed qualification

**Actions:**

- Added migration 0015 with a fail-closed operational switch, atomic daily segment/call counters, consent records, and usage audit events.
- Enforced consent, first-message disclosure, STOP/START handling, quiet hours, daily caps, unknown-caller rejection, and disabled-line behavior in every outbound/inbound path.
- Added a Phone management surface for caps, usage, consent, and emergency shutdown, gated behind `AGENTPHONE_LIVE_QUALIFIED=true` so it cannot ship before live qualification.
- Improved retry classification so provider caps that cannot clear on retry are not retried blindly.
- Executed all 15 migrations against an isolated local Postgres database and exercised provisioning, webhook configuration, SMS/iMessage capability, outbound messaging, and outbound calls against the independent AgentPhone stub.
- Passed 330 Vitest tests, 130 Node contract tests, capability/skill validation, TypeScript, migration validation, and the 74-route Webpack production build. Turbopack could not open its internal worker port in the execution sandbox; the supported Webpack build completed successfully.
- Confirmed through the linked Vercel project that production currently has no `AGENTPHONE_API_KEY`, `AGENTPHONE_ADMIN_TOKEN`, or callback-origin configuration.

**Learnings:**

- The local safety boundary is ready, but the enhancement is not production-qualified until a real provider account and owner-designated test recipient are available.
- The release flag keeps the dormant implementation from becoming a user-facing promise before that final evidence exists.

## Post-Deploy Monitoring & Validation

- Search logs for `AgentPhone`, `phone safety`, `signature rejected`, `dispatch failed`, `outbound dropped`, and provider HTTP failures.
- Monitor `/v1/usage`, webhook delivery success, cap consumption, opt-out events, and unexpected blocked sends for 72 hours after enablement.
- Healthy: signed deliveries succeed, usage stays inside configured limits, STOP blocks immediately, and disabled/quiet-hour sends never reach the provider.
- Roll back by switching Phone off immediately; release the number only if billing must end. Rotate the webhook/key if signature or credential compromise is suspected.
- Owner: product owner for consent and spend policy; technical owner for webhook health and incident response.
