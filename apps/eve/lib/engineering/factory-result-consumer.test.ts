import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { authenticateFactoryResult, prepareAuthenticatedFactoryInput, projectFactoryReceipt } from './factory-authenticated-result.ts';
import { canonical, RESULT_PROTOCOL, sha256, signResult, type ResultKey, type ResultManifest } from './factory-producer-protocol.ts';
import type { FactoryReceipt, FactoryReceiptStore, FactoryRequest, ReceiptState } from './factory-receipt-store.ts';
import { resumeFactoryResult } from './factory-result-consumer.ts';

// Public protocol fixture and ephemeral keys only. In-memory receipt stubs test
// recovery decisions, not SQL admission, protected custody or execution authority.
function fixture() {
  const golden = JSON.parse(readFileSync(new URL('../../../../docs/verification/2026-09-27-q37-integration/myfactory/gate-c/durable/producer-golden.json', import.meta.url), 'utf8'));
  const manifest = JSON.parse(Buffer.from(golden.result.encoded, 'base64url').toString()) as ResultManifest;
  const pair = generateKeyPairSync('ed25519');
  const key: ResultKey = { factoryId: manifest.producer, keyId: manifest.keyId,
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    activeFrom: '2020-01-01T00:00:00Z', notAfter: '2099-01-01T00:00:00Z' };
  const result = signResult(manifest, golden.result.artifacts, pair.privateKey);
  const e = manifest.execution;
  const binding = prepareAuthenticatedFactoryInput({ workId: randomUUID(), workVersion: 1, workGeneration: 1,
    criteriaVersion: 1, agentId: 'public-fixture-agent', factoryId: e.factoryId, factoryVersion: e.factoryVersion,
    requestId: e.requestId, requestDigest: e.requestDigest, sourceDigest: e.sourceDigest,
    configurationDigest: e.configurationDigest, workOrderId: e.workOrderId, runId: e.runId,
    attemptNumber: e.attemptNumber, inputCommit: e.inputCommit });
  const authenticated = authenticateFactoryResult(result, binding, [key]);
  const envelope = canonical(result), requestId = randomUUID(), receiptId = randomUUID();
  const data: { request: FactoryRequest; receipt: FactoryReceipt; admission: Record<string, unknown> | null } = {
    request: { id: requestId, binding, current: true, cancelled: false, eligible: true },
    receipt: { id: receiptId, request_id: requestId, envelope, envelope_digest: sha256(envelope),
      received_at: manifest.issuedAt, state: 'ADMITTED', reason: null, history: [{ state: 'ADMITTED' }],
      provenance: { manifest: structuredClone(manifest), manifestDigest: result.manifestDigest,
        keyFingerprint: authenticated.fingerprint, keyId: key.keyId, protocol: RESULT_PROTOCOL, key } },
    admission: { receipt_id: receiptId, manifest_digest: result.manifestDigest, admitted_at: manifest.issuedAt },
  };
  const store = {
    request: vi.fn(async () => structuredClone(data.request)),
    get: vi.fn(async () => structuredClone(data.receipt)),
    transition: vi.fn(async (_row: FactoryReceipt, state: ReceiptState,
      extra: { provenance?: FactoryReceipt['provenance'] } = {}) => {
      data.receipt.state = state;
      if (extra.provenance) data.receipt.provenance = structuredClone(extra.provenance);
      return structuredClone(data.receipt);
    }),
    admission: vi.fn(async () => structuredClone(data.admission)),
  };
  const options = { keys: vi.fn(async () => [key]) };
  const resume = () => resumeFactoryResult(store as unknown as FactoryReceiptStore, requestId, receiptId, options);
  const sign = (next: ResultManifest) => signResult(next, golden.result.artifacts, pair.privateKey);
  return { data, store, options, resume, key, manifest, sign };
}

describe('retained Factory Result recovery integrity', () => {
  it('refuses a retained explicit future mode before loading trust or changing a receipt', async () => {
    const f = fixture();
    Object.assign(f.data.request.binding, { localSnapshotVersion: 4 });
    const before = structuredClone(f.data);
    await expect(f.resume()).rejects.toThrow();
    expect(f.data).toEqual(before);
    expect(f.options.keys).not.toHaveBeenCalled();
    expect(f.store.get).not.toHaveBeenCalled();
    expect(f.store.transition).not.toHaveBeenCalled();
  });
  it('revalidates an intact saved result and returns its canonical admission', async () => {
    const f = fixture();
    expect(await f.resume()).toMatchObject({ status: 'ADMITTED', receiptId: f.data.receipt.id,
      factoryProvenance: 'VERIFIED', eligibleForCurrentAdmission: true,
      factoryGrantedAuthority: 0, independentVerification: 'NOT_RUN', readiness: 'NOT_READY' });
    expect(f.store.transition).not.toHaveBeenCalled();
    expect(f.options.keys).toHaveBeenCalledTimes(3);
  });

  it('preserves the canonical receipt alias for another delivery of the same manifest', async () => {
    const f = fixture(), canonicalId = randomUUID();
    f.data.admission!.receipt_id = canonicalId;
    expect(await f.resume()).toMatchObject({ receiptId: canonicalId, deliveryId: f.data.receipt.id,
      eligibleForCurrentAdmission: true });
  });

  it.each(['id', 'request_id', 'envelope_digest'] as const)('refuses changed retained %s before loading trust or writing', async field => {
    const f = fixture();
    f.data.receipt[field] = field === 'envelope_digest' ? '0'.repeat(64) : randomUUID();
    await expect(f.resume()).rejects.toThrow(/receipt integrity/i);
    expect(f.options.keys).not.toHaveBeenCalled();
    expect(f.store.transition).not.toHaveBeenCalled();
    expect(f.store.admission).not.toHaveBeenCalled();
  });

  it('refuses a different request returned by the store before loading trust', async () => {
    const f = fixture();
    f.data.request.id = randomUUID();
    await expect(f.resume()).rejects.toThrow(/receipt integrity/i);
    expect(f.options.keys).not.toHaveBeenCalled();
    expect(f.store.transition).not.toHaveBeenCalled();
  });

  it('does not replace saved provenance with a different validly signed envelope', async () => {
    const f = fixture(), changed = structuredClone(f.manifest);
    changed.issuedAt = new Date(Date.parse(changed.issuedAt) + 1).toISOString();
    f.data.receipt.envelope = canonical(f.sign(changed));
    f.data.receipt.envelope_digest = sha256(f.data.receipt.envelope);
    const retainedDigest = f.data.receipt.provenance!.manifestDigest;
    await expect(f.resume()).rejects.toThrow(/receipt provenance/i);
    expect(f.data.receipt.provenance!.manifestDigest).toBe(retainedDigest);
    expect(f.store.transition).not.toHaveBeenCalled();
  });

  it.each(['manifestDigest', 'keyFingerprint', 'keyId', 'protocol', 'manifest'] as const)('refuses retained provenance %s that disagrees with the authenticated envelope', async field => {
    const f = fixture(), provenance = f.data.receipt.provenance!;
    if (field === 'manifest') provenance.manifest.issuedAt = new Date(Date.parse(provenance.manifest.issuedAt) + 1).toISOString();
    else provenance[field] = 'changed';
    await expect(f.resume()).rejects.toThrow(/receipt provenance/i);
    expect(f.store.transition).not.toHaveBeenCalled();
    expect(f.store.admission).not.toHaveBeenCalled();
  });

  it.each(['AUTHENTICATED', 'ATTESTED', 'INTEGRITY_VERIFIED', 'ADMITTED'] as const)('requires retained provenance at %s', async state => {
    const f = fixture();
    f.data.receipt.state = state;
    f.data.receipt.provenance = null;
    await expect(f.resume()).rejects.toThrow(/receipt provenance/i);
    expect(f.store.transition).not.toHaveBeenCalled();
  });

  it('retains historical cryptographic provenance after the current key is retired', async () => {
    const f = fixture();
    f.options.keys.mockResolvedValue([{ ...f.key, retiredAt: new Date(Date.parse(f.manifest.issuedAt) + 1000).toISOString() }]);
    expect(await f.resume()).toMatchObject({ factoryProvenance: 'VERIFIED', eligibleForCurrentAdmission: false });
    expect(f.store.transition).not.toHaveBeenCalled();
  });

  it('keeps a trust registry outage recoverable without changing the saved receipt', async () => {
    const f = fixture();
    f.options.keys.mockRejectedValue(new Error('Synthetic trust registry outage'));
    await expect(f.resume()).rejects.toThrow('Synthetic trust registry outage');
    expect(f.data.receipt.state).toBe('ADMITTED');
    expect(f.store.transition).not.toHaveBeenCalled();
  });

  it('preserves a valid intermediate-stage replay and its existing admission sequence', async () => {
    const f = fixture();
    f.data.receipt.state = 'ATTESTED';
    expect(await f.resume()).toMatchObject({ status: 'ADMITTED', eligibleForCurrentAdmission: true });
    expect(f.store.transition.mock.calls.map(call => call[1])).toEqual(['INTEGRITY_VERIFIED', 'ADMITTED']);
  });

  it('still authenticates a newly received result with no saved provenance', async () => {
    const f = fixture();
    f.data.receipt.state = 'RECEIVED';
    f.data.receipt.provenance = null;
    expect(await f.resume()).toMatchObject({ status: 'ADMITTED', eligibleForCurrentAdmission: true });
    expect(f.store.transition.mock.calls.map(call => call[1]))
      .toEqual(['AUTHENTICATED', 'ATTESTED', 'INTEGRITY_VERIFIED', 'ADMITTED']);
  });

  it('does not misclassify a post-commit hook failure as a rejected receipt', async () => {
    const f = fixture();
    f.data.receipt.state = 'RECEIVED';
    f.data.receipt.provenance = null;
    await expect(resumeFactoryResult(f.store as unknown as FactoryReceiptStore, f.data.request.id, f.data.receipt.id,
      { ...f.options, afterStage: async () => { throw new Error('Synthetic process interruption'); } }))
      .rejects.toThrow('Synthetic process interruption');
    expect(f.data.receipt.state).toBe('AUTHENTICATED');
    expect(await f.resume()).toMatchObject({ status: 'ADMITTED', eligibleForCurrentAdmission: true });
  });

  it('does not project current admission after the request loses eligibility', async () => {
    const f = fixture();
    f.data.request.eligible = false;
    expect(await f.resume()).toMatchObject({ factoryProvenance: 'VERIFIED', eligibleForCurrentAdmission: false });
  });
});

describe('canonical admission projection', () => {
  it.each(['missing', 'different-manifest', 'missing-receipt-id', 'empty-receipt-id'])('does not authorize an admitted delivery with %s canonical custody', mode => {
    const f = fixture();
    if (mode === 'missing') f.data.admission = null;
    else if (mode === 'different-manifest') f.data.admission!.manifest_digest = '0'.repeat(64);
    else if (mode === 'missing-receipt-id') delete f.data.admission!.receipt_id;
    else f.data.admission!.receipt_id = '';
    expect(projectFactoryReceipt(f.data.receipt, f.data.admission, true, true))
      .toMatchObject({ receiptId: f.data.receipt.id, eligibleForCurrentAdmission: false,
        factoryGrantedAuthority: 0, readiness: 'NOT_READY' });
  });

  it('never treats unverified bytes as eligible even with a current key and canonical row', () => {
    const f = fixture();
    expect(projectFactoryReceipt(f.data.receipt, f.data.admission, true, false))
      .toMatchObject({ factoryProvenance: 'UNVERIFIED', candidate: null, eligibleForCurrentAdmission: false });
  });

  it.each(['STALE', 'CONFLICT', 'REJECTED'] as const)('keeps %s history ineligible without rewriting it', state => {
    const f = fixture();
    f.data.receipt.state = state;
    expect(projectFactoryReceipt(f.data.receipt, f.data.admission, true, true))
      .toMatchObject({ status: state, receiptId: f.data.receipt.id, eligibleForCurrentAdmission: false });
  });
});
