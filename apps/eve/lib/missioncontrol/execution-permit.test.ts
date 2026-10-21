import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalPermitJson, permitSigningBytes, verifyExecutionPermit, type ExecutionPermit,
  type OwnerEnrollment, type PermitWorkBinding } from './execution-permit.ts';

const now = 1791792000000;
const pair = generateKeyPairSync('ed25519');
const keyId = createHash('sha256').update(pair.publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
const hash = 'a'.repeat(64);
const enrollment = (): OwnerEnrollment => ({
  schema: 'mc-owner-enrollment/v1', environment: 'APPROVED_NONPRODUCTION', installationId: 'test-installation',
  revision: 2, ownerId: 'test-owner', ownerSubject: 'user_test_owner', missionControlOwnerId: 'test-operator',
  tenantId: 'test-tenant', projectId: 'test-project', connectionId: 'test-connection',
  issuer: 'https://mc.example.test', audience: 'https://myeve.example.test', clerkIssuer: 'https://clerk.example.test',
  clerkAudience: 'myeve', clerkAuthorizedParty: 'https://myeve.example.test', activeFrom: now - 100000, expiresAt: now + 3600000,
  revokedAt: null, factoryVersion: hash, executionContractSha256: hash, capabilityPolicySha256: hash,
  maxCostMicrousd: 1300000, maxDurationSeconds: 180,
  permitKeys: [{ keyId, publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    activeFrom: now - 100000, notAfter: now + 3600000, revokedAt: null }],
});
const work: PermitWorkBinding = { ownerId: 'test-owner', workId: 'test-work', workVersion: 2, workGeneration: 1,
  tupleSha256: hash, maxCostMicrousd: 1300000, maxDurationSeconds: 180 };
const document = (): ExecutionPermit => ({
  schema: 'mc-execution-permit/v1', permitId: 'test-permit', issuer: 'https://mc.example.test', audience: 'https://myeve.example.test',
  issuedAt: now, expiresAt: now + 60000, installationId: 'test-installation', connectionId: 'test-connection', enrollmentRevision: 2,
  ownerId: 'test-owner', ownerSubject: 'user_test_owner', missionControlOwnerId: 'test-operator', tenantId: 'test-tenant', projectId: 'test-project',
  missionId: 'test-mission', planId: 'test-plan', planDigest: `sha256:${hash}`, workOrderId: 'test-order', workOrderRevisionId: 'test-revision',
  approvalId: 'test-approval', approvalDigest: `sha256:${hash}`,
  work: { id: work.workId, version: work.workVersion, generation: work.workGeneration, tupleSha256: hash },
  admission: { factoryVersion: hash, executionContractSha256: hash, capabilityPolicySha256: hash, maxCostMicrousd: 1300000, maxDurationSeconds: 180 },
});
const signed = (doc = document()) => ({ document: doc, keyId, signature: sign(null, permitSigningBytes(doc), pair.privateKey).toString('base64url') });

describe('MissionControl execution permit verification', () => {
  it('authenticates the exact current owner, installation, Work and admission limits', () => {
    const result = verifyExecutionPermit(signed(), enrollment(), work, now);
    expect(result.document.missionId).toBe('test-mission');
    expect(result.permitSha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it('survives a PostgreSQL jsonb key-order round trip', () => {
    const envelope = signed();
    envelope.document = Object.fromEntries(Object.entries(envelope.document).reverse()) as ExecutionPermit;
    expect(verifyExecutionPermit(envelope, enrollment(), work, now).permitSha256)
      .toBe(verifyExecutionPermit(signed(), enrollment(), work, now).permitSha256);
    expect(canonicalPermitJson({ z: [2, 1], a: { b: true, a: 'é' } })).toBe('{"a":{"a":"é","b":true},"z":[2,1]}');
  });
  for (const field of ['ownerId', 'ownerSubject', 'missionControlOwnerId', 'installationId', 'connectionId', 'tenantId', 'projectId'] as const)
    it(`rejects a correctly signed foreign ${field}`, () => {
      const doc = document(); doc[field] = 'foreign';
      expect(() => verifyExecutionPermit(signed(doc), enrollment(), work, now)).toThrow('MISSIONCONTROL_PERMIT_DENIED');
    });
  for (const field of ['factoryVersion', 'executionContractSha256', 'capabilityPolicySha256'] as const)
    it(`rejects changed ${field}`, () => {
      const doc = document(); doc.admission[field] = 'b'.repeat(64);
      expect(() => verifyExecutionPermit(signed(doc), enrollment(), work, now)).toThrow('MISSIONCONTROL_PERMIT_DENIED');
    });
  for (const changed of [
    { issuedAt: now + 1 }, { expiresAt: now }, { expiresAt: now + 300001 },
    { enrollmentRevision: 1 }, { issuer: 'https://other.example.test' }, { audience: 'https://other.example.test' },
  ]) it(`rejects invalid time or installation binding ${JSON.stringify(changed)}`, () => {
    expect(() => verifyExecutionPermit(signed({ ...document(), ...changed }), enrollment(), work, now)).toThrow('MISSIONCONTROL_PERMIT_DENIED');
  });
  for (const changed of [{ id: 'other' }, { version: 1 }, { generation: 2 }, { tupleSha256: 'b'.repeat(64) }])
    it(`rejects a stale or foreign Work ${JSON.stringify(changed)}`, () => {
      const doc = document(); Object.assign(doc.work, changed);
      expect(() => verifyExecutionPermit(signed(doc), enrollment(), work, now)).toThrow('MISSIONCONTROL_PERMIT_DENIED');
    });
  it('rejects both a wider and a narrower permit when the canonical Work limit differs', () => {
    for (const maxCostMicrousd of [1, 1300001]) {
      const doc = document(); doc.admission.maxCostMicrousd = maxCostMicrousd;
      expect(() => verifyExecutionPermit(signed(doc), enrollment(), work, now)).toThrow('MISSIONCONTROL_PERMIT_DENIED');
    }
    const doc = document(); doc.admission.maxDurationSeconds = 181;
    expect(() => verifyExecutionPermit(signed(doc), enrollment(), work, now)).toThrow('MISSIONCONTROL_PERMIT_DENIED');
  });
  it('rejects revoked or expired enrollments and insufficient policy ceilings', () => {
    for (const change of [{ revokedAt: now }, { activeFrom: now + 1 }, { expiresAt: now }, { expiresAt: now + 1 }, { maxCostMicrousd: 1 }, { maxDurationSeconds: 1 }])
      expect(() => verifyExecutionPermit(signed(), { ...enrollment(), ...change }, work, now)).toThrow('MISSIONCONTROL_PERMIT_DENIED');
  });
  it('rejects revoked, ambiguous, inactive and prematurely retiring keys', () => {
    for (const change of [{ revokedAt: now }, { activeFrom: now + 1 }, { notAfter: now + 1 }]) {
      const row = enrollment(); Object.assign(row.permitKeys[0], change);
      expect(() => verifyExecutionPermit(signed(), row, work, now)).toThrow('MISSIONCONTROL_PERMIT_DENIED');
    }
    const row = enrollment(); row.permitKeys.push(row.permitKeys[0]);
    expect(() => verifyExecutionPermit(signed(), row, work, now)).toThrow('MISSIONCONTROL_PERMIT_DENIED');
  });
  it('rejects modified documents, unknown keys, replacement keys and noncanonical signatures', () => {
    const envelope = signed(); envelope.document.missionId = 'other';
    expect(() => verifyExecutionPermit(envelope, enrollment(), work, now)).toThrow('MISSIONCONTROL_PERMIT_DENIED');
    expect(() => verifyExecutionPermit({ ...signed(), keyId: 'f'.repeat(64) }, enrollment(), work, now)).toThrow('MISSIONCONTROL_PERMIT_DENIED');
    const row = enrollment(); row.permitKeys[0].publicKey = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString();
    expect(() => verifyExecutionPermit(signed(), row, work, now)).toThrow('MISSIONCONTROL_PERMIT_DENIED');
    expect(() => verifyExecutionPermit({ ...signed(), signature: signed().signature + '=' }, enrollment(), work, now)).toThrow('MISSIONCONTROL_PERMIT_DENIED');
  });
  it('rejects unknown fields, unsafe integers, absent configuration and loopback targets', () => {
    expect(() => verifyExecutionPermit({ ...signed(), ownerApproved: true }, enrollment(), work, now)).toThrow('MISSIONCONTROL_PERMIT_DENIED');
    expect(() => verifyExecutionPermit(signed(), null, work, now)).toThrow('MISSIONCONTROL_PERMIT_DENIED');
    expect(() => verifyExecutionPermit(signed(), enrollment(), work, NaN)).toThrow('MISSIONCONTROL_PERMIT_DENIED');
    const doc = document(); doc.admission.maxCostMicrousd = Number.MAX_SAFE_INTEGER + 1;
    expect(() => verifyExecutionPermit(signed(doc), enrollment(), work, now)).toThrow('MISSIONCONTROL_PERMIT_DENIED');
    for (const issuer of ['http://127.0.0.1:8080', 'https://127.0.0.1', 'https://a.localhost', 'https://mc.example.test/path', 'https://user@mc.example.test'])
      expect(() => verifyExecutionPermit(signed({ ...document(), issuer }), enrollment(), work, now)).toThrow('MISSIONCONTROL_PERMIT_DENIED');
  });
});
