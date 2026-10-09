# Relay × Composio receiving handoff — engineering candidate

The canonical ordering wire remains `4b198d32e1dcdc930c2658291906ebf72601e144596f3090202a3e7ee708d606`. Relay's provider-neutral receiving implementation is published at `7ecb33bc2aa87faad312654bace8152562c63efd` and preserved by security candidate `d687b41fcbb420b00561696eb43778627a1b91c8`.

Entry points: `lib/v2/native-admission.ts::admitNativeCommand` and `receiveNativeControl`. File SHA-256: `f3460a6c1e2042f57586e14516e0697fe2bd3efcda12dff2680c48e904fedb6a`. Native action material is `relay.native-action.v1`; durable receipt is `relay.native-admission.v1`. Lifecycle observation is `capability-control.lifecycle.v1`, signed by the enrolled receiver and accepted by MyEve's exact frozen destination/sequence checks. These names identify engineering contracts, not an activated external endpoint or grant.

## Integration requirements

Use the existing `connected-apps` capability and canonical policy, workload, lease, approval and reservation machinery. Supply a trusted server-side `NativeReceivingHost` whose callbacks read the existing authoritative records under Relay's account lock and commit the existing native command. Owner/account/organization/installation/agent/runtime/task/workload/Work/Mission/generation, connection authority version, descriptor, arguments and target must match exactly. The host must validate and execute the same server-resolved descriptor; caller-supplied hashes alone are insufficient.

The source Work-to-Mission mapping must come from authenticated canonical records. MyEve's existing engineering_work owner/generation records do not by themselves establish a Mission or receiver installation. No synthetic Mission, email-based privilege, duplicate identity or reused MissionControl enrollment is an acceptable substitute. The receiver must also supply durable authenticated policy heads and an independently retained witness that survives its database restore.

The reserved `capabilityAdmissionDigest` field participates in canonical Relay action binding but must be excluded from provider argument material and the source digest's circular self-reference. The consumer's frozen Checkpoint 4 argument equality needs its owning workstream to adopt this separation alongside remoteAdmission. Do not copy this field into provider arguments or silently strip arbitrary fields.

Admission's linearization point is the existing Relay transaction commit: native command, approval consumption, one online lease call, reservation binding, audit and immutable receipt all commit or roll back. No provider dispatch occurs in the callback. The native worker must subsequently claim that same command under its writer fence; a historical receipt never grants another dispatch. UNKNOWN effects preserve reservations and cannot be retried without authoritative reconciliation.

The engineering adapter permits bounded READ with a canonical CONNECTOR_CALLS reservation and zero monetary source authority. It refuses monetary dimensions and nonzero source budget until exact price/currency/reservation mapping is qualified. This restriction does not change spending ceilings or treat free fixtures as unrestricted execution.

## Qualified evidence and limits

Real PostgreSQL component coverage includes successful synthetic native admission, changed validly signed descriptor/arguments/target rejection, exact owner/installation/Work/runtime checks, atomic rollback, concurrency and retry, stale independent heads, expiration during the host transaction, connection revocation, targeted writer/lease controls and truthful incomplete cleanup. Relay's full security-qualified suite has 524 passing tests and six explicitly live-gated skips. Independent review of admission integrity and transaction expiry findings is resolved.

Actual external receiving admission and authenticated source-native Work mapping remain BLOCKED. No approved nonproduction backend enrollment, canonical administrative owner/installation mapping or actual host/native worker adapter was found in the inspected capability candidates and consumer handoff records. Existing preview deployment names are not an installation authorization.

The consumer sources `84b02ee17fc4e285f337f89ee58bb689aa8c21b1` and its locally inspected successor `63ede56c41041855dab6de1379f0313ccbf26760` were read only. No Relay × Composio source, connection, credentials, paid model operation or external execution was modified or activated. Their existing denial remains required until the designated host is enrolled and positively qualified with authoritative native records and recovery/resource-stop evidence.
