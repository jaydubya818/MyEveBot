import { assertCapabilityAdmission, type AdmissionScope, type PolicyConnection } from './postgres.ts';
import { authenticatePolicyChallenge, policyChallengeMaterial, type DecisionBinding, type PolicyChallenge } from './decisions.ts';
import { signPolicyMessage, verifyPolicyMessage, policyMessageHash, assertPolicyIdentity,
  type PolicyKey, type PolicyIdentity, type Fence, type SignedPolicyMessage } from './ordering-wire.ts';

type Destination = { backend_id: string; incarnation: string; enrollment_version: number; key_id: string; public_jwk: JsonWebKey };
function sameDestination(left: Destination, right: Destination | undefined) {
  return !!right && left.backend_id === right.backend_id && left.incarnation === right.incarnation
    && left.enrollment_version === right.enrollment_version && left.key_id === right.key_id
    && ['kty', 'crv', 'x', 'y'].every(key => left.public_jwk[key as keyof JsonWebKey] === right.public_jwk[key as keyof JsonWebKey]);
}
async function lock(connection: PolicyConnection, scope: AdmissionScope) {
  await connection.query("SELECT set_config('myeve.capability_owner',$1,true),set_config('myeve.capability_installation',$2,true)", [scope.ownerId, scope.installationId]);
  await connection.query('SELECT capability_control.lock_admission_policy($1,$2,$3)', [scope.installationId, scope.ownerId, scope.agentId]);
}
function identity(change: Record<string, any>, destination: Destination): PolicyIdentity {
  return { authority: 'myeve', ownerId: change.owner_id, organizationId: change.organization_id,
    installationId: change.installation_id, backendId: destination.backend_id, incarnation: destination.incarnation,
    enrollmentVersion: destination.enrollment_version, version: change.revision, policyId: change.policy_id };
}

/** Each operation requires a pinned source transaction; network delivery happens after commit. */
export async function pendingPolicyDeliveries(connection: PolicyConnection, scope: AdmissionScope, signer: PolicyKey) {
  await lock(connection, scope);
  const [change] = (await connection.query(`SELECT * FROM capability_control.policy_changes
    WHERE installation_id=$1 AND owner_id=$2 AND status='PENDING_PROPAGATION'`, [scope.installationId, scope.ownerId])).rows;
  if (!change) return [];
  if (change.organization_id !== scope.organizationId) throw Error('CAPABILITY_POLICY_IDENTITY_MISMATCH');
  const controls = (await connection.query(`SELECT DISTINCT ON (capability_id,operation)
    capability_id AS "capabilityId", operation, revision AS version, policy_id AS "policyId"
    FROM capability_control.policy_changes WHERE installation_id=$1 AND owner_id=$2 AND revision <= $3
    AND operation IN ('pause','revoke') ORDER BY capability_id,operation,revision DESC`,
    [scope.installationId, scope.ownerId, change.revision])).rows as Fence['controls'];
  const deliveries: { backendId: string; envelope: SignedPolicyMessage }[] = [];
  for (const destination of change.destinations as Destination[]) {
    const key = [scope.installationId, scope.ownerId, change.revision, destination.backend_id];
    const [prior] = (await connection.query(`SELECT * FROM capability_control.policy_deliveries
      WHERE installation_id=$1 AND owner_id=$2 AND revision=$3 AND backend_id=$4`, key)).rows;
    if (prior?.acknowledgment) continue;
    const fence: Fence = { ...identity(change, destination), kind: 'FENCE', capabilityId: change.capability_id, operation: change.operation, controls };
    const envelope = prior?.envelope ?? await signPolicyMessage(fence, signer);
    if (!prior) await connection.query('INSERT INTO capability_control.policy_deliveries VALUES($1,$2,$3,$4,$5,NULL)', [...key, envelope]);
    deliveries.push({ backendId: destination.backend_id, envelope });
  }
  return deliveries;
}

export async function acknowledgePolicyFence(connection: PolicyConnection, scope: AdmissionScope,
  backendId: string, envelope: SignedPolicyMessage) {
  await lock(connection, scope);
  const [destination] = (await connection.query(`SELECT * FROM capability_control.policy_destinations
    WHERE installation_id=$1 AND owner_id=$2 AND backend_id=$3`, [scope.installationId, scope.ownerId, backendId])).rows;
  if (!destination) throw Error('CAPABILITY_DESTINATION_UNAVAILABLE');
  const ack = await verifyPolicyMessage(envelope, { keyId: destination.key_id, jwk: destination.public_jwk });
  if (ack.kind !== 'FENCE_ACK') throw Error('CAPABILITY_ACK_REQUIRED');
  const [change] = (await connection.query(`SELECT * FROM capability_control.policy_changes
    WHERE installation_id=$1 AND owner_id=$2 AND revision=$3`, [scope.installationId, scope.ownerId, ack.version])).rows;
  if (!change || change.organization_id !== scope.organizationId) throw Error('CAPABILITY_CHANGE_UNAVAILABLE');
  const frozen = (change.destinations as Destination[]).find(item => item.backend_id === backendId);
  if (!frozen || !sameDestination(frozen, destination as Destination)) throw Error('CAPABILITY_ENROLLMENT_CHANGED');
  assertPolicyIdentity(ack, identity(change, frozen));
  const key = [scope.installationId, scope.ownerId, ack.version, backendId];
  const [delivery] = (await connection.query(`SELECT * FROM capability_control.policy_deliveries
    WHERE installation_id=$1 AND owner_id=$2 AND revision=$3 AND backend_id=$4`, key)).rows;
  if (!delivery || ack.fenceHash !== await policyMessageHash(JSON.parse(delivery.envelope.message)))
    throw Error('CAPABILITY_ACK_MISMATCH');
  if (!delivery.acknowledgment) await connection.query(`UPDATE capability_control.policy_deliveries SET acknowledgment=$5
    WHERE installation_id=$1 AND owner_id=$2 AND revision=$3 AND backend_id=$4`, [...key, envelope]);
  const [{ count }] = (await connection.query(`SELECT count(*)::int AS count FROM capability_control.policy_deliveries
    WHERE installation_id=$1 AND owner_id=$2 AND revision=$3 AND acknowledgment IS NOT NULL`, key.slice(0, 3))).rows;
  if (count === change.destinations.length) await connection.query(`UPDATE capability_control.policy_changes SET status='ACKNOWLEDGED'
    WHERE installation_id=$1 AND owner_id=$2 AND revision=$3 AND status='PENDING_PROPAGATION'`, key.slice(0, 3));
  const [durable] = (await connection.query(`SELECT status FROM capability_control.policy_changes
    WHERE installation_id=$1 AND owner_id=$2 AND revision=$3`, key.slice(0, 3))).rows;
  return { version: ack.version, status: String(durable.status) };
}

export async function issueOrderedPermit(connection: PolicyConnection, value: unknown, signature: string,
  binding: DecisionBinding, signer: PolicyKey) {
  const clock = async () => Number((await connection.query('SELECT floor(extract(epoch FROM clock_timestamp())*1000)::float8 AS now')).rows[0].now);
  const challenge = authenticatePolicyChallenge(value, signature, binding, await clock());
  return issueAuthenticatedPermit(connection, challenge, binding, signer);
}

export async function issueBackendOrderedPermit(connection: PolicyConnection, envelope: SignedPolicyMessage,
  scope: AdmissionScope, backendId: string, signer: PolicyKey) {
  await lock(connection, scope);
  const [destination] = (await connection.query(`SELECT * FROM capability_control.policy_destinations
    WHERE installation_id=$1 AND owner_id=$2 AND backend_id=$3`, [scope.installationId, scope.ownerId, backendId])).rows;
  if (!destination) throw Error('CAPABILITY_DESTINATION_UNAVAILABLE');
  const challenge = await verifyPolicyMessage(envelope, { keyId: destination.key_id, jwk: destination.public_jwk });
  if (challenge.kind !== 'CHALLENGE' || challenge.backendId !== backendId || challenge.ownerId !== scope.ownerId
    || challenge.organizationId !== scope.organizationId || challenge.installationId !== scope.installationId
    || challenge.agentId !== scope.agentId) throw Error('CAPABILITY_CHALLENGE_SCOPE');
  const request: PolicyChallenge = { ...challenge, schema: 'myeve.policy-challenge.v1', requestId: challenge.referenceId,
    keyId: envelope.keyId, nonce: challenge.referenceId };
  return issueAuthenticatedPermit(connection, request, { scope, backendId }, signer, challenge, envelope.message);
}

async function issueAuthenticatedPermit(connection: PolicyConnection, challenge: PolicyChallenge,
  binding: Pick<DecisionBinding, 'scope' | 'backendId'>, signer: PolicyKey, expectedIdentity?: PolicyIdentity, signedMaterial?: string) {
  const clock = async () => Number((await connection.query('SELECT floor(extract(epoch FROM clock_timestamp())*1000)::float8 AS now')).rows[0].now);
  if (challenge.issuedAt > await clock()) throw Error('CAPABILITY_REFERENCE_EXPIRED');
  if (!challenge.missionId) throw Error('CAPABILITY_MISSION_REQUIRED');
  const request = { capabilityId: challenge.capabilityId, workId: challenge.workId,
    workGeneration: challenge.workGeneration, budgetMicros: challenge.budgetMicros };
  const evidence = await assertCapabilityAdmission(connection, binding.scope, request);
  const [change] = (await connection.query(`SELECT * FROM capability_control.policy_changes
    WHERE installation_id=$1 AND owner_id=$2 AND revision=$3 AND status='ACKNOWLEDGED'`,
  [binding.scope.installationId, binding.scope.ownerId, evidence.policyRevision])).rows;
  if (!change || change.organization_id !== binding.scope.organizationId) throw Error('CAPABILITY_PROPAGATION_PENDING');
  const destination = (change.destinations as Destination[]).find(item => item.backend_id === binding.backendId);
  const [current] = (await connection.query(`SELECT * FROM capability_control.policy_destinations
    WHERE installation_id=$1 AND owner_id=$2 AND backend_id=$3`, [binding.scope.installationId, binding.scope.ownerId, binding.backendId])).rows;
  if (!destination || !sameDestination(destination, current as Destination)) throw Error('CAPABILITY_ENROLLMENT_CHANGED');
  if (challenge.incarnation !== destination.incarnation || challenge.enrollmentVersion !== destination.enrollment_version)
    throw Error('CAPABILITY_CHALLENGE_INCARNATION');
  if (expectedIdentity) {
    assertPolicyIdentity(expectedIdentity, identity(change, destination));
    if ((expectedIdentity as PolicyIdentity & { registryVersion: string }).registryVersion !== evidence.registryVersion) throw Error('CAPABILITY_CHALLENGE_REGISTRY');
  }
  const key = [binding.scope.installationId, binding.scope.ownerId, `ordered:${binding.backendId}`, challenge.requestId];
  const fingerprint = signedMaterial ?? policyChallengeMaterial(challenge);
  const [prior] = (await connection.query(`SELECT fingerprint,decision FROM capability_control.policy_decisions
    WHERE installation_id=$1 AND owner_id=$2 AND backend_id=$3 AND request_id=$4`, key)).rows;
  if (prior && prior.fingerprint !== fingerprint) throw Error('CAPABILITY_REFERENCE_CONFLICT');
  if (await clock() >= challenge.expiresAt) throw Error('CAPABILITY_REFERENCE_EXPIRED');
  if (prior) {
    const saved = JSON.parse(prior.decision.message);
    assertPolicyIdentity(saved, identity(change, destination));
    return prior.decision as SignedPolicyMessage;
  }
  const permit = await signPolicyMessage({ ...identity(change, destination), kind: 'PERMIT',
    referenceId: challenge.requestId, capabilityId: challenge.capabilityId, requiredCapabilities: evidence.requiredCapabilities,
    registryVersion: evidence.registryVersion, agentId: binding.scope.agentId, agentRevision: evidence.agentRevision,
    workId: challenge.workId, missionId: challenge.missionId, workGeneration: challenge.workGeneration,
    actionDigest: challenge.actionDigest, budgetMicros: challenge.budgetMicros, issuedAt: challenge.issuedAt, expiresAt: challenge.expiresAt,
    sourcePermitHash: 'SELF' }, signer);
  await connection.query('INSERT INTO capability_control.policy_decisions VALUES($1,$2,$3,$4,$5,$6,DEFAULT)', [...key, fingerprint, permit]);
  await assertCapabilityAdmission(connection, binding.scope, { ...request, expectedRevision: evidence.policyRevision });
  if (await clock() >= challenge.expiresAt) throw Error('CAPABILITY_REFERENCE_EXPIRED');
  return permit;
}
