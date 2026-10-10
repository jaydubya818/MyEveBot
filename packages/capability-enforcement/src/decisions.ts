import { createHash, verify } from 'node:crypto';
import { z } from 'zod';
import { assertCapabilityAdmission, CapabilityAdmissionError, type AdmissionRequest, type AdmissionScope, type PolicyConnection } from './postgres.ts';

const text = z.string().trim().min(1).max(255);
const challengeSchema = z.object({ schema: z.literal('myeve.policy-challenge.v1'), requestId: z.string().uuid(),
  backendId: text, installationId: text, ownerId: text, organizationId: text, agentId: text,
  keyId: text, capabilityId: text, workId: text, workGeneration: z.number().int().positive(),
  budgetMicros: z.number().int().nonnegative().max(1e12), actionDigest: z.string().regex(/^[a-f0-9]{64}$/),
  nonce: z.string().uuid(), issuedAt: z.number().int().positive(), expiresAt: z.number().int().positive(), missionId: text.optional(),
}).strict();
export type PolicyChallenge = z.infer<typeof challengeSchema>;
export interface DecisionBinding { scope: AdmissionScope; backendId: string; keyId: string; publicKeyPem: string }
export interface DecisionSigner { keyId: string; sign(material: string): Promise<string> }

// Fixed schema order is the wire encoding, independent of incoming JSON property order.
export function policyChallengeMaterial(value: unknown) {
  return createHash('sha256').update(JSON.stringify(challengeSchema.parse(value))).digest('hex');
}
function deny(reason: string): never { throw new CapabilityAdmissionError(reason); }

export function authenticatePolicyChallenge(value: unknown, signature: string, binding: DecisionBinding, now: number) {
  const challenge = challengeSchema.parse(value);
  for (const field of ['ownerId', 'organizationId', 'installationId', 'agentId'] as const)
    if (challenge[field] !== binding.scope[field]) deny('DECISION_SCOPE_MISMATCH');
  if (challenge.backendId !== binding.backendId || challenge.keyId !== binding.keyId) deny('DECISION_AUDIENCE_MISMATCH');
  if (challenge.issuedAt > now || challenge.expiresAt <= now || challenge.expiresAt - challenge.issuedAt > 30_000)
    deny('DECISION_CHALLENGE_EXPIRED');
  if (!verify(null, Buffer.from(policyChallengeMaterial(challenge)), binding.publicKeyPem, Buffer.from(signature, 'base64url')))
    deny('DECISION_SIGNATURE_INVALID');
  return challenge;
}

/** Pinned source transaction required. This evidence never authorizes a remote commit. */
export async function issuePolicyDecision(connection: PolicyConnection, value: unknown, signature: string,
  binding: DecisionBinding, signer: DecisionSigner) {
  const [{ now }] = (await connection.query('SELECT floor(extract(epoch FROM clock_timestamp())*1000)::float8 AS now')).rows;
  const challenge = authenticatePolicyChallenge(value, signature, binding, Number(now));
  const request: AdmissionRequest = { capabilityId: challenge.capabilityId, workId: challenge.workId,
    workGeneration: challenge.workGeneration, budgetMicros: challenge.budgetMicros };
  const evidence = await assertCapabilityAdmission(connection, binding.scope, request);
  const fingerprint = policyChallengeMaterial(challenge);
  const key = [binding.scope.installationId, binding.scope.ownerId, binding.backendId, challenge.requestId];
  const [prior] = (await connection.query(`SELECT fingerprint,decision FROM capability_control.policy_decisions
    WHERE installation_id=$1 AND owner_id=$2 AND backend_id=$3 AND request_id=$4`, key)).rows;
  if (prior) {
    if (prior.fingerprint !== fingerprint) deny('DECISION_REPLAY_CONFLICT');
    const saved = prior.decision as PolicyDecision;
    const [{ now: replayedAt }] = (await connection.query('SELECT floor(extract(epoch FROM clock_timestamp())*1000)::float8 AS now')).rows;
    if (saved.payload.policyRevision !== evidence.policyRevision || saved.payload.agentRevision !== evidence.agentRevision
      || saved.payload.expiresAt <= Number(replayedAt)) deny('DECISION_STALE');
    return saved;
  }
  const payload = { ...challenge, schema: 'myeve.policy-decision.v1' as const,
    registryVersion: evidence.registryVersion, policyRevision: evidence.policyRevision, agentRevision: evidence.agentRevision,
    admissionEligible: false as const, receivingBackendRevalidation: 'REQUIRED' as const,
    orderingQualification: 'UNAVAILABLE' as const };
  const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const decision = { payload, hash, keyId: signer.keyId, signature: await signer.sign(hash) };
  await connection.query('INSERT INTO capability_control.policy_decisions VALUES($1,$2,$3,$4,$5,$6,DEFAULT)', [...key, fingerprint, decision]);
  await assertCapabilityAdmission(connection, binding.scope, { ...request, expectedRevision: evidence.policyRevision });
  const [{ now: completedAt }] = (await connection.query('SELECT floor(extract(epoch FROM clock_timestamp())*1000)::float8 AS now')).rows;
  if (Number(completedAt) >= challenge.expiresAt) deny('DECISION_CHALLENGE_EXPIRED');
  return decision;
}
export type PolicyDecision = {
  payload: Omit<PolicyChallenge, 'schema'> & { schema: 'myeve.policy-decision.v1'; registryVersion: string;
    policyRevision: number; agentRevision: number; admissionEligible: false;
    receivingBackendRevalidation: 'REQUIRED'; orderingQualification: 'UNAVAILABLE' };
  hash: string; keyId: string; signature: string;
};

export function requireQualifiedRemoteAdmission(_decision: PolicyDecision): never {
  return deny('CROSS_DATABASE_ORDERING_UNQUALIFIED');
}
