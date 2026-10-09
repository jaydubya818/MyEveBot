import { describe, expect, it } from 'vitest';
import { ownerWorkPresentation } from './owner-work';
import { workState } from './work-state';
import type { EngineeringWorkerProjection } from '../engineering/worker-projection';
function fixture(overrides: Partial<EngineeringWorkerProjection> = {}) {
  return { workId:'work-a', workVersion:1, criteriaVersion:1, lifecycle:'active', control:'agent', status:'Queued', attention:null, pendingDecisions:[], verification:{status:'PASS',candidateSha:'candidate-a'}, runTruth:{activeRun:null}, nativeDevelopment:null, nativeExecution:null, ...overrides } as EngineeringWorkerProjection;
}
const result = {id:'result-a',current:true,contentHash:'hash',proof:{workId:'work-a',workVersion:1,criteriaVersion:1,resultRevision:'candidate-a',outcome:'PARTIAL',evidence:[{criterionId:'criterion-a',resultRevision:'candidate-a',state:'PASS'}]}} as NonNullable<EngineeringWorkerProjection['nativeResult']>;
describe('owner Work presentation never upgrades authority or stale evidence',()=>{
 it.each([null,{resultId:'other',completedVersion:2,completedGeneration:2}])('requires exact acceptance before showing external completion',acceptance=>{
  expect(ownerWorkPresentation(fixture({workVersion:2,workGeneration:2,lifecycle:'accepted',nativeResult:result,externalAlpha:{state:'COMPLETED',acceptance} as any})).status).toBe('Outcome unconfirmed');
 });
 it('shows accepted private completion without rewriting the original Proof',()=>{
  const work=fixture({workVersion:2,workGeneration:2,lifecycle:'accepted',nativeResult:result,externalAlpha:{state:'COMPLETED',acceptance:{resultId:'result-a',completedVersion:2,completedGeneration:2}} as any});
  expect(ownerWorkPresentation(work)).toMatchObject({status:'Completed',verified:true,currentResult:true});expect(work.nativeResult?.proof.outcome).toBe('PARTIAL');
 });
 it('keeps a verified partial candidate distinct from completion',()=>{const p=ownerWorkPresentation(fixture({nativeResult:result}));expect(p.status).toBe('Verified candidate');expect(p.checksPassed).toBe(1);expect(p.currentResult).toBe(true);});
 it.each([{current:false},{proof:{...result.proof,workVersion:2}},{proof:{...result.proof,workId:'other-work'}},{proof:{...result.proof,criteriaVersion:2}}])('does not verify a stale or foreign Result',override=>{expect(ownerWorkPresentation(fixture({nativeResult:{...result,...override}})).verified).toBe(false);});
 it('does not reuse verification for a different candidate',()=>expect(ownerWorkPresentation(fixture({nativeResult:result,verification:{status:'PASS',candidateSha:'other'} as any})).verified).toBe(false));
 it('a conflicting duplicate criterion is not a pass',()=>{const p=ownerWorkPresentation(fixture({nativeResult:{...result,proof:{...result.proof,evidence:[...result.proof.evidence,{...result.proof.evidence[0],state:'FAIL'}]}}}));expect(p.verified).toBe(false);expect(p.checksTotal).toBe(1);expect(p.checksPassed).toBe(0);});
 it('zero recorded checks never means verified',()=>expect(ownerWorkPresentation(fixture({nativeResult:{...result,proof:{...result.proof,evidence:[]}}})).verified).toBe(false));
 it('all current Work criteria must have passing evidence',()=>{const p=ownerWorkPresentation(fixture({criteria:[{id:'criterion-a',statement:'First',method:'test'},{id:'criterion-b',statement:'Second',method:'test'}],nativeResult:result}));expect(p.checksTotal).toBe(2);expect(p.checksPassed).toBe(1);expect(p.verified).toBe(false);});
 it('UNKNOWN overrides retained verification',()=>expect(ownerWorkPresentation(fixture({nativeResult:result,externalAlpha:{state:'UNKNOWN'} as any})).status).toBe('Outcome unconfirmed'));
 it('reserved unknown model usage is not working or success',()=>expect(ownerWorkPresentation(fixture({nativeResult:result,nativeRuntime:{usageUnknown:true,inflight:true} as any})).status).toBe('Outcome unconfirmed'));
 it('a paused Work is stopped rather than queued execution',()=>expect(ownerWorkPresentation(fixture({control:'paused'})).status).toBe('Stopped'));
 it('an issued external request does not prove current liveness',()=>expect(ownerWorkPresentation(fixture({externalAlpha:{state:'ISSUED'} as any})).status).toBe('Queued'));
 it('a confirmed active run is working',()=>expect(ownerWorkPresentation(fixture({runTruth:{activeRun:{id:'run'}} as any})).status).toBe('Working'));
 it('a current verification request is verifying',()=>expect(ownerWorkPresentation(fixture({nativeDevelopment:{current:true,phase:'VERIFICATION_REQUESTED'} as any})).status).toBe('Verifying'));
 it('verified private partial results are ready for review, not completed',()=>expect(workState(fixture({nativeResult:result,externalAlpha:{result:{current:true}} as any})).lane).toBe('Ready'));
 it('a decision takes precedence over a verified result',()=>expect(workState(fixture({nativeResult:result,externalAlpha:{result:{current:true}} as any,pendingDecisions:['decision']})).lane).toBe('Needs You'));
 it.each(['FAILED','NOT_DISPATCHED'])('a terminal external %s is not active',factoryOutcome=>expect(workState(fixture({externalAlpha:{factoryOutcome} as any})).lane).toBe('Needs You'));
 it('a paused external request is stopped',()=>expect(workState(fixture({control:'paused',externalAlpha:{state:'ISSUED'} as any})).lane).toBe('Stopped'));
 it('an unverified current result needs attention',()=>expect(workState(fixture({nativeResult:result,verification:{status:'FAIL',candidateSha:'candidate-a'} as any})).lane).toBe('Needs You'));
});
