# Checkpoint C — Routine lifecycle increment

Status: PARTIAL. Category: DETERMINISTIC. LIVE: NOT_RUN.

## Implemented

The existing versioned Routine configuration can retain a condition, notification policy and stop-on-success instruction. Owner review exposes these fields and requires the observation capability explicitly. No capability grant is inferred from prose. The observation tool reuses the canonical Knowledge actor checks and current execution identity, then retains bounded check evidence in existing Run milestones. Completion retains a result reference even when no notification is sent. A met condition can disable the Routine. Unknown checks notify rather than silently passing.

Existing Routine authoring helpers now require an explicit owner scope. Tools require a direct authenticated owner; inherited and execution identities cannot author unattended authority. Editing retains the existing authority invalidation trigger.

No migration, new scheduler, provider implementation, release-flag change or Environment Fabric modification. No external effect occurred.

## Evidence

- 19 PostgreSQL condition assertions: missing check, quiet retained Result, met/unknown notification, stop, replay, other-owner and expired-claim refusal, legacy completion.
- 12 owner-context/PostgreSQL assertions: authenticated direct owner, service/guest/child denial, scoped list/mutation, pause/resume and edit invalidation.
- 62 focused Vitest regressions pass.
- Full existing execution-reliability PostgreSQL suite passes: duplicate triggers/claims, retries, delivery recovery without rerun, exact approvals, lease loss, recovery races, Relay boundaries, review invalidation and admission. Providers/model are simulated. See execution-reliability-c.log.
- Four production-build browser cases at 1440px and 390px pass. These Routine API responses are deterministic fixtures, not connected API qualification. Two scoped WCAG scans report zero violations.
- Typecheck, capability registry, executor governance and production build pass.
- Screenshots: output/playwright/agent-native/{desktop,390px}-routine-condition.png.

## Remaining gates

Natural prompt → responsible agent → reviewed Routine → actual scheduled execution is NOT_RUN. Distinct scheduled-trigger overlap/coalescing, expiry/max-run stop rules and standalone Routine Result/Work association remain incomplete. Same-trigger deduplication is qualified; it must not be described as cross-trigger coalescing. The release gate remains MUST_REMAIN_DISABLED. Browser/Mac-off CLOUD, real provider observations, notifications and ongoing monitoring are NOT_QUALIFIED.
