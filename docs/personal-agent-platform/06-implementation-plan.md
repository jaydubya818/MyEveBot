# Implementation plan

## Decision

Ship Goal Operating System V1 on the existing `feat/sofie-operations-hub` foundation. Extend working systems; do not rewrite chat, QA delegation, automation, memory, or builder deployment.

Non-negotiable: MyEve is multi-owner and multi-agent by design, with single-owner deployments by default. Sofie is the reference agent and Relay is the shared governed capability layer. Follow [Product identity and tenancy](./07-product-identity-and-tenancy.md) in every schema, builder, identity, and capability decision.

## EPIC-00 — Platform architecture audit

- [x] Map current runtime, persistence, auth, execution, provider, UI, builder, and test architecture.
- [x] Classify proposed systems as REUSE, EXTEND, MIGRATE, REPLACE, or NEW.
- [x] Define coherent target, data, capability, execution, and security boundaries.

## EPIC-01 — Bounded capability registry

- [x] Add rich capability definitions while preserving existing section-status callers.
- [x] Register every authored Eve tool plus platform/provider capability families.
- [x] Add discovery, availability, filtering, and objective matching.
- [x] Expand `/api/capabilities` and Manage → System details.
- [x] Add registry completeness validation to CI.
- [x] Add the `goals` builder feature and pruning ownership.

## EPIC-01A — Product identity and tenancy seam

- [x] Establish MyEve → personal agents/Goal OS/Relay as the normative product hierarchy.
- [x] Keep the V1 deployment authentication boundary single-owner and fail-closed.
- [x] Make agent and owner display names builder configuration rather than authorization keys.
- [x] Introduce generic `MYEVE_*` auth identity with backward-compatible `SOFIE_*` aliases.
- [x] Define principal-ready Goal, event, capability, and Relay constraints without building speculative multi-agent orchestration.
- [ ] Add persisted agent identities and Relay grants only with the first real additional-agent flow.

## EPIC-02 — Shared Goal events and contracts

- [x] Add `eve_events` and Goal OS type contracts.
- [x] Add transactional event emission and bounded rationale helpers.
- [x] Define legal Goal and Task transitions.
- [x] Add idempotency and dependency-cycle validation.

## EPIC-03 — Goal OS persistence and APIs

- [x] Add ordered migration for goals, plans, milestones, tasks, dependencies, thread links, events, and QA run links.
- [x] Implement owner-scoped repository operations without runtime DDL.
- [x] Implement progress and deterministic Next Action calculation.
- [x] Add authenticated Goal, milestone, task, dependency, focus, and search APIs.
- [x] Connect Goal events and linked QA runs to Activity.

## EPIC-03A — Agent parity

- [x] Add atomic tools for Goal CRUD and status actions.
- [x] Add milestone and task CRUD tools.
- [x] Add dependency and Focus tools.
- [x] Make current Goals/Focus retrievable on demand without overloading every prompt.
- [x] Associate a web conversation when client context provides a thread ID.
- [x] Register every tool in builder and capability completeness checks.

## EPIC-03B — Goals experience

- [x] Add `/goals` with Focus, Active, Waiting, Blocked, Completed, and Archived views.
- [x] Add focused create/edit and Goal detail components.
- [x] Show success criteria, progress, milestones, tasks, dependencies, next action, related conversations, recent activity, and linked runs.
- [x] Cover loading, empty, error, validation, saving, and success states.
- [x] Add Goals to the shared shell and command palette without turning Manage into a second navigation product.
- [x] Verify desktop, mobile drill-down, keyboard navigation, and accessibility.

## Qualification

- [x] Validate fresh, repeat, and upgrade migrations.
- [x] Pass unit and integration tests.
- [x] Pass `npm run db:migrations:check`.
- [x] Pass `npm run typecheck`.
- [x] Pass `npm run build`.
- [x] Pass local browser qualification with stored desktop/mobile screenshots.
- [x] Demonstrate persistent Goal creation/update/focus through chat and UI.
- [ ] Rerun the three-specialist suite on a fresh isolated Preview before promotion.

## Explicitly deferred

- Daily Brief, weekly review, outcomes, and stalled-goal notifications: V1.1.
- Observations, preferences, improvement proposals, memory hygiene, and versioned skills: V1.2.
- Universal Inbox, Slack, SMS, Voice, knowledge graph, groups, and autonomous skill mutation: later releases.

## Post-deploy monitoring and validation

- Watch API logs for `goal_*_failed`, database constraint failures, and repeated 409 transitions.
- Validate Goal counts and event counts by owner after deploy.
- Healthy signal: each successful mutation has one matching event and Focus never returns a dependency-blocked task.
- Rollback trigger: cross-owner access, duplicate consequential state, migration failure, or Goal/API errors above the existing baseline.
- Validation window: first 24 hours after Preview and production promotion; owner: application maintainer.
