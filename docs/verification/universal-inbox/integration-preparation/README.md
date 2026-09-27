> **Superseded-by:** [canonical beta integration dossier](../../beta-integration/README.md). Historical evidence below is pinned to frozen source `cf199431588d7bc0e95dd24a7d06b63d3b3cd2bb`; it does not qualify the integrated candidate.

# Universal Inbox integration-preparation evidence

**Overall: READY_FOR_INTEGRATION.** Qualification covers the local domain, isolated contracts, and a disposable PostgreSQL database. Production activation remains pending. Branch: `codex/universal-inbox`. Accepted ancestor: `36675bd5c64fa848b32f7dfbbb349957b5853498`.

Supersedes: the [accepted baseline report](../README.md) for current implementation status. Its original artifacts remain historical evidence at the accepted SHA. The commit containing this dossier is the integration-preparation candidate; [source-manifest.json](source-manifest.json) binds the source and evidence without a self-referential commit hash.

## Status

- INBOX DOMAIN: LOCALLY QUALIFIED
- NEEDS YOU: LOCALLY QUALIFIED
- BETA UI CONTRACT: READY
- CANONICAL DATABASE ACTIVATION: INTEGRATION PENDING
- LIVE INGESTION: NOT_RUN
- CANONICAL WORK CONTINUATION: INTEGRATION PENDING

| Requested gate | Result | Qualification boundary |
| --- | --- | --- |
| Inbox domain | PASS | Owner-scoped lifecycle, stable identity, correlated history, explicit necessary action and immutable terminal episodes. |
| Needs You | PASS | Decisions, clarifications, formal approvals, expiry, blockers, replacement and settlement. |
| Ingestion adapters | PASS | Isolated Relay, AgentMail/email, Gmail metadata, Slack messages/replies, webhooks, reminders, Work and approval fixtures. No live ingestion. |
| Ingestion idempotency | PASS | Stable source identity and content digest; duplicates, reconnect/replay, reordered events and changed-content collisions. |
| Correlation | PASS | Request → external reply → owner decision → fixture continuation → Result remains coherent. |
| Supersession | PASS | Resolved blockers, replaced decisions, expired approvals, reply-cleared reminders and completed Work retain history without actionability. |
| Approval contract | PASS | Exact canonical effective-state read and canonical decide service; Inbox never grants authority. Production composition must inject the exact reader. |
| Work continuation contract | PASS | Owner, response, attention, correlation, Work generation/version and decision provenance validated atomically by a fixture authority. Canonical receiver unimplemented. |
| Stale continuation | PASS | Generation-3 answer after generation 4 records stale history and creates no eligibility. |
| Goals contract | PASS | Structural blocker input and exact DependencySignal output; Goal OS retains reconciliation, dependency and dispatch ownership. |
| Beta UX crosswalk | PASS | Exact pinned candidate inspected and executable projection qualified; ordinary attention requires a new product-owned slot. |
| Today feed | PASS | Bounded necessary-action counts/items, important messages, blocked Work and recent resolutions. |
| Daily Brief feed | PASS | Bounded new actions, unresolved important items, resolutions, replies and due follow-ups. Composition remains product-owned. |
| Relay contract | PASS | Peer request/reply, replay, grant revocation, private evidence, Work correlation and informational defaults. Receipt grants local authority: 0. |
| Coordination debt | 0 | Fixture journeys assert no avoidable owner coordination for internal transitions. |
| Cross-owner disclosures | 0 | Fixture source/API/history isolation and restricted-role PostgreSQL checks. |
| Persistence activation | READY_FOR_INTEGRATION | Exact unnumbered schema, adapter, role/backfill/rollout package prepared; shared database untouched. |
| Live ingestion | NOT_RUN | No provider credentials or live ingestion paths activated. |
| README | PASS | Root and package status, ownership crosswalks, schema package and evidence updated. |

## Reproducible checks

Run from this worktree with dependencies installed:

```sh
npm test --workspace=eve-agent -- lib/universal-inbox lib/approvals.test.ts lib/relay/adapter.test.ts
npm run typecheck
npm run build
cd apps/eve
node scripts/qualify-inbox-postgres.mjs
node scripts/qualify-inbox-crosswalk.mjs
node scripts/qualify-inbox-integration.ts
```

- [Tests](tests.log): **130 passed**: 32 baseline Inbox, 48 integration, 5 canonical approval and 45 existing Relay adapter tests. Process-loss tests launch real child processes around ingestion, persistence, correlation/Needs You, response/continuation and settlement/notification policy. Durable replay causes zero duplicate consequential owner actions in the tested journeys.
- [Typecheck](typecheck.log): both packages pass; executor governance classifies 598 sources, UNKNOWN=0. [Build](build.log): both packages pass. Captured logs trim terminal carriage returns/trailing whitespace only.
- [PostgreSQL results](postgres.json), [run log](postgres.log): disposable PostgreSQL 17, private Unix socket, TCP disabled, no production environment lookup. Apply/transaction rollback; restricted roles and FORCE RLS; cross-owner source IDs and writes; immutable historical answers and terminal states; 16 concurrent ingress retries and 16 response retries. Zero duplicate consequential responses and zero disclosures. Cluster removed after qualification.
- [Crosswalk results](crosswalk.json), [run log](crosswalk.log): executable projection from Beta `ed0f6b5dad0e3a131a9f5332139e627245cbd4e8` and Goals mapper from `b9b46c41480f0859d44683346bd24d7ce9f2b7c9`, with source hashes. Their files were read via git, never edited. Other inspected Work contract pin: `21973e5bf646ceec4c68dc90625ff020d405d7a9`.
- [Current joined fixtures](beta-feed-fixtures.json), [generation log](fixtures.log): canonical approval join, proposed additive attention projection, Today and Daily Brief contributions. These do not claim mounted UI/backend compatibility for new ordinary decision cards.
- [Status](status.json), [worktree inventory](worktree-inventory.json), [source manifest](source-manifest.json). Sibling heads have advanced; they are recorded for coordination but are not substitutes for the qualified pins.

PostgreSQL query measurements use 500 seeded rows and 30 samples per operation, with bounded pages. Local p95: Inbox 0.747 ms, Needs You 0.654 ms, Today 1.745 ms, Daily Brief 0.730 ms, Work thread 0.764 ms. These are local qualification measurements, not a production latency/scale guarantee; raw values and an index plan are in postgres.json.

## Scope and integration handoff

Application changes stay inside `apps/eve/lib/universal-inbox/`. Three qualification scripts and package documentation/evidence support the contracts. Root README is additive. The executor inventory changes only Inbox entries and adds nine new non-test Inbox sources; all other entries and the verifier remain unchanged. Protected migrations, schema registry, Work execution, Factory/Gate B/C, Relay backend and Beta presentation have no diff from the accepted ancestor. No merge to main occurred.

The [activation package](../../../universal-inbox/activation/README.md) supplies schema/columns, constraints, indexes, pool requirements, restricted roles, backfill checkpoints, qualification, rollout and preservation-based rollback. It reserves no migration number. The [integration crosswalk](../../../universal-inbox/integration-crosswalk.md), [Beta crosswalk](../../../universal-inbox/beta-ux-crosswalk.md) and [feeds/follow-ups](../../../universal-inbox/feeds-and-followups.md) identify the exact remaining owners and commands.

Remaining activation work belongs to canonical integration: a numbered migration/actual upgrade qualification, production pool/authenticated API composition, exact source admission and entitlement checks, effective approval reader, atomic canonical Work receiver, Goals snapshot reconciliation, existing scheduler/delivery wiring and product data loaders/presentation. Accepted continuation means eligible, not executed. The canonical receiver must revalidate current authority and generation atomically, including concurrent supersession.

Read-time visibility checks inspect retained source history. At 100 evidence records they fail closed until the source owner provides a compact authoritative entitlement summary. Query pages/counts are capped and advertise truncation; current-state feeds are not historical replay. Slack edit/delete/bot variants reject; Gmail consumes fetched metadata only. The PostgreSQL owner transaction lock is intentionally coarse; production contention, Neon transport, deployment recovery, existing-schema upgrades and live provider revocation remain unqualified. No second scheduler, notification sender, approval authority or Goal OS was built.

## Provider/database references

Primary references for adapter and database semantics: [Gmail Message resource](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages), [Slack message events](https://docs.slack.dev/reference/events/message/), [PostgreSQL 17 row security](https://www.postgresql.org/docs/17/ddl-rowsecurity.html). Repository interfaces are pinned above; provider fixture coverage does not qualify live delivery.
