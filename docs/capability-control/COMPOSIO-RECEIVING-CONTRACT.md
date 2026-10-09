# Connected-tool receiving admission — Relay × Composio consumer

Consumer source: Relay `84b02ee17fc4e285f337f89ee58bb689aa8c21b1`. Reviewed without changing that branch or activating remote execution. This document adds the consumer to the Capability Control Plane compatibility inventory; it defines required composition of existing authorities, not a new provider-specific authority or registry.

**Qualified contract identity available today: canonical policy ordering wire SHA-256 `4b198d32e1dcdc930c2658291906ebf72601e144596f3090202a3e7ee708d606`. Positive connected-tool receiving transaction: NOT_QUALIFIED; no qualified positive admission receipt/API identity exists to return.**

Source owners: MyEve `9672c7a434e73d8d70c667d0c9bc922eefdb000f` (this follow-up changes only docs/CI pin), Relay `aec9d9adb4c057f4bbd85a3ec27155d14fe6f24b`; MissionControl native receiving reference reconciled at `cb329035850860b62dc59440c881a92e65dea902`. These source pins are not permission to import dependency branches or reuse a MissionControl enrollment for a tool gateway.

## Existing canonical surfaces

- MyEve `packages/capability-enforcement/src/ordering-source.ts::issueBackendOrderedPermit` verifies an enrolled receiver's signed challenge, locks current source policy, requires exact acknowledged destinations/incarnation/enrollment, live policy/agent evidence and a native missionId, and persists idempotent source permits. It does not consume a runtime lease or admit external tool execution.
- Relay `lib/v2/policy/ordering.ts::relayAdmissionPermit` and `lib/v2/leases.ts::issueCapabilityLease(...remoteAdmission)` compose source proof with Relay policy and canonical lease issuance. These are not the final receiving transaction. The Composio branch's retained lease interface lacks that remoteAdmission input; frozen interfaces must be reconciled by their owning workstream rather than copied into a provider adapter.
- MissionControl `convex/lib/capabilityAdmission.ts` revalidates both permits against local policy fences and records consumed references in the native Mission/WorkOrder transaction. It qualifies that native domain only.
- MyEve `withCapabilityAdmission` is a same-database transaction helper; its metadata is not a portable grant. Wrapping a remote Composio request in it would not solve cross-database ordering or lease consumption.
- Consumer `lib/integrations/gateway.ts::requestRead` has durable denial only. `execution-binding.ts::bindExecution` is an integrity check, not authentication, freshness, lease consumption or receiving admission. Keep its executionAvailable:false/NOT_DISPATCHED behavior until the missing transaction is qualified.

## Required integration bindings

Use the existing `connected-apps` registry capability (Relay / integrations.use), its canonical dependencies and `work`; qualify the exact Relay tool-capability mapping separately. Do not register COMPOSIO_PROVIDER/EXTERNAL_READ labels as a competing registry. Non-READ effects remain denied until independently approved and qualified.

| Requirement | Canonical source and receiving check |
| --- | --- |
| Owner/organization/installation | Authenticated MyEve subject, owner/organization membership and installation enrollment mapped to active Relay account/HUMAN owner records. No email privilege or request-body authority. |
| Agent/runtime | Exact agent, runtimeClient, task, workload, harness, delegation lineage and canonical Work generation. Authenticate online runtime and current lease audience/expiry/revocation; do not accept parsed claims alone. |
| Connection | Server-resolved owner/account/agent/installation connection, authorityVersion, ACTIVE lifecycle, toolkit, provider account/auth-config digests, exact scopes/custody. Current connection revoke must fence this admission independently of global preference. |
| Policy | Both current source/Relay identities: owner, organization, installation, backend, incarnation, enrollmentVersion, monotonic version, policyId; registry/agent revisions; exact acknowledged heads. Stale, unavailable, restored or pending policy denies. |
| Descriptor/action | Exact tool slug/version/schema digest and the descriptor actually used for execution; validated arguments, effect, target and canonical ActionIntent. Bind connection, owner/runtime, lease/approval, Work and both policy identities through existing admissionActionDigest over agreed canonical material. |
| Approval/accounting | Canonical owner approval where required; exact action/effect/scope and live lease/budget reservation. A preference, signed PERMIT or FENCE_ACK cannot substitute. Zero provider price does not imply zero liability or unrestricted authority. |

Canonical SignedPolicyMessage stays `{message,keyId,signature}` with P-256, strict parser and the existing30-second challenge/permit limit. Do not add an allow flag or provider fields to that wire. `admissionActionDigest` is bare64-hex; Relay `canonicalHash` uses `sha256:`. Preserve exact serialization; never strip a prefix to pretend the algorithms/material are interchangeable. FENCE_ACK binds an exact durable policy delivery, not tool admission or successful execution.

## Required receiving transaction and recovery

The enrolled receiving backend must compose policy freshness, connection fencing, exact native Work/Attempt identity, online runtime/lease call consumption, required owner approval and budget reservation with a durable native admission/command record. These checks and the command's idempotent commit must share the backend's existing authoritative transaction/locking boundary. No provider request precedes durable admission. A duplicate key with identical authenticated material returns the original receipt; changed material conflicts. Do not introduce a global ledger or distributed transaction.

Dispatch claims the admitted command under the same native writer/revocation rules. Ordinary disable rejects new admission but preserves previously admitted bounded Work. Pause is requested until a qualified checkpoint acknowledges it. Explicit revoke fences applicable commands, leases and writers; only authoritative provider/backend evidence confirms stop or cleanup. Generic account epochs must not revoke unrelated Work.

Crash before commit consumes no durable authority. Crash after admission but before dispatch resumes only the same still-valid admitted command. An ambiguous dispatch or lost response becomes UNKNOWN, retains reservations and evidence, and cannot authorize retry. Reconciliation needs authoritative provider/canonical receipt evidence; policy ACK, queue success or reconnect does not prove an outcome. Restore/incarnation recovery requires an independently retained trusted head; rolling back all stores cannot revive revoked authority.

## Missing inputs and qualification gates

1. Canonical receiving backend enrollment/installation and owning native command transaction/API; no backendId or enrollment is invented here.
2. Authenticated Sofie Work/Mission/Attempt mapping. The current wire requires missionId; no synthetic production Mission or reused MissionControl identity is acceptable.
3. Owner-qualified tool-to-capability/effect mapping and exact action-material serialization vectors, including descriptor, connection and lease/approval identities.
4. Same-backend transaction composition for lease/call debit, budget and command admission, plus targeted connection/policy revoke and UNKNOWN custody/reconciliation.
5. Adversarial real-database evidence for positive synthetic read, owner/agent/installation/connection substitution, descriptor/argument mutation, stale policy, duplicate/lost ACK, concurrent disable/admission, revoke/dispatch, lease expiry, crash at every commit/dispatch boundary and restore rollback. Existing wire compatibility and negative runtime tests do not satisfy this gate.

No positive receiving contract is declared qualified by this document. Keep the consumer closed. A provider-neutral receiving adapter must first be implemented and qualified within the backend's canonical transaction; then supply exact source SHA, transaction entrypoint, receipt schema/digest and passing evidence to this consumer. This remains a dependency blocker, separate from source identity/main reconciliation. No consumer source, credential, grant or remote execution changed.
