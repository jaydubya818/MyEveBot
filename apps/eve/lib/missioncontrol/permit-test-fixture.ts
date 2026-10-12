import { createHash, generateKeyPairSync, sign, randomUUID } from 'node:crypto';
import { admissionSigningBytes, permitSigningBytes, permitDigest, controlSigningBytes, type PermitControl, type ExecutionPermit,
  type AdmissionReceipt, type OwnerEnrollment, type PermitWorkBinding } from './execution-permit.ts';

/** Disposable keys and identities only. No installed enrollment is created by this helper. */
export function permitFixture(work: PermitWorkBinding, now = Date.now()) {
  const pair = generateKeyPairSync('ed25519');
  const keyId = createHash('sha256').update(pair.publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
  const hash = 'a'.repeat(64);
  const enrollment: OwnerEnrollment = {
    schema: 'mc-owner-enrollment/v1', environment: 'APPROVED_NONPRODUCTION', installationId: randomUUID(),
    revision: 1, ownerId: work.ownerId, ownerSubject: 'user_' + work.ownerId, missionControlOwnerId: randomUUID(),
    tenantId: randomUUID(), projectId: randomUUID(), connectionId: randomUUID(),
    issuer: 'https://mc.example.test', audience: 'https://myeve.example.test', clerkIssuer: 'https://clerk.example.test',
    clerkAudience: 'myeve', clerkAuthorizedParty: 'https://myeve.example.test', activeFrom: now - 1000,
    expiresAt: now + 3600000, revokedAt: null, factoryVersion: hash, executionContractSha256: hash, capabilityPolicySha256: hash,
    maxCostMicrousd: work.maxCostMicrousd, maxDurationSeconds: work.maxDurationSeconds,
    permitKeys: [{ keyId, publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      activeFrom: now - 1000, notAfter: now + 3600000, revokedAt: null }],
  };
  const document: ExecutionPermit = {
    schema: 'mc-execution-permit/v1', permitId: randomUUID(), issuer: enrollment.issuer, audience: enrollment.audience,
    issuedAt: now, expiresAt: now + 60000, installationId: enrollment.installationId, connectionId: enrollment.connectionId,
    enrollmentRevision: enrollment.revision, ownerId: work.ownerId, ownerSubject: enrollment.ownerSubject,
    missionControlOwnerId: enrollment.missionControlOwnerId, tenantId: enrollment.tenantId, projectId: enrollment.projectId,
    missionId: randomUUID(), planId: randomUUID(), planDigest: 'sha256:' + hash, workOrderId: randomUUID(),
    workOrderRevisionId: randomUUID(), approvalId: randomUUID(), approvalDigest: 'sha256:' + hash,
    work: { id: work.workId, version: work.workVersion, generation: work.workGeneration, tupleSha256: work.tupleSha256 },
    admission: { factoryVersion: hash, executionContractSha256: hash, capabilityPolicySha256: hash,
      maxCostMicrousd: work.maxCostMicrousd, maxDurationSeconds: work.maxDurationSeconds },
  };
  const challenge = { commandId: randomUUID(), challenge: createHash('sha256').update(randomUUID()).digest('hex'), policyPairSha256: hash };
  const signPermit = (value = document) => ({ document: value, keyId,
    signature: sign(null, permitSigningBytes(value), pair.privateKey).toString('base64url') });
  const receiptDocument = (value = document): AdmissionReceipt => {
    const { admission: _admission, ...rest } = value;
    return { ...rest, schema: 'mc-admission-receipt/v1', ...challenge,
      issuedAt: now, expiresAt: now + 10000, permitSha256: permitDigest(value) };
  };
  const signReceipt = (value = receiptDocument()) => ({ document: value, keyId,
    signature: sign(null, admissionSigningBytes(value), pair.privateKey).toString('base64url') });
  const controlDocument = ():PermitControl => {
    const {admission:_admission,planDigest:_planDigest,approvalId:_approvalId,approvalDigest:_approvalDigest,...rest}=document;
    return {...rest,schema:'mc-permit-control/v1',permitSha256:permitDigest(document),sequence:1,
      operation:'revoke',reason:'OWNER_REVOKED',requestedAt:now,issuedAt:now,expiresAt:now+30000};
  };
  const signControl = (value=controlDocument())=>({document:value,keyId,
    signature:sign(null,controlSigningBytes(value),pair.privateKey).toString('base64url')});
  return { enrollment, document, challenge, receiptDocument, signPermit, signReceipt, controlDocument, signControl, now };
}
