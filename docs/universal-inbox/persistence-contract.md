# Canonical persistence contract

Status: READY_FOR_INTEGRATION as an unmounted, locally qualified candidate. Canonical database activation: INTEGRATION PENDING. Supersedes the schema sketch at accepted commit `36675bd5c64fa848b32f7dfbbb349957b5853498`; that commit and its fixture evidence remain the historical baseline.

The wire version remains `myeve.attention.v1`. Additive fields below default to null/update when parsing an older **event**. Existing Beta field names and response inputs are preserved. An older stored item must be upgraded explicitly before writing to the candidate schema; do not cast missing Work generation into a current generation.

## Persisted item

The candidate uses three relational tables with owner keys, constrained JSONB domain records and stored generated query columns. Full records are defined by `contracts.ts`; the JSONB representation is canonical storage, not a second independently writable projection.

| JSON field | Required type / semantics |
| --- | --- |
| version | Literal `myeve.attention.v1`. |
| id / ownerId | Nonempty string; identity digest of `[ownerId,correlationId,episode]`; immutable. |
| correlationId / episode | Local trusted correlation string; positive integer episode; unique with owner. A replacement is a new episode in the same thread. |
| kind | MESSAGE, REQUEST, DECISION, APPROVAL, BLOCKER, FOLLOW_UP, REMINDER, RESULT or EXCEPTION. |
| status | NEW, SEEN, NEEDS_ACTION, WAITING, RESOLVED, DISMISSED or SUPERSEDED. Closed episodes cannot reopen. |
| workId | Null or canonical Work ID. May attach before response, then frozen; cannot change an existing non-null link. |
| workGeneration / workVersion | Both null or both positive integers. Required by continuation when workId is present. Never inferred from current Work when replaying an old response. |
| goal | Null or `{goalId,taskId,goalGeneration,taskGeneration,dependencyId,reference}`. Existing Goal OS identities, no duplicate Goal state. |
| title / summary | Bounded display text (500/4,000 characters). Untrusted source text is never authority. |
| source | `{system,accountId,eventId,sender,threadId,occurredAt,reference,grantId,attachments,evidence}`. References remain source-owned; source evidence retains earlier provenance. |
| revision / sourceSequence | Positive local item revision; nonnegative stable source-stream sequence. Owner actions compare revision, source updates compare sequence. |
| action / actionBinding | Null or the explicit owner request plus its SHA-256 binding. Includes classification, reason, prompt, choices, expiry, and canonical approval binding only when applicable. |
| createdAt / updatedAt | Normalized UTC timestamp strings. Updated time is not a substitute for resolution time. |
| actionRequiredAt / resolvedAt / supersededAt | Nullable normalized UTC timestamps for semantic transitions and feed windows. |
| lastMessageAt / lastExternalReplyAt | Nullable receipt-time watermarks; source occurrence time remains separately preserved. |
| seenAt / notification | Null or timestamp; READ/UNREAD. Independent of resolution. |
| priority / priorityScore | Explicit deterministic inputs and calculated score; no engagement inference. |
| waitingFor / followUpAt | Nullable external/owner/schedule/provider and canonical schedule target time. No new scheduler. |
| responseId | Null or the durable owner response identity. |

Needs You is derived from status, action classification/reason and current expiry. The database indexes `needs_action` as a candidate flag, then the query checks expiry at read time. No sweeper is needed for correctness of the actionable list.

## Source evidence

`inbox_attention_evidence`: `(owner_id,id)` primary key, owner-qualified item foreign key, and unique `(owner_id,system,account_id,event_id)`. JSON fields: `id,itemId,ownerId,digest,event,receivedAt,deliveries`. ID hashes source identity; digest hashes the complete validated normalized event. A retry changes only the delivery count. Conflicting content with the same source identity is rejected. Earlier events remain evidence even when their sequence cannot change the projection.

## Owner responses

`inbox_attention_responses`: `(owner_id,id)` primary key, unique `(owner_id,item_id)`, owner-qualified item foreign key. ID hashes `[ownerId,idempotencyKey]`; the unhashed client key is not needed for replay. JSON fields: `id,ownerId,itemId,workId,workGeneration,workVersion,correlationId,episode,goal,action,actionBinding,answer,createdAt,status,receipt`.

States: PENDING, DELIVERED, CANCELLED, STALE. Once recorded, the answer and all context are immutable. Only status/receipt may change from PENDING. STALE retains the historical answer and supersedes the local actionable episode; it never makes Work eligible.

## Physical schema and transactions

Exact SQL: [activation/schema.sql](activation/schema.sql). No migration number, registry entry or canonical deployment is included. It was applied and rolled back in a disposable PostgreSQL 17 cluster, then applied for integration tests with a restricted runtime role.

Generated query columns are `status,kind,needs_action,expires_at,score,deadline`. The indexes cover owner/rank pages, Needs You, Work/correlation thread, resolution/reply windows, follow-up due time, source uniqueness, evidence pagination and pending responses. Timestamps are normalized before storage; lifecycle timestamp constraints reject invalid dates/missing resolution timestamps.

`PostgresAttentionRepository` accepts an injected pool; it reads no environment credentials and runs no DDL. Each operation obtains/releases a connection. Transaction-local owner setting drives FORCE RLS. Mutation transactions take one advisory lock per owner, including missing-row inserts, then perform the whole domain transaction. This deliberately coarse first implementation prioritizes replay correctness; measure real contention before narrowing locks. It does not lock while contacting a provider.

Atomic units: item+evidence; supersession+replacement; answer+WAITING+intent; settlement+queued-intent cancellation; acknowledgment+resolution. RLS, unique indexes, owner-qualified foreign keys and history triggers provide independent storage fences. The application remains responsible for exact source admission and canonical authority.
