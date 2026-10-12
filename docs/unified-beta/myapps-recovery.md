# Recover one stranded MyApps RUNNING operation

This is an operator procedure for a process crash after a durable RUNNING journal entry. It does not retry the operation, recover candidate output, grant installation authority, alter Factory accounting or clear UNKNOWN. Real installation access and cleanup use the existing explicit operator authorization. The application has no endpoint for this procedure.

## Establish the exact incident

Use the authorized operator connection and owner RLS context to read the exact `myapps_receipts` row and its `myapps_installations` row. Save the owner, app, receipt ID, request hash, response operation UUID, source/runtime identity and data revision in a private incident record. Do not export task data into public logs. If the receipt is COMPLETED, the commit succeeded: leave it unchanged and recover the existing response. If it is UNKNOWN, stop here; this procedure cannot resolve it. A missing or conflicting record also stops recovery.

Stop every process capable of operating this installation and verify termination using the installation's approved host controls. Record the exact process/deployment identities and timestamps. A paused UI alone is insufficient: an already running worker could still commit. Keep the host stopped through recovery. Preserve the database snapshot before changing a receipt.

## Confirm local cleanup

The operation UUID must match the journal exactly. The only owned container name is `myapps-alpha-<operation UUID>`, its expected label is `myapps.operation=<operation UUID>`, and the staging directory prefix in that host's actual OS temporary directory is the same container name followed by `-`.

```sh
docker inspect "myapps-alpha-$operation"
# Only if that exact object's label and mounts match the incident:
docker rm --force "myapps-alpha-$operation"
docker inspect "myapps-alpha-$operation"
```

The last command must report that exact object absent. An unavailable Docker daemon, permission error, unexpected label/mount, another host or ambiguous response is not absence. Leave RUNNING held and record the unresolved incident.

Inspect only the exact matching staging directories on the original host. Match their candidate/harness mounts and source identity with the incident before removing them using the approved cleanup action. Verify each exact directory absent afterward. Never use a wildcard removal, prune other containers, or treat an empty list from another host as cleanup. The candidate's internal timeout is not cleanup evidence.

Record host termination, exact container absence, exact staging absence, the original receipt/request identity, current database readback and the operator authorization reference in the private incident evidence file. Hash the completed file with SHA-256. Obtain the existing recovery authorization for this exact incident if it is not already covered. Do not place credentials in the evidence file.

## Record a known failure atomically

Only a still-RUNNING receipt with confirmed cleanup and no committed result is eligible. `scripts/unified-beta/recover-myapps-running.sql` takes the same owner advisory lock as the application, locks the exact receipt, rejects COMPLETED/UNKNOWN/stale or mismatched input, appends the prior response and evidence digest to immutable audit history, and changes the receipt to DENIED. The operator needs only SELECT on installation state; it must not receive UPDATE on installation owner or state. The shared advisory lock serializes application state changes and the script verifies that installation state remains unchanged. It never updates task data, app state, approvals, canonical Work or accounting.

Both preview and task-operation success commits require the original receipt to remain RUNNING with its exact operation UUID. If recovery, UNKNOWN or a replacement has fenced that worker, the entire late transaction rolls back, including preview records, task data, revisions and audit. Keep the process-quiescence prerequisite even with this database fence.

Supply the connection through the approved private `PGSERVICE`/credential mechanism, not a password-bearing command argument. The variables below come from the exact incident record; they are not examples of installation identities.

```sh
psql -X -v ON_ERROR_STOP=1 \
  -v owner="$owner" -v app="$app" -v receipt="$receipt" \
  -v operation="$operation" -v request_hash="$request_hash" \
  -v evidence_sha256="$evidence_sha256" -v authorization="$authorization" \
  -f scripts/unified-beta/recover-myapps-running.sql
```

On any error, rollback/disconnect and preserve the hold. Never edit the script to bypass a failed binding check. Re-read the exact receipt and audit entry; confirm the installation/data are byte-equivalent to the saved database state. Store that post-recovery readback with the incident.

Only then resume the approved host configuration. The original request ID continues to return DENIED and will not execute again. The owner may choose a new operation after current authorization checks pass. If any other RUNNING/UNKNOWN receipt remains, the app stays blocked. This procedure does not renew the policy window or clear owner-wide accounting exposure.
