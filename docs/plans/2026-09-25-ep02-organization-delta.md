# EP02: exact remaining organization/identity delta

Golden Work is personal/internal dogfood. The current web login proves possession of one deployment owner's shared secret; it does not establish individual business identity, membership or organization authority. This must be replaced for design-partner Alpha without changing the ownership of existing personal data.

| Required change | Current implementation | Completion test |
|---|---|---|
| Business identity | Shared owner session | Verified issuer/audience/subject, signed session, expiry, logout and revocation; forged/foreign/expired sessions denied |
| Individual principal | Deployment owner string | Stable human identity separate from organization ID and Agent ID; audit actor cannot be supplied by model or request body |
| Organization/membership | Work supports scope ID/kind structurally; API emits only personal scope | Organizations and memberships with active/revoked status; unique identity/provider bindings; no implicit organization from email domain |
| Roles | No organization role enforcement | Owner/admin/member/viewer or a smaller explicitly approved role set; deny-by-default matrix for admission, profile edits, approvals, takeover, Results and exports |
| Current membership checks | Owner cookie and Work generation | Revalidate active membership before admission, broker reservations, publication, decision and sensitive reads; revoke running authority on removal |
| Repository installation | Trusted local credential and exact fixture profile | Organization-bound GitHub App installation/repository grants, least required permissions, installation/repository removal handling; no org-admin token in executor |
| Agent ownership | Dogfood primary Agent owned by deployment owner | Organization-owned Agents with explicit grants; personal/organization mode is visible and cannot be switched through prompt content |
| Organization Work access | Principal is personal only | Every Work/Run/candidate/evidence/effect/decision/Result/resource lookup and uniqueness constraint includes scope; cross-organization ID substitution denied |
| Approval authority | Exact personal owner decision | Individual approver plus active organization/repository authority, exact candidate/policy binding, expiry and revocation; optional separation of duties explicitly decided |
| Credential custody | Host-only local worker secrets | Organization-bound secret references, rotation/revocation, no credential values in records/prompts/artifacts; provider tokens unavailable in executor/verifier |
| Budget authority | Per-Work reservations | Organization budget reservations plus Work/attempt limits, concurrency-safe aggregation, unknown-spend policy and revocation; members cannot raise ceilings silently |
| Personal data separation | Personal export excludes organization scope | Organization content excluded from personal chat/memory/export/deletion; member offboarding preserves corporate Work and immutable evidence |
| Retention/export | Work history and candidates stored in SQL snapshots | Organization retention policy, artifact encryption/access logs, verified export and deletion rules preserving required audit records; restore never recreates live authority |
| Background authority | Local dogfood worker only | Hosted durable worker identity, organization binding, idempotent event intake, restart recovery and bounded resource cleanup; no dependence on a human browser session |
| UI identity context | One personal workspace | Clear organization and individual actor, role-aware controls, membership error/revocation states, approvals attributed to the actual human |

## Implementation order

1. Select the business identity provider and explicit organization role policy. These are product/account decisions, not prerequisites for internal Golden Work.
2. Add organization, membership and repository-installation records with migration/concurrency tests. Bind external identities by immutable provider IDs.
3. Introduce a server-resolved organization principal. Centralize current membership/repository/Agent authority checks and use them in every consequential path.
4. Add organization ownership to Agents and their data-access paths; qualify personal/organization separation and offboarding before enabling organization admission.
5. Extend reservations, decisions, resources, artifact access and event reconciliation with organization authority and revocation generations.
6. Implement and test organization-aware UI/session transitions. Run two-organization adversarial tests with identical human display names, foreign IDs, revoked memberships and installation removal.
7. Qualify the hosted no-babysitting path with individual identities and retained audit evidence before inviting a design partner.

## Alpha release condition

All rows above need evidence. Passing a personal-owner Golden Work, adding an organization selector, or storing an `organization_id` alone does not establish organization isolation or external Alpha readiness. No existing personal data should be silently reclassified as corporate data.
