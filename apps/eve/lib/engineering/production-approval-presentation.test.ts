import {describe,expect,it,vi} from 'vitest';
import {productionApprovalPresentation} from '../../scripts/production-approval-presentation.ts';
import {validatePaidOperatorPreflight} from '../../scripts/production-canary-grant.ts';
import {materializeValidationGrant} from '../../scripts/production-validation-materializer.ts';
import {fixture} from '../../test/fixtures/alpha-owner.ts';
import {digest} from './contract.ts';

describe('authorization digest presentation and acceptance',()=>{
 it('presents the exact 64-character canonical digest',()=>{
  const {envelope}=fixture();const hash=digest(envelope);
  expect(productionApprovalPresentation(envelope,hash)).toEqual({canonicalEnvelopeDigest:hash,digestLength:64,status:'READY_FOR_AUTHORIZATION'});
 });
 it.each([62,63,65])('rejects %i-character approvals without substituting the computed digest',length=>{
  const {envelope}=fixture();
  expect(()=>productionApprovalPresentation(envelope,'a'.repeat(length))).toThrow('AUTHORIZATION_SHA256_FORMAT');
  expect(()=>validatePaidOperatorPreflight(envelope,'a'.repeat(length),{})).toThrow('PRODUCTION_APPROVAL_INVALID');
 });
 it.each(['g'.repeat(64),'A'.repeat(64),' '+ 'a'.repeat(64),'a'.repeat(64)+'\n'])('rejects noncanonical digest text before presentation',hash=>{
  expect(()=>productionApprovalPresentation(fixture().envelope,hash)).toThrow('AUTHORIZATION_SHA256_FORMAT');
 });
 it('rejects a well-formed but incorrect digest',()=>{
  expect(()=>productionApprovalPresentation(fixture().envelope,'a'.repeat(64))).toThrow('PRODUCTION_APPROVAL_INVALID');
 });
 it('rejects malformed approval before materialization makes any query or audit write',async()=>{
  const {envelope}=fixture();const query=vi.fn(),audit=vi.fn();
  await expect(materializeValidationGrant({query},{query},envelope.approval as never,audit,{}, {envelope,sha256:'a'.repeat(62)})).rejects.toThrow();
  expect(query).not.toHaveBeenCalled();expect(audit).not.toHaveBeenCalled();
 });
});
