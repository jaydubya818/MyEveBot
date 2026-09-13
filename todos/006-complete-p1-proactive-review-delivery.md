---
status: complete
priority: p1
issue_id: "006"
tags: [reviews, scheduling, timezone, notifications, delivery, postgres, eve]
dependencies: ["005"]
---

# Ship scheduled proactive review delivery

## Problem Statement

Daily Brief and Weekly Review are canonical and manually checkpointed, but owners must still remember to generate them. Scheduling must be timezone-correct, quiet, retry-safe, inspectable, and disabled by default for existing owners.

## Findings

- Eve already provides minute-level authored schedules and MyEve already uses that pattern for application-managed reminders.
- Phase 2 checkpoints need durable snapshot identity and history before delivery retries can safely reuse generated content.
- Existing push delivery is deployment-global and best-effort; scheduled reviews need owner scope and structured results.
- Telegram already fails closed through an owner allowlist; proactive delivery additionally needs an explicit authorized chat target.

## Proposed Solutions

### Option 1: Extend the review domain behind one Eve dispatcher

Persist owner preferences, historical checkpoints, deliveries, and attempts. Wake a single Eve schedule each minute, enqueue due owner-local periods, atomically claim delivery work, reuse checkpoints, and route through one bounded delivery service.

**Pros:** Reuses current infrastructure, deterministic, auditable, retry-safe, and owner controlled.

**Cons:** Requires coordinated schema, service, API, tool, UI, builder, and deployment work.

### Option 2: Generate channel-specific reviews from independent cron files

Create separate Daily, Weekly, push, and Telegram schedule implementations.

**Pros:** Smaller individual files.

**Cons:** Duplicates policy, weakens deduplication, and risks generation/delivery drift.

## Recommended Action

Implement Option 1. Keep in-app checkpoints as the durable fallback, make external channels opt-in and availability-gated, use Monday-through-Sunday weeks, and defer general-purpose routines and notification settings.

## Acceptance Criteria

- [x] Owner timezone uses validated IANA identifiers and controls DST-safe daily/weekly periods.
- [x] Existing and new owners remain opted out until explicitly enabled.
- [x] Daily/Weekly preferences and quiet hours are owner scoped and editable in Manage.
- [x] One Eve dispatcher calls canonical generation and delivery services.
- [x] Review checkpoints persist their snapshot and are reused on delivery retry.
- [x] Delivery and every attempt are durable and inspectable.
- [x] Database uniqueness prevents duplicate owner/period/channel delivery.
- [x] Retries are bounded and permanent failures do not loop.
- [x] In-app is always available; push and Telegram are shown only when configured.
- [x] Push/Telegram do not spray duplicate copies or weaken Telegram authorization.
- [x] Agent tools can inspect and update preferences without credentials.
- [x] Builder/update compatibility and preview configuration documentation are current.
- [x] Seeded non-empty browser qualification passes and a fresh Preview deploy reaches Ready.
- [x] Full repository qualification passes and generated/noise files are excluded.

## Work Log

### 2026-09-13 - Phase 3 started

**By:** Codex

**Actions:**
- Created `feat/proactive-review-delivery` from exact Phase 2 HEAD `fbe0330b784a658a7b626bc6f8ba4bbb5783e2fc`.
- Audited Phase 2 reviews/checkpoints, Eve scheduling, reminders, push, Telegram, Manage, Builder, and qualification conventions.
- Selected one owner-scoped delivery domain behind the existing minute-level Eve dispatcher.

**Learnings:**
- Generation snapshots must become durable historical checkpoints so retries cannot silently regenerate different content.
- In-app persistence is the universal fallback; external delivery remains singular and explicitly configured.

### 2026-09-13 - Implementation and qualification

**By:** Codex

**Actions:**
- Added historical review snapshots, owner preferences, delivery/attempt ledgers, owner-scoped push subscriptions, bounded retry leases, quiet-hours deferral, and database deduplication.
- Added the minute-level Eve dispatcher, Web Push deep links, allowlisted explicit Telegram delivery, Manage settings/history, bounded agent tools, Builder timezone setup, and template release 26.
- Added deterministic unit coverage and a guarded non-empty E2E seed containing priorities, deadline risk, a blocked dependency, completed work, owner action, helpful outcome, and checkpoints.
- Passed 52 repository tests, database integration coverage, root typecheck/manifest/capability checks, migration-file validation, both webpack production builds, dependency audit, and diff whitespace checks.
- Confirmed migration 0007 on the linked Preview database and passed all database integration tests against that migrated schema.
- Deployed fresh Vercel Preview `dpl_6pmDdUkKzemZhDTCo7RdSkyuQHBR` at `https://sofie-personal-agent-msp5uuucm-jaydubya818.vercel.app`; Vercel's Turbopack build, typecheck, route generation, capability validation, and Eve schedule compilation completed successfully.
- Qualified authenticated identity/navigation, non-empty Daily Brief and Weekly Review, manual generation, saved checkpoints, owner-local schedule persistence, unavailable-channel explanations, desktop, and mobile deep links in that Preview with no browser console errors.
- Exercised the canonical in-app delivery tick at the owner-local scheduled time, verified the persisted checkpoint and delivery history, replayed the same tick to prove database deduplication, and exercised unavailable Push fallback with the checkpoint preserved and a visible failure reason.

**Migration decision:**
- Migration 0007 is additive except for replacing the prior one-checkpoint-per-owner/kind uniqueness rule with historical period uniqueness. Roll forward after use; do not revert to the old constraint once multiple periods exist.

## Notes

- Explicitly excluded: persistent user-created Agents, scoped memory, Workspace/Projects, general Routines, Agent Groups, Universal Inbox, Relay, Run Explorer, and later roadmap products.
- Carried debt: no repository lint command; 61/62 packaged Skills need current routing evaluations.
