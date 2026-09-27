# Production schema gate

No migration is authored or applied in this branch. The active Digital Worker worktree has dirty schema ownership and migration 0057. This follows the request's explicit conflict fallback. Do not choose a competing migration number or embed runtime DDL into the Inbox.

The existing durable `eve_events` ledger is append-only activity; overwriting those events with inbox read state would destroy its semantics. Existing reminders, `review_deliveries`, `task_approval_decisions`, Work and source stores remain their respective authorities. The proposed production adapter adds only attention projection/evidence and owner response intent records after schema ownership is coordinated.

Minimum relational requirements for the future migration:

| Record | Required keys / indexes |
| --- | --- |
| Attention item | `(owner_id,id)` primary key; immutable owner/correlation/episode/Work identity; revision; state/action; score/deadline; owner-scoped list/Needs You indexes. |
| Source evidence | `(owner_id,system,account_id,event_id)` uniqueness; item foreign key including owner; immutable payload digest and reference; delivery count; indexed bounded evidence pagination. |
| Owner response intent | `(owner_id,response_id)` primary key; `(owner_id,item_id)` unique; item foreign key including owner; bound answer/provenance; pending/delivered/cancelled state; indexed owner-scoped pending queue. |

Map `AttentionRepository.transaction` onto real database transactions with row locking or optimistic revision checks and unique constraints. Item creation plus evidence write must be atomic. Answer plus WAITING plus response intent must be atomic. Settlement plus intent cancellation must be atomic. Canonical acknowledgment plus RESOLVED must be atomic. Avoid awaiting a provider while holding an inbox transaction.

The production schema must enforce owner isolation and source-account ownership, bounded indexed queries, durability and backup/retention appropriate to source references. It must preserve revoked-source visibility rules: integration must recheck current source entitlement before serving retained content. The fixture store does not qualify source revocation, Neon row isolation, deployment durability, throughput or retention policy.

Do not mount the public API or schedule its dispatcher until the production adapter and canonical idempotent Work consumer pass the same crash/isolation tests on the actual deployment database. Qualification is presently limited to local SQLite, with a deliberately separate canonical consumer fixture.
