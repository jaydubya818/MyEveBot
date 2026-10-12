import { describe,expect,it } from 'vitest';
import { permitFixture } from './permit-test-fixture.ts';
import { authenticateResultRequest,readbackSignature,type ResultRequest } from './result-protocol.ts';
const secret='fixture-secret-for-readback-with-32-characters';
function fixture(){
 const f=permitFixture({ownerId:'fixture-owner',workId:'fixture-work',workVersion:1,workGeneration:1,
  tupleSha256:'a'.repeat(64),maxCostMicrousd:1300000,maxDurationSeconds:180});
 const e=f.enrollment;
 const document:ResultRequest={schema:'mc-result-request/v1',connectionId:e.connectionId,installationId:e.installationId,
  ownerId:e.ownerId,projectId:e.projectId,permitId:f.document.permitId,commandId:'fixture-read',challenge:'c'.repeat(64),
  issuer:e.issuer,audience:e.audience,issuedAt:f.now,expiresAt:f.now+30000};
 const packet=(d=document)=>({document:d,signature:readbackSignature(d,'mc-result-request/v1',secret)});
 return {...f,document,packet};
}
describe('authenticated original Result readback',()=>{
 it('accepts the exact enrolled owner connection and bounded challenge',()=>{
  const f=fixture();expect(authenticateResultRequest(f.packet(),f.enrollment,secret,f.now)).toEqual(f.document);
 });
 for(const field of ['connectionId','installationId','ownerId','projectId','issuer','audience'] as const)
  it(`denies a correctly signed foreign ${field}`,()=>{
   const f=fixture();expect(()=>authenticateResultRequest(f.packet({...f.document,[field]:'foreign'}),f.enrollment,secret,f.now)).toThrow('MISSIONCONTROL_RESULT_ACCESS_DENIED');
  });
 it('denies revoked enrollment, expired, future and extended requests',()=>{
  const f=fixture();
  for(const change of [{expiresAt:f.now},{issuedAt:f.now+1},{expiresAt:f.now+30001}])
   expect(()=>authenticateResultRequest(f.packet({...f.document,...change}),f.enrollment,secret,f.now)).toThrow();
  expect(()=>authenticateResultRequest(f.packet(),{...f.enrollment,revokedAt:f.now},secret,f.now)).toThrow();
 });
 it('separates request signatures from response signatures and rejects altered permit IDs',()=>{
  const f=fixture();const packet=f.packet();packet.document={...packet.document,permitId:'foreign'};
  expect(()=>authenticateResultRequest(packet,f.enrollment,secret,f.now)).toThrow();
  expect(()=>authenticateResultRequest({document:f.document,signature:readbackSignature(f.document,'mc-result-readback/v1',secret)},f.enrollment,secret,f.now)).toThrow();
 });
});
