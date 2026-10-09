# Checkpoint D source policy candidate

Status: PARTIAL. Isolated qualification only.

The canonical Settings and Sofie command persists a monotonically increasing owner revision and a frozen receiver set. It then attempts signed delivery outside the database transaction. Exact signed receiver acknowledgments complete propagation. A lost response retries the same persisted envelope and command. A newer owner command may supersede pending delivery; an old acknowledgment cannot complete that newer revision.

Apply `migration.sql`, `enforcement.sql`, `decisions.sql`, and `ordering.sql` only in a disposable qualification database. Runtime roles require the existing restricted privileges plus SELECT on the ordering tables and INSERT/UPDATE on policy_deliveries and policy_changes for the coordinator. Keep policy_destinations administrative. Do not grant runtime writes to enrollment, evidence, installation or platform-owner binding tables.

The optional server-only `MYEVE_CAPABILITY_PROPAGATION_JSON` contains a synthetic P-256 signer and a trusted Relay endpoint. Configuration alone grants no execution authority. A missing receiver or acknowledgment leaves PENDING_PROPAGATION. Settings and Sofie can replay the pending canonical command. Pending pause/revoke never means the resource stopped.

Run `node --import tsx scripts/qualify-capability-control.mjs --browser` from apps/eve. The test creates a disposable PostgreSQL cluster, synthetic identities and a local Next server. No paid provider is invoked.

Remaining gates: composed MyEve→Relay→MissionControl journey, backend-generated challenge endpoint and runtime admission integration, lifecycle acknowledgments, restore/incarnation recovery, and actual platform-owner identity binding. The required real records are the canonical authentication subject, administrative role record, membership record, and intended isolated installation identity and organization. No email-based privilege or duplicate account is introduced.
