import { signPolicyMessage, type Fence, type PolicyKey, type SignedPolicyMessage } from './ordering-wire.ts';
import type { AdmissionScope, PolicyConnection } from './postgres.ts';
import { lifecycleComplete, verifyLifecycleReceipt, type LifecycleReceipt, type SignedLifecycleReceipt } from './lifecycle-wire.ts';

export async function acknowledgeBackendControl(connection: PolicyConnection, scope: AdmissionScope,
  backendId: string, envelope: SignedLifecycleReceipt) {
  await connection.query("SELECT set_config('myeve.capability_owner',$1,true),set_config('myeve.capability_installation',$2,true)", [scope.ownerId, scope.installationId]);
  await connection.query('SELECT capability_control.lock_admission_policy($1,$2,$3)', [scope.installationId, scope.ownerId, scope.agentId]);
  const [destination] = (await connection.query(`SELECT * FROM capability_control.policy_destinations
    WHERE installation_id=$1 AND owner_id=$2 AND backend_id=$3`, [scope.installationId, scope.ownerId, backendId])).rows;
  if (!destination) throw Error('CAPABILITY_DESTINATION_UNAVAILABLE');
  const [{ now }] = (await connection.query('SELECT floor(extract(epoch FROM clock_timestamp())*1000)::float8 AS now')).rows;
  const receipt = await verifyLifecycleReceipt(envelope, { keyId: destination.key_id, jwk: destination.public_jwk }, Number(now));
  const [change] = (await connection.query(`SELECT * FROM capability_control.policy_changes
    WHERE installation_id=$1 AND owner_id=$2 AND revision=$3`, [scope.installationId, scope.ownerId, receipt.version])).rows;
  if (!change || change.operation !== receipt.operation || change.capability_id !== receipt.capabilityId
    || change.policy_id !== receipt.policyId || change.organization_id !== scope.organizationId
    || receipt.ownerId !== scope.ownerId || receipt.organizationId !== scope.organizationId
    || receipt.installationId !== scope.installationId || receipt.backendId !== backendId)
    throw Error('CAPABILITY_CONTROL_SCOPE');
  const frozen = change.destinations.find((item: { backend_id: string }) => item.backend_id === backendId);
  if (!frozen || frozen.incarnation !== receipt.incarnation || frozen.enrollment_version !== receipt.enrollmentVersion
    || destination.incarnation !== frozen.incarnation || destination.enrollment_version !== frozen.enrollment_version
    || destination.key_id !== frozen.key_id
    || ['kty', 'crv', 'x', 'y'].some(key => destination.public_jwk[key] !== frozen.public_jwk[key]))
    throw Error('CAPABILITY_ENROLLMENT_CHANGED');
  const key = [scope.installationId, scope.ownerId, receipt.version, backendId];
  const [prior] = (await connection.query(`SELECT receipt FROM capability_control.lifecycle_receipts
    WHERE installation_id=$1 AND owner_id=$2 AND revision=$3 AND backend_id=$4 ORDER BY sequence DESC LIMIT 1`, key)).rows;
  if (prior) {
    if (receipt.sequence < prior.receipt.sequence || receipt.observedAt < prior.receipt.observedAt)
      throw Error('CAPABILITY_CONTROL_STALE');
    if (receipt.sequence === prior.receipt.sequence) {
      if (JSON.stringify(receipt) !== JSON.stringify(prior.receipt, Object.keys(receipt)))
        throw Error('CAPABILITY_CONTROL_CONFLICT');
      return receipt;
    }
  }
  await connection.query('INSERT INTO capability_control.lifecycle_receipts VALUES($1,$2,$3,$4,$5,$6,$7)',
    [...key, receipt.sequence, receipt, envelope]);
  return receipt;
}

export type BackendControlAcknowledgment = { requestId: string; revision: number; capabilityId: string; operation: string;
  complete: boolean; backends: { backendId: string; state: string; inventoryComplete: boolean; complete: boolean; receipt: LifecycleReceipt | null }[] };

export async function controlAcknowledgments(connection: PolicyConnection, installationId: string, ownerId: string): Promise<BackendControlAcknowledgment[]> {
  const changes = (await connection.query(`SELECT DISTINCT ON (c.capability_id) c.*,r.request_id FROM capability_control.policy_changes c
    JOIN capability_control.control_requests r USING(installation_id,owner_id,revision)
    WHERE c.installation_id=$1 AND c.owner_id=$2 ORDER BY c.capability_id,c.revision DESC`, [installationId, ownerId])).rows;
  const destinations = (await connection.query('SELECT * FROM capability_control.policy_destinations WHERE installation_id=$1 AND owner_id=$2', [installationId, ownerId])).rows;
  const observations = (await connection.query(`SELECT DISTINCT ON (revision,backend_id) revision,backend_id,receipt
    FROM capability_control.lifecycle_receipts WHERE installation_id=$1 AND owner_id=$2 AND revision=ANY($3::integer[])
    ORDER BY revision,backend_id,sequence DESC`, [installationId, ownerId, changes.map(change => change.revision)])).rows;
  return changes.map(change => {
    const backends = change.destinations.map((destination: { backend_id: string; incarnation: string; enrollment_version: number; key_id: string; public_jwk: Record<string, string> }) => {
      const receipt = observations.find(item => item.revision === change.revision && item.backend_id === destination.backend_id)?.receipt as LifecycleReceipt | undefined;
      const current = destinations.find(item => item.backend_id === destination.backend_id);
      const enrolled = current && current.incarnation === destination.incarnation && current.enrollment_version === destination.enrollment_version
        && current.key_id === destination.key_id && ['kty', 'crv', 'x', 'y'].every(key => current.public_jwk[key] === destination.public_jwk[key]);
      return { backendId: destination.backend_id, state: receipt?.state ?? 'PENDING_BACKEND',
        inventoryComplete: receipt?.inventoryComplete ?? false, complete: !!enrolled && !!receipt && lifecycleComplete(receipt), receipt: receipt ?? null };
    });
    return { requestId: String(change.request_id), revision: Number(change.revision), capabilityId: String(change.capability_id),
      operation: String(change.operation), complete: backends.length > 0 && backends.every((item: { complete: boolean }) => item.complete), backends };
  }).sort((left, right) => right.revision - left.revision);
}

/** Materialize the original signed request even when a newer change superseded its first delivery.
 * Receiving backends still require that exact control to exist in their authenticated native inventory. */
export async function pendingLifecycleDeliveries(connection: PolicyConnection, scope: AdmissionScope, signer: PolicyKey) {
  await connection.query("SELECT set_config('myeve.capability_owner',$1,true),set_config('myeve.capability_installation',$2,true)", [scope.ownerId, scope.installationId]);
  await connection.query('SELECT capability_control.lock_admission_policy($1,$2,$3)', [scope.installationId, scope.ownerId, scope.agentId]);
  const changes = (await connection.query(`SELECT DISTINCT ON (c.capability_id) c.* FROM capability_control.policy_changes c
    JOIN capability_control.control_requests r USING(installation_id,owner_id,revision)
    WHERE c.installation_id=$1 AND c.owner_id=$2 ORDER BY c.capability_id,c.revision DESC`, [scope.installationId, scope.ownerId])).rows;
  const deliveries: { backendId: string; envelope: SignedPolicyMessage }[] = [];
  for (const change of changes) {
    if (change.organization_id !== scope.organizationId) throw Error('CAPABILITY_CONTROL_SCOPE');
    const controls = (await connection.query(`SELECT DISTINCT ON (capability_id,operation)
      capability_id AS "capabilityId", operation, revision AS version, policy_id AS "policyId"
      FROM capability_control.policy_changes WHERE installation_id=$1 AND owner_id=$2 AND revision <= $3
      AND operation IN ('pause','revoke') ORDER BY capability_id,operation,revision DESC`,
    [scope.installationId, scope.ownerId, change.revision])).rows as Fence['controls'];
    for (const destination of change.destinations) {
      const key = [scope.installationId, scope.ownerId, change.revision, destination.backend_id];
      const [prior] = (await connection.query(`SELECT envelope FROM capability_control.policy_deliveries
        WHERE installation_id=$1 AND owner_id=$2 AND revision=$3 AND backend_id=$4`, key)).rows;
      const envelope = prior?.envelope ?? await signPolicyMessage({ kind: 'FENCE', authority: 'myeve',
        ownerId: scope.ownerId, organizationId: scope.organizationId, installationId: scope.installationId,
        backendId: destination.backend_id, incarnation: destination.incarnation, enrollmentVersion: destination.enrollment_version,
        version: change.revision, policyId: change.policy_id, capabilityId: change.capability_id, operation: change.operation, controls }, signer);
      if (!prior) await connection.query('INSERT INTO capability_control.policy_deliveries VALUES($1,$2,$3,$4,$5,NULL)', [...key, envelope]);
      deliveries.push({ backendId: destination.backend_id, envelope });
    }
  }
  return deliveries;
}
