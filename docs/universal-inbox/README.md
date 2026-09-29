# Universal Inbox and Needs You

Sofie watches the work. The owner looks at what needs them.

INBOX DOMAIN: LOCALLY QUALIFIED. NEEDS YOU: LOCALLY QUALIFIED. BETA UI CONTRACT: READY.
CANONICAL DATABASE ACTIVATION: INTEGRATION PENDING. LIVE INGESTION: NOT_RUN. CANONICAL WORK CONTINUATION: INTEGRATION PENDING.

The [integration-preparation tranche](../verification/universal-inbox/integration-preparation/README.md) supersedes the initial handoff at accepted commit `36675bd5c64fa848b32f7dfbbb349957b5853498`. An unnumbered PostgreSQL candidate and pool adapter are now locally qualified, but neither is activated. This is not a production-ready inbox.

## Scope and baseline

Branch: `codex/universal-inbox`. Baseline: published `origin/main` at `d64f2f96003818b2f51341b54a2edd6f426a0dae`. At inspection local main was `a7936898c77d157aa66c222b86aedce07e265e16`, diverging by 1 local/44 remote commits, with unrelated edits. See the [worktree inventory](../verification/universal-inbox/worktree-inventory.json).

Digital Worker owns the dirty shared `database-schema.ts`, migration `0057_factory_preparation_intent.sql`, and Work/Factory integration. No shared migration was added, no database was migrated, and no existing execution, Relay, reminder, notification, Memory, Knowledge, or presentation source was changed. Only this module's entries are added to the required executor inventory; the verifier is unchanged.

## Existing primitives and boundaries

| Existing surface | Source of truth | Inbox relationship |
| --- | --- | --- |
| Agent/owner inbox | `lib/control-center.ts`, `lib/control-center-types.ts` | Existing run status and pending-approval projections; do not equate every waiting/failure status with Needs You. |
| Approvals | `lib/approvals.ts`, `task_approval_decisions` | Project canonical prompt, effect, scope, hash and expiry; decisions delegate to `decideApproval`. |
| Relay incoming messages | `lib/relay/inbox.ts`, `lib/relay/transport.ts`, `myeve_relay_requests` | Normalize already admitted message envelopes; no polling, signing, permission change, reply or peer-state access. |
| Relay owner execution | `lib/relay/owner/contracts.ts`, `snapshot.ts`, `control.ts` | Preserve canonical Work/pending references; execution and recovery remain with their owner. |
| Goals/tasks and activity | `lib/goals.ts`, `lib/task-runs.ts`, `eve_events` | Preserve references. The append-only event timeline is not repurposed as a mutable inbox database. |
| Work blockers/results | Digital Worker integration; published `task_runs`/control center | Inject a canonical owner-scoped Work consumer; no second Work table or state machine. |
| Reminders/scheduled work | `agent/lib/reminders-db.ts`, `agent/schedules/reminders.ts`, `lib/reminder-execution.ts` | Normalize the existing occurrence ID and scheduled timestamp. No new scheduler. |
| Notifications and delivery | `lib/execution-delivery.ts`, `lib/routine-notifications.ts`, `review_deliveries` | Existing delivery authority remains canonical. Inbox READ/UNREAD is presentation state, not an external delivery engine. |
| Webhooks/connected apps | `agent/channels/hooks.ts`, `agent/schedules/email.ts`, existing connectors | Fixture normalization only. Authentication, ownership and permissions must precede ingestion. |

## Implementation map

`apps/eve/lib/universal-inbox/` contains:

- `contracts.ts`: versioned, strict normalized events, source evidence, items and owner responses.
- `domain.ts`: identities, lifecycle, Needs You predicate, deterministic priority and presentation actions.
- `repository.ts`: atomic storage boundary for items, evidence and response intents.
- `service.ts`: dedupe, ingest, read/unread, dismissal, owner responses and downstream acknowledgment.
- `adapters.ts`: Relay, external message, canonical approval, existing reminder occurrence and Work projections.
- `approval-consumer.ts`: exact canonical approval delegation and replay reconciliation.
- `api.ts`: unmounted authenticated HTTP handler factory, with bounded pages and request bodies.
- `fixture-repository.ts`: SQLite fixture implementation for transaction/process-restart qualification only.
- `fixtures.ts`: deterministic server-side fixture adapter.

The SQLite store is not an alternate production persistence architecture. It is local fixture infrastructure that makes rollback, restart and interleaving failures testable while migration ownership is blocked. It must not be mounted on production routes. One repository instance per fixture process serializes operations; production needs a connection-per-transaction adapter and database locks.

## Attention contract

`myeve.attention.v1` supports MESSAGE, REQUEST, DECISION, APPROVAL, BLOCKER, FOLLOW_UP, REMINDER, RESULT and EXCEPTION. The owner is supplied by the authenticated service context, never the JSON body.

Item identity is a SHA-256 digest of `[ownerId, correlationId, episode]`. Source evidence identity is a digest of `[ownerId, system, accountId, eventId]`. Never correlate by subject text or another peer's untrusted correlation claim. A trusted local mapping supplies `correlationId`, `workId`, and the stable monotonic `sequence` for the correlated stream. Source adapters need an owner-scoped mapping from source account/thread to local Work before production integration.

A trusted later event may attach Work to an initially unlinked message. An existing non-null Work link cannot change or be erased. Once an owner response is recorded, a previously absent Work link cannot be attached to that response episode; the canonical context must be established before asking the owner.

A source ID replay with identical content increments an evidence delivery count, preserves read/response state and creates no new item. Reusing the same source ID for different normalized content fails with `SOURCE_EVENT_ID_CONFLICT`. Distinct stale events are retained as evidence but cannot overwrite newer state. Independent provider events must be assigned a canonical ordering by the adapter; arrival timestamps are not sufficient.

A correlated episode contains at most one action binding/owner response. Changing the requested action requires explicitly superseding the old episode and opening a new episode. A new episode alone does not automatically supersede another. This prevents silent replacement of a displayed approval. Resolved, dismissed and superseded episodes never become actionable again. A later Result can update a resolved episode as an unread informational result.

Source content is untrusted display data. Evidence retains source references, sender, account, event/time, thread, grant provenance and attachment references. No attachment is fetched, no reply is sent, and no access grant is inferred. Raw sensitive provider evidence remains in the source-owned store; UI must render text safely and use source-authorized handlers for references.

## Lifecycle and follow-up

| State | Meaning |
| --- | --- |
| NEW | Informational item not yet read. |
| SEEN | Informational item marked read. |
| NEEDS_ACTION | Explicit owner judgment pending; expiry still checked at read/action time. |
| WAITING | Sofie/external party owns the next step, or an owner answer awaits canonical acknowledgment. |
| RESOLVED | Canonical consumer acknowledged the answer, or a newer source event explicitly settled the episode. |
| DISMISSED | Owner dismissed an informational item. Required/pending actions cannot be dismissed. |
| SUPERSEDED | A newer source event made the request irrelevant. Pending local response is cancelled. |

Read/unread is independent of lifecycle. Reading a decision does not answer it. Follow-ups carry `followUpAt`; the existing schedule/Work owner must arrange the wakeup. The adapter neither schedules nor promises a wakeup itself. A future reminder is not projected until its canonical occurrence is due. Recurring occurrences use distinct source IDs.

## Owner response and continuation

The UI submits the item revision, action ID, binding hash, stable idempotency key and answer. The service checks owner, current revision, expiry and allowed choices. Response intent and the WAITING state commit in one transaction. Retries with the same key return the same response; changing its answer fails. Another key cannot create a second response for the same episode.

`deliver(consumer)` passes the persisted response, owner, Work reference and provenance to the canonical consumer. The consumer must atomically validate current Work/action authority and deduplicate by `response.id`. Only its durable receipt resolves the item. A crash after the canonical write but before the local acknowledgment replays the same ID. This is an at-least-once handoff with an idempotent canonical receiver, **not** an exactly-once guarantee for an arbitrary callback.

Supersession cancels queued responses. A consumer already in flight must recheck canonical generation/authority: an inbox-side check alone cannot revoke an external side effect. The consumer may accept an answer as context; it must never interpret receipt as general execution authority.

Approval handling calls the existing `decideApproval` with owner, exact ID/hash, approved/denied choice and response provenance. Interrupted writes are reconciled by reading canonical status. Expired, invalidated, changed or contrary decisions fail closed. The integration composition requires the approval owner to supply an exact owner-scoped effective-state read. The earlier 100-row list fallback is superseded; historical replay cannot depend on list position. No new approval store or execution grant exists here.

## Priority and queries

Ranking uses a documented static score: blocking active Work 10,000; explicit urgent 1,000; owner request 100; dependency count capped at 50; source importance 0–3 multiplied by 10. Ties sort by earliest deadline, then stable ID. Deadlines are compared as normalized UTC timestamps. There is no engagement signal or personal inference.

List pages are bounded to 100 with a keyset cursor. Evidence pages are bounded to 100 with `afterId`. Response polling is bounded to 100. Metrics are offline qualification aggregates, not a request-time production dashboard query. Concurrent priority updates can move rows between pages; clients refresh after a mutation.

## Qualification

```sh
npm ci --ignore-scripts
npm test --workspace=eve-agent -- lib/universal-inbox/inbox.test.ts lib/approvals.test.ts lib/relay/adapter.test.ts
(cd apps/eve && node --import tsx scripts/qualify-universal-inbox.ts)
npm run typecheck
npm run build
```

See [Needs You semantics](needs-you.md), [Beta UI contract](fixture-contract.md), [Digital Worker integration](digital-worker-architecture.md), [schema integration gate](schema-integration.md) and [evidence dossier](../verification/universal-inbox/README.md).

## Integration-preparation additions

- [Canonical persistence dictionary](persistence-contract.md) and [activation package](activation/README.md).
- [Work, Goal, Relay, approval and scheduler dependencies](integration-crosswalk.md).
- [Pinned Beta UI crosswalk](beta-ux-crosswalk.md).
- [Today, Daily Brief, notification and follow-up policies](feeds-and-followups.md).

New isolated sources: admission, provider adapters, generation-bound continuation, durable continuation fixture, Goals adapter, bounded shared queries, feed policy, Beta adapter and PostgreSQL pool adapter. The HTTP factory now requires source visibility authority; feed composition must use `authorizedReader`. No owning backend, canonical execution route or UI component has been modified.
