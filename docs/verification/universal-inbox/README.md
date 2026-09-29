> **Superseded-by:** [canonical beta integration dossier](../beta-integration/README.md). Historical evidence below is pinned to frozen source `cf199431588d7bc0e95dd24a7d06b63d3b3cd2bb`; it does not qualify the integrated candidate.

# Universal Inbox evidence dossier — accepted baseline

Superseded-by: [integration-preparation dossier](integration-preparation/README.md). This historical report is pinned to accepted SHA `36675bd5c64fa848b32f7dfbbb349957b5853498`; its source hashes describe that commit, not later working files.

Qualified on 2026-09-27, branch `codex/universal-inbox`, published baseline `d64f2f96003818b2f51341b54a2edd6f426a0dae`.

**Overall: PARTIAL.** Domain/API contracts and local durable fixtures are ready for Beta UI integration. Production database/source wiring and canonical Work continuation are not implemented because their shared ownership is unresolved. No production deployment, external message, provider permission change or database migration was performed.

## Results

PASS below means the implemented local domain/fixture contract passed its checks; it does not qualify live integrations.

| Requested gate | Result | Evidence / boundary |
| --- | --- | --- |
| Universal Inbox | PARTIAL | Domain, service, source adapters, API factory; production store and route unmounted. |
| Needs You | PASS | Explicit owner judgment, expiry, lifecycle and action predicate; UI receives the predicate. |
| Work linkage | PASS | Correlated reference preserved/enriched, bound answer delivered to fixture consumer. Live canonical Work consumer is an integration gate. |
| Correlation | PASS | Relay → decision → answer → result shares one item/episode. |
| Deduplication | PASS | Repeated Relay, email, Slack, webhook, notification and reminder deliveries; conflicting content fails closed. |
| Supersession | PASS | Stale action rejected, queued answer cancelled, terminal episode never reopens. |
| Approval integration | PARTIAL | Canonical decideApproval adapter and authority tests; no mounted production dispatch. |
| Relay fixture | PASS | Actual Envelope type, caller/grant/thread provenance; no Relay backend changed. |
| External source fixtures | PASS | Email, Slack and webhook normalization/dedupe; no live connector qualification. |
| Restart/recovery | PASS | Actual process exits during creation, dedupe, response and settlement; after downstream write/before acknowledgment; restart/replay. Local SQLite only. |
| Cross-owner disclosures | 0 | Read, list, mutation, response and evidence checks; actual production source revocation remains unqualified. |
| Avoidable coordination debt | 0 | Golden Journey: 1 necessary intervention, 0 avoidable requests; internal progress events suppressed. |
| Typecheck | PASS | Full root command; includes capability, skill-routing and executor governance checks. |
| Build | PASS | Full root command; both packages successful. |
| README updated | PASS | Root README plus domain, Needs You, architecture, schema gate and UI contract docs. |
| Beta UI contract | READY | Versioned generated JSON fixtures and unmounted authenticated handler factory. |

## Verification

- [Test log](tests.log): **82 tests passed**: 32 Inbox tests, 5 existing approval tests, 45 existing Relay adapter tests.
- [Typecheck log](typecheck.log): both packages successful; 589 governed sources, UNKNOWN=0.
- [Build log](build.log): both packages successful. Saved logs normalize terminal carriage returns/trailing spaces only.
- [Fixture data](beta-fixtures.json): synthetic Inbox, Needs You, waiting, empty and error states.
- [Performance measurements](performance.json): 2,000 seeded items plus 100 samples per operation, file-backed SQLite WAL, 50-item query pages.
- [Worktree inventory](worktree-inventory.json): SHAs, dirty states and migration ownership; no unrelated changes imported.
- [Source manifest](source-manifest.json): SHA-256 of qualified source/docs, independent of this report's commit identity.

## Performance (milliseconds)

These numbers measure local fixture storage and process code, not Neon, network, production load or deployment durability.

| Operation | p50 | p95 |
| --- | ---: | ---: |
| creation | 0.111 | 0.141 |
| dedupe | 0.067 | 0.096 |
| inboxLoad | 0.138 | 0.177 |
| needsYouQuery | 0.132 | 0.151 |
| ownerResponse | 0.106 | 0.132 |
| resolution | 0.104 | 0.131 |

## Review and blast radius

All application logic is isolated under `lib/universal-inbox/`. One local qualification script and new documentation/evidence files support reproducible testing. Root README changes are additive. The shared executor inventory gains exactly nine entries, one for each new non-test inbox source; existing classifications and hashes are unchanged. The protected verifier, migration registry, execution routing, Gate B/C, Factory adapter, writer custody, Memory/Knowledge, Relay backend and Beta UI presentation files are untouched.

Review found and covered: response/item atomicity, callback acknowledgment after crash, source ID content conflicts, cross-owner requests, stale read revisions, canonical approval hash/status rejection, pending-response cancellation, API body limits, Work linkage after initial intake, frozen response Work context and immutable closed episodes. Existing source authentication and downstream authority are never replaced by a peer message or an Inbox response.

## Release gates still open

1. Coordinate with Digital Worker migration owner and implement a production `AttentionRepository` with owner-scoped indexes, unique constraints and atomic transactions.
2. Integrate an owner-scoped canonical Work consumer that durably deduplicates `response.id`, rechecks action/generation and records answer/context before continuing Work.
3. Connect admitted source events and source entitlement/revocation reconciliation. No current module polls or reads live providers.
4. Wire existing follow-up/schedule and notification machinery; the Inbox does not create a second scheduler or delivery system.
5. Mount the authenticated API only with qualified production storage/consumers, then run the crash/isolation/Golden Journey suite against the actual database/runtime.

The fixture store must never be used as serverless production persistence. Pending handoff is at-least-once; no exactly-once claim is made for a consumer that lacks durable deduplication. Supersession cannot by itself revoke a consumer already in flight; current canonical authority must be checked downstream.

## Sources consulted

Repository contracts: `apps/eve/AGENTS.md`, `lib/approvals.ts`, `lib/control-center.ts`, `lib/relay/transport.ts`, `lib/relay/inbox.ts`, `lib/relay/owner/contracts.ts`, `lib/relay/owner/snapshot.ts`, `lib/execution-delivery.ts`, `lib/routine-notifications.ts`, `agent/lib/reminders-db.ts`, migrations 0001/0003 and the active shared schema ownership.

Installed Eve documentation: `docs/README.md`, `tools/human-in-the-loop.md`, `concepts/state.md`, `schedules.mdx`. Fixture storage API: [Node v24.18.1 SQLite documentation](https://nodejs.org/download/release/v24.18.1/docs/api/sqlite.html).
