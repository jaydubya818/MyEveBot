import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RESULT_SECURITY_CHECKS,validateResultSecurity} from './result-security-evidence.mjs';
const sha='a'.repeat(40),mission='exact-mission';
const fixture=()=>({schema:'sofie-completed-result-qualification/v1',status:'PASS',myeveSourceSha:sha,myeveDirty:false,cleanup:'VERIFIED',paidOperations:0,productionIntegration:'NOT_RUN',executableProductionGrants:0,checks:[...RESULT_SECURITY_CHECKS],completed:{receipt:{response:{missionId:mission}}},directObservations:{status:'PASS',missionId:mission,observations:[{kind:'transport',index:0},{kind:'tool',index:0},{kind:'tool',index:1},{kind:'tool',index:2}]}});
test('complete named security controls bind the exact source and canonical hybrid Mission',()=>{
 const summary=validateResultSecurity(fixture(),sha,mission);assert.equal(summary.status,'PASS');assert.equal(summary.checks.length,28);assert.equal(summary.fullOwnerJourney,'NOT_RUN');
});
test('every omitted, duplicate and unexpected security control fails closed',()=>{
 for(let i=0;i<RESULT_SECURITY_CHECKS.length;i++){
  const missing=fixture();missing.checks.splice(i,1);assert.throws(()=>validateResultSecurity(missing,sha,mission));
  const duplicate=fixture();duplicate.checks.push(duplicate.checks[i]);assert.throws(()=>validateResultSecurity(duplicate,sha,mission));
 }
 const unexpected=fixture();unexpected.checks.push('narrative-success');assert.throws(()=>validateResultSecurity(unexpected,sha,mission));
});
test('dirty/wrong source, browser early return, wrong Mission, incomplete observations and unauthorized scope deny qualification',()=>{
 const changes=[x=>x.status='NOT_RUN',x=>x.myeveSourceSha='b'.repeat(40),x=>x.myeveDirty=true,x=>delete x.cleanup,x=>x.paidOperations=1,x=>x.productionIntegration='PASS',x=>x.executableProductionGrants=1,x=>x.browser={status:'PASS'},x=>x.completed.receipt.response.missionId='other',x=>x.directObservations.missionId='other',x=>x.directObservations.status='FAIL',x=>x.directObservations.observations.pop()];
 for(const change of changes){const x=fixture();change(x);assert.throws(()=>validateResultSecurity(x,sha,mission));}
 assert.throws(()=>validateResultSecurity(fixture(),undefined,mission));assert.throws(()=>validateResultSecurity(fixture(),sha,''));
});
