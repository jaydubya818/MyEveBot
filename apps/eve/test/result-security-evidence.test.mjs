import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RESULT_SECURITY_CHECKS,validateResultSecurity} from './result-security-evidence.mjs';
const sha='a'.repeat(40),mcSha='c'.repeat(40),mission='exact-mission';
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

test('two fixed cohorts preserve every required control and repeat shared checks',async()=>{
 const {RESULT_SECURITY_COHORTS,resultSecurityChecks,validateResultSecurityCohorts}=await import('./result-security-evidence.mjs');
 const cohorts=Object.keys(RESULT_SECURITY_COHORTS).map((cohort,index)=>{
  const x=fixture();x.cohort=cohort;x.checks=[...resultSecurityChecks(cohort)];
  x.completed.receipt.response.missionId=x.directObservations.missionId=`mission-${index}`;
  const consumer=validateResultSecurity(x,sha,`mission-${index}`,cohort);
  assert.ok(consumer.checks.includes('owner-and-tenant-connection-isolation'));
  assert.ok(consumer.checks.includes('three-required-direct-tool-observations-of-one-exact-Result'));
  assert.ok(consumer.checks.includes('consumer-never-dispatches-or-settles'));
  for(const name of consumer.checks){const missing=structuredClone(x);missing.checks=missing.checks.filter(check=>check!==name);assert.throws(()=>validateResultSecurity(missing,sha,`mission-${index}`,cohort));}
  return {consumer,proof:{missionId:`mission-${index}`,controllerSourceSha:mcSha}};
 });
 const report=validateResultSecurityCohorts(cohorts,sha,mcSha);assert.equal(report.checks.length,28);
 assert.throws(()=>validateResultSecurityCohorts(cohorts.slice(0,1),sha,mcSha));
 assert.throws(()=>validateResultSecurityCohorts([cohorts[0],cohorts[0]],sha,mcSha));
 const duplicateMission=structuredClone(cohorts);duplicateMission[1].proof.missionId=duplicateMission[1].consumer.missionId=duplicateMission[0].proof.missionId;
 assert.throws(()=>validateResultSecurityCohorts(duplicateMission,sha,mcSha));
 const wrongSource=structuredClone(cohorts);wrongSource[1].consumer.myEveSha='b'.repeat(40);assert.throws(()=>validateResultSecurityCohorts(wrongSource,sha,mcSha));
 const wrongController=structuredClone(cohorts);wrongController[1].proof.controllerSourceSha='d'.repeat(40);assert.throws(()=>validateResultSecurityCohorts(wrongController,sha,mcSha));
 const blankMission=structuredClone(cohorts);blankMission[1].consumer.missionId=blankMission[1].proof.missionId='';assert.throws(()=>validateResultSecurityCohorts(blankMission,sha,mcSha));
 const missingController=structuredClone(cohorts);delete missingController[1].proof.controllerSourceSha;assert.throws(()=>validateResultSecurityCohorts(missingController,sha,mcSha));
 const nonstringMission=structuredClone(cohorts);nonstringMission[1].consumer.missionId=nonstringMission[1].proof.missionId=123;assert.throws(()=>validateResultSecurityCohorts(nonstringMission,sha,mcSha));
 assert.equal(report.missionControlSha,mcSha);assert.equal(report.myEveSha,sha);
 assert.throws(()=>validateResultSecurityCohorts(cohorts,sha,undefined));assert.throws(()=>validateResultSecurityCohorts(cohorts,'bad',mcSha));
 assert.throws(()=>resultSecurityChecks('unknown'));assert.throws(()=>resultSecurityChecks(''));assert.throws(()=>resultSecurityChecks('record-integrity',true));
 assert.deepEqual(resultSecurityChecks(undefined),RESULT_SECURITY_CHECKS);
});
test('unavailable readback diagnostics retain only fixed stages and safe scalar timing metadata',async()=>{
 const {safeUnavailableObservation}=await import('./result-security-evidence.mjs');
 const response={status:'NOT_AVAILABLE',observedAt:100,freshUntil:90,reason:'SECRET',authentication:{signature:'SECRET'},missionId:'SECRET'};
 assert.deepEqual(safeUnavailableObservation(response,'lost-ack-readback',95,90,105),{schema:'result-security-readback-failure/v1',stage:'lost-ack-readback',status:'NOT_AVAILABLE',startedAt:95,failedAt:105,observedAt:100,freshUntil:90,lastValidatedDeadline:90});
 const unknown=safeUnavailableObservation({status:'SECRET',observedAt:'SECRET',freshUntil:NaN},'fault-restoration',1,2,3);
 assert.equal(unknown.status,'UNKNOWN');assert.equal(unknown.observedAt,null);assert.equal(unknown.freshUntil,null);assert.equal(JSON.stringify(unknown).includes('SECRET'),false);
 assert.throws(()=>safeUnavailableObservation(response,'SECRET',1,2,3));
});
