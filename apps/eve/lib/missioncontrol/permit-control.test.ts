import { describe, expect, it } from 'vitest';
import { controlDigest, verifyPermitControl } from './execution-permit.ts';
import { permitFixture } from './permit-test-fixture.ts';
const fixture=()=>permitFixture({ownerId:'fixture-owner',workId:'fixture-work',workVersion:1,workGeneration:1,
  tupleSha256:'a'.repeat(64),maxCostMicrousd:1300000,maxDurationSeconds:180},1791800000000);
describe('signed denying permit controls',()=>{
  it('authenticates only the bound owner and exact Work approval',()=>{
    const f=fixture(),control=f.signControl();
    expect(verifyPermitControl(control,f.signPermit(),f.enrollment,f.now).controlDigest).toBe(controlDigest(control.document));
  });
  it('keeps control identity stable when a delivery is refreshed',()=>{
    const f=fixture(),c=f.controlDocument();
    expect(controlDigest({...c,issuedAt:c.issuedAt+1,expiresAt:c.expiresAt+1})).toBe(controlDigest(c));
    expect(controlDigest({...c,sequence:2})).not.toBe(controlDigest(c));
  });
  it('can fence an expired execution approval without restoring execution authority',()=>{
    const f=fixture(),c=f.controlDocument();
    c.issuedAt=f.now+61000;c.expiresAt=c.issuedAt+30000;
    expect(verifyPermitControl(f.signControl(c),f.signPermit(),{...f.enrollment,revokedAt:f.now},c.issuedAt).envelope.document.operation).toBe('revoke');
  });
  for(const field of ['permitId','permitSha256','ownerId','connectionId','missionId','workOrderId'] as const)
    it(`rejects another ${field}`,()=>{
      const f=fixture(),c=f.controlDocument();c[field]='b'.repeat(64);
      expect(()=>verifyPermitControl(f.signControl(c),f.signPermit(),f.enrollment,f.now)).toThrow('MISSIONCONTROL_CONTROL_DENIED');
    });
  it('rejects expired, future or wider control deliveries and tampered signatures',()=>{
    const f=fixture();
    for(const change of [{expiresAt:f.now},{issuedAt:f.now+1},{expiresAt:f.now+30001},{requestedAt:f.now+1}])
      expect(()=>verifyPermitControl(f.signControl({...f.controlDocument(),...change}),f.signPermit(),f.enrollment,f.now)).toThrow('MISSIONCONTROL_CONTROL_DENIED');
    const control=f.signControl();control.document.sequence=2;
    expect(()=>verifyPermitControl(control,f.signPermit(),f.enrollment,f.now)).toThrow('MISSIONCONTROL_CONTROL_DENIED');
  });
});
