# Persistent Agent Groups — schema and canonical integration proposal

Status: PROPOSED, NOT MIGRATED. No migration number allocated. Preserve concurrent Q37/MyFactory/Environment Fabric ownership. This is not a Group runtime implementation.

## Existing source constraints

- Persistent identities exist in agents, keyed by owner and ID. Roles/templates are not independent agents.
- myeve_relay_connections currently has owner_id as its primary key and one local_agent_id. A local Group must not pretend every specialist is this registered sender.
- Relay envelopes/submissions already retain sender, target, capability, resource, conversationId, idempotencyKey, expiresAt and replyTo. Reuse these fields and existing exact permission checks.
- Shared rooms currently have no persisted membership/objective model. Relay conversation IDs alone do not create Groups.
- Goal/Work/Result/artifact/Memory owners remain canonical. A Group holds authorized references, not copies of private records or combined capability grants.

## Proposed records

| Record | Required fields and constraints |
| --- | --- |
| agent_groups | group ID; owner/business scope; name; objective; coordinator agent reference; status; version; created/updated. Unique identity in scope. Personal is the initial default. Business groups require existing BusinessScopes authorization. |
| agent_group_members | scope + Group + canonical agent identity; coordinator/member/reviewer; member revision; active/revoked; timestamps. Agent scope and Group access checked independently; exactly one active coordinator. No tools, credentials or inherited grants. |
| agent_group_links | scope + Group + kind (Goal/Work/Result/artifact/conversation) + canonical reference/revision; sharing decision/reference; revoked_at. Resolve through source authorization on every read; no arbitrary URLs or copied contents. |
| agent_group_handoffs | Group version/member revision; canonical Relay sender/recipient identities; conversation/request/reply IDs; bounded approved context digest/references; status. Unique Relay request ID in scope; reply must reference a known matching request. No separate transport queue. |
| agent_group_audit | owner/business scope; actor; Group/version; creation/membership/delegation/sharing/revocation/synthesis event; canonical evidence references. Append only. |

Keep migration allocation with the shared-schema integration owner. Product APIs should call canonical Group repository contracts after that schema is accepted; do not store Groups in preferences, chat prose, Memory or a second filesystem registry.

## Required canonical adapter contracts

1. Resolve each member's persistent local identity to its own qualified Relay identity. Missing mapping returns WAITING_FOR_CANONICAL_Q37, never substitutes Sofie.
2. Validate current Group membership, actor scope and source access; then call the existing Relay permission/action pipeline for the specific recipient and bounded payload.
3. Revalidate membership and grants before send/receive; revocation invalidates queued authority. Group membership alone never authorizes a capability.
4. Retain Relay request/correlation and a separately owned Work/Result reference. Duplicate delivery reuses the same identity. Timeout/uncertain outcome enters canonical recovery, never blind resend.
5. Synthesis runs as Sofie over explicitly shared bounded Results. Private Memory, raw conversation history and capability grants are not concatenated into context.
6. UI can present objective, members/roles, concise activity, Results and Needs You only from those records. Advanced exposes provenance and canonical transport evidence.

## Qualification required before enabling Groups

Real Researcher → Result → Relay → independently identified Software Engineer → response → Sofie synthesis. Verify membership/revision revocation, duplicate request/reply, owner/business/cross-Group scope, private Memory exclusion, recipient identity and capability denial. Deterministic results do not satisfy real-agent or live Relay gates. Independently deployed MyEve A/B and registered external peers remain separate canaries.

No Muse/GrokBots-specific branch logic. No cloud placement or MyFactory producer code belongs in this adapter.
