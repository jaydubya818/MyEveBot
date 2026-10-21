import { describe, expect, it } from 'vitest';
import { verifyExecutionPermit, verifyAdmissionReceipt } from './execution-permit.ts';
import { permitFixture } from './permit-test-fixture.ts';

const work = { ownerId: 'fixture-owner', workId: 'fixture-work', workVersion: 1, workGeneration: 1,
  tupleSha256: 'a'.repeat(64), maxCostMicrousd: 1300000, maxDurationSeconds: 180 };
const fixture = () => permitFixture(work, 1791800000000);
describe('fresh MissionControl admission receipt', () => {
  it('binds the exact approved permit, challenge, policy pair and pinned signer', () => {
    const f = fixture(), permit = verifyExecutionPermit(f.signPermit(), f.enrollment, work, f.now);
    expect(verifyAdmissionReceipt(f.signReceipt(), permit, f.challenge, f.now).document.permitId).toBe(f.document.permitId);
  });
  for (const field of ['commandId','challenge','permitSha256','policyPairSha256','ownerId','missionId','planId','workOrderId','approvalId'] as const)
    it(`rejects a valid signature with foreign ${field}`, () => {
      const f = fixture(), permit = verifyExecutionPermit(f.signPermit(), f.enrollment, work, f.now);
      const receipt = f.receiptDocument(); receipt[field] = 'b'.repeat(64);
      expect(() => verifyAdmissionReceipt(f.signReceipt(receipt), permit, f.challenge, f.now)).toThrow('MISSIONCONTROL_ADMISSION_DENIED');
    });
  it('rejects future, expired, widened and stale Work receipts', () => {
    const f = fixture(), permit = verifyExecutionPermit(f.signPermit(), f.enrollment, work, f.now);
    for (const changes of [{issuedAt:f.now+1},{expiresAt:f.now},{expiresAt:f.now+10001},{work:{...f.document.work,generation:2}}])
      expect(() => verifyAdmissionReceipt(f.signReceipt({...f.receiptDocument(),...changes}), permit, f.challenge, f.now))
        .toThrow('MISSIONCONTROL_ADMISSION_DENIED');
  });
  it('rejects modified bytes, another signer and a stale request challenge', () => {
    const f = fixture(), permit = verifyExecutionPermit(f.signPermit(), f.enrollment, work, f.now);
    const receipt = f.signReceipt(); receipt.document.missionId = 'foreign';
    expect(() => verifyAdmissionReceipt(receipt, permit, f.challenge, f.now)).toThrow('MISSIONCONTROL_ADMISSION_DENIED');
    expect(() => verifyAdmissionReceipt(fixture().signReceipt(f.receiptDocument()), permit, f.challenge, f.now)).toThrow('MISSIONCONTROL_ADMISSION_DENIED');
    expect(() => verifyAdmissionReceipt(f.signReceipt(), permit, {...f.challenge,challenge:'f'.repeat(64)}, f.now)).toThrow('MISSIONCONTROL_ADMISSION_DENIED');
  });
});
