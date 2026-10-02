# Persistent Agent Groups — schema and canonical integration proposal

Status: PROPOSED, NOT MIGRATED. No migration number allocated. Preserve concurrent Q37/MyFactory/Environment Fabric ownership. A Group domain and PostgreSQL repository now implement this proposal in isolated qualification schemas. No production route is enabled before shared-schema acceptance.

## Existing source constraints

- Persistent identities exist in agents, keyed by owner and ID. Roles/templates are not independent agents.
- myeve_relay_connections currently has owner_id as its primary key and one local_agent_id. A local Group must not pretend every specialist is this registered sender.
- Relay envelopes/submissions already retain sender, target, capability, resource, conversationId, idempotencyKey, expiresAt and replyTo. Reuse these fields and existing exact permission checks.
- Shared rooms currently have no persisted membership/objective model. Relay conversation IDs alone do not create Groups.
- Goal/Work/Result/artifact/Memory owners remain canonical. A Group holds authorized references, not copies of private records or combined capability grants.

## Proposed storage

[Unnumbered SQL proposal](agent-groups.sql) and `apps/eve/lib/product/{groups,group-repository}.ts` implement a bounded personal-owner aggregate: at most 12 members, 100 authorized source references and 100 retained Relay handoffs. One `agent_groups` row binds owner, ID, version and validated document. `agent_group_audit` records each accepted revision atomically. Compare-and-swap rejects concurrent/stale updates.

Membership, source references and handoff associations change under one revision. Canonical agent, Work, Result, artifact and Inbox sources remain separate; the document contains references and roles, no copied content, Memory or capability grants. Reads reauthorize references. Needs You is a pointer to canonical Work attention, refreshed from that source; handoff completion cannot settle its decision. Group membership alone never permits an external action.

The smaller aggregate keeps revision validation atomic during this initial bounded personal-owner phase. Business groups, unbounded membership/history and production retention/role policy require canonical shared-schema review. Do not run this proposal against a shared or deployed database or allocate a competing migration number. Tests install it only in an isolated schema of the task-owned disposable PostgreSQL.

## Required canonical adapter contracts

1. Resolve each member's persistent local identity to its own qualified Relay identity. Missing mapping returns WAITING_FOR_DISTINCT_RELAY_IDENTITIES, never substitutes Sofie.
2. Validate current Group membership, actor scope and source access; then call the existing Relay permission/action pipeline for the specific recipient and bounded payload.
3. Revalidate membership and grants before send/receive; revocation invalidates queued authority. Group membership alone never authorizes a capability.
4. Retain Relay request/correlation and a separately owned Work/Result reference. Duplicate delivery reuses the same identity. Timeout/uncertain outcome enters canonical recovery, never blind resend.
5. Synthesis runs as Sofie over explicitly shared bounded Results. Private Memory, raw conversation history and capability grants are not concatenated into context.
6. UI can present objective, members/roles, concise activity, Results and Needs You only from those records. Advanced exposes provenance and canonical transport evidence.

## Qualification required before enabling Groups

Real Researcher → Result → Relay → independently identified Software Engineer → response → Sofie synthesis. Verify membership/revision revocation, duplicate request/reply, owner/business/cross-Group scope, private Memory exclusion, recipient identity and capability denial. Deterministic results do not satisfy real-agent or live Relay gates. Independently deployed MyEve A/B and registered external peers remain separate canaries.

No Muse/GrokBots-specific branch logic. No cloud placement or MyFactory producer code belongs in this adapter.
