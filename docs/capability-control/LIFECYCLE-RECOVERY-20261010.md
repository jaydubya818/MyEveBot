# Lifecycle acknowledgments and restore fencing — isolated engineering

The canonical policy wire remains SHA-256 `4b198d32e1dcdc930c2658291906ebf72601e144596f3090202a3e7ee708d606`. This change adds a separately signed `capability-control.lifecycle.v1` observation; a policy FENCE_ACK still proves only durable policy receipt. Neither receipt grants execution authority.

## Durable lifecycle

MyEve accepts an acknowledgment only from the enrolled receiving key, for the exact owner, organization, installation, frozen backend incarnation/enrollment, policy version/identity, capability and pause/revoke request. Append-only sequence and observation time checks reject stale and conflicting replay. Duplicate delivery is observational. Replacing an enrollment does not substitute for an old backend's cleanup.

Every required frozen backend must report a complete inventory and the operation's terminal state. Pause needs PAUSE_CONFIRMED; revoke needs CLEANUP_CONFIRMED. AUTHORITY_FENCED, STOP_CONFIRMED, STOP_UNKNOWN, STOP_FAILED and incomplete inventory cannot clear revocation. Zero destinations never imply completed cleanup. Owner preference remains disabled until an explicit canonical enable command after completion. That command preserves the original control in audit.previous and does not revive an old lease or approval.

Settings and Sofie retain the same canonical command and idempotency semantics. Settings exposes `Refresh backend acknowledgments` by retrying the original control command. The controller retries authenticated policy propagation and then lifecycle observation; GET remains a durable read. Failed transport leaves the request pending. A subsequent backend confirmation becomes visible through retry/reconnect. Existing admitted Work and UNKNOWN accounting are unchanged by observation or re-enable.

The transport resolves HTTPS or loopback endpoints from trusted installation configuration (`MYEVE_CAPABILITY_PROPAGATION_JSON.lifecycleEndpoints`). It rejects redirects, credentials in URLs and oversized responses. It materializes the original signed control FENCE from existing immutable policy changes even when a later change superseded its first delivery. It selects the latest control for every capability, without a newest-100 history cutoff. Receiving systems must already have that exact control in their authenticated native inventory; polling never applies an invented stop result.

## Additive isolated migration

Apply `migration.sql`, `enforcement.sql`, `decisions.sql`, `ordering.sql`, then the new `lifecycle.sql` with the trusted schema owner in an approved isolated database. Existing candidates already using ordering.sql apply lifecycle.sql once. It adds no execution ledger and rewrites no historical policy, Work, pricing, identity or approval.

Runtime roles need SELECT on the new tables and INSERT on lifecycle_receipts. They must not mutate recovery_enrollments. Lifecycle delivery uses the already required policy_deliveries INSERT rights. No migration is applied automatically and no production grant is issued by this patch. Owner scope RLS and immutable lifecycle history remain enforced.

## Independently retained restore witness

A controller may enroll an owner only after verifying canonical installation and administrative records. Persist `recovery_enrollments(installation_id,owner_id,epoch)` using the privileged controller; initialize a new private witness file with `initializeRecoveryWitness`. The request path never initializes or resets one. Configure both `MYEVE_CAPABILITY_RECOVERY_WITNESS_DIRECTORY` and `MYEVE_CAPABILITY_RECOVERY_EPOCH`; the directory must be private and independently retained outside the restored database/backup.

The witness binds owner revision/preferences/controls/budgets, exact installation, administrative binding, qualification evidence, Relay agent evidence, backend destinations and recovery enrollment. Missing configuration on an enrolled owner, missing/malformed witness, changed epoch, or a restored authority digest fails closed. Development admission always requires a witness. Only explicitly unenrolled synthetic qualification fixtures can operate without one.

Policy changes lock the canonical owner policy and advance/fsync the witness before database commit. A failed or uncertain commit leaves the witness ahead and quarantines the owner; the controller never rolls the witness back. A restart with consistent state proceeds. The backend's SELECT-only policy role continues using the existing privileged lock function, without policy UPDATE privileges.

Privileged authority-input updates must be coordinated by the trusted installation controller under the same canonical lock and requalified monotonically. A mismatch is not repaired by deleting the witness or copying an older backup. Reconciliation requires independently retained authoritative evidence, native Work/UNKNOWN reconciliation and a qualified enrollment/incarnation transition; no generic self-service reset is exposed.

This is not proof against rolling back the database, witness and trusted host configuration together. Receiving backends must retain their own trusted incarnation/fence outside their restored store, quarantine restoration, and reject old consumed-reference authority. Enrollment custody and a complete receiving-backend restore procedure remain mandatory external integration gates.

## Qualification scope

Real disposable PostgreSQL covers duplicate/stale/forged lifecycle receipts, owner/installation/enrollment isolation, HTTP failure and retry, more than 100 later controls, explicit re-enable, controller restart, actual pg_dump/restore behind a revoke witness, removed configuration, privileged evidence changes, SELECT-only admission and crash before database commit. Browser checks cover persisted UNKNOWN/cleanup readback and explicit re-enable in addition to desktop/mobile accessibility and existing controls.

These are synthetic isolated identities. No real platform-owner account, receiving backend, Composio connection, live provider or production installation is enrolled. The Relay native adapter and MissionControl native inventory are separately qualified implementations; their actual receiving enrollment and consumer Work mapping must be designated before external positive admission or resource-stop completion can be claimed.
