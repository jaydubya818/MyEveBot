import assert from 'node:assert/strict';
export const RESULT_SECURITY_CHECKS=Object.freeze([
  'owner-and-tenant-connection-isolation','authenticated-transport-reads-real-Result',
  'three-required-direct-tool-observations-of-one-exact-Result','required-observations-never-dispatch-or-settle',
  'authenticated-response-tamper-denied','request-bound-response-replay-denied','foreign-session-and-Mission-denied',
  'concurrent-reconnect-always-observes-current-Result','stale-revision-never-replays-cached-PASS','wrong-candidate-denied',
  'expired-custody-denied','FactoryVersion-substitution-denied','wrong-executed-settlement-proof',
  'not-dispatched-settlement-cannot-prove-execution','wrong-source-Attempt-artifact-denied','cross-tenant-artifact-denied',
  'missing-artifact-denied','revoked-delegation-denies-Result','anonymous-delegation-admission-denied',
  'anonymous-owner-gate-evaluation-denied','production-environment-denied','same-tenant-Mission-owner-change-denied',
  'changed-approved-Plan-denied','changed-Quality-Contract-denied','restart-durable-readback-without-redispatch',
  'lost-read-ack-reconciles-with-new-read-only-observation','revocation-denies-reconnect','consumer-never-dispatches-or-settles',
]);
const common=RESULT_SECURITY_CHECKS.slice(0,4).concat('consumer-never-dispatches-or-settles');
const record=['stale-revision-never-replays-cached-PASS','wrong-candidate-denied','expired-custody-denied',
  'FactoryVersion-substitution-denied','wrong-executed-settlement-proof','not-dispatched-settlement-cannot-prove-execution',
  'wrong-source-Attempt-artifact-denied','cross-tenant-artifact-denied','missing-artifact-denied','changed-Quality-Contract-denied'];
export const RESULT_SECURITY_COHORTS=Object.freeze({
  'record-integrity':Object.freeze([...common,...record]),
  'authority-recovery':Object.freeze(RESULT_SECURITY_CHECKS.filter(name=>!record.includes(name))),
});
export function resultSecurityChecks(cohort,browser=false) {
  if(cohort===undefined)return RESULT_SECURITY_CHECKS;
  assert.ok(Object.hasOwn(RESULT_SECURITY_COHORTS,cohort),'Unknown Result security cohort');
  assert.equal(browser,false,'Security cohorts cannot substitute for the browser journey');
  return RESULT_SECURITY_COHORTS[cohort];
}
export function safeUnavailableObservation(response,stage,startedAt,lastValidatedDeadline,now=Date.now()) {
  assert.ok(['concurrent-reconnect','fault-restoration','restart-readback','lost-ack-readback'].includes(stage));
  const number=value=>Number.isSafeInteger(value)?value:null;
  return {schema:'result-security-readback-failure/v1',stage,status:['AVAILABLE','NOT_AVAILABLE'].find(value=>value===response?.status)??'UNKNOWN',
    startedAt:number(startedAt),failedAt:number(now),observedAt:number(response?.observedAt),freshUntil:number(response?.freshUntil),lastValidatedDeadline:number(lastValidatedDeadline)};
}
export function validateResultSecurityCohorts(cohorts,expectedSourceSha,expectedMcSha) {
  assert.match(expectedSourceSha??'',/^[a-f0-9]{40}$/);assert.match(expectedMcSha??'',/^[a-f0-9]{40}$/);
  assert.deepEqual(cohorts.map(value=>value.consumer.cohort).sort(),Object.keys(RESULT_SECURITY_COHORTS).sort());
  assert.equal(new Set(cohorts.map(value=>value.proof.missionId)).size,2,'Cohorts require distinct fresh Missions');
  const union=new Set();
  for(const {consumer,proof} of cohorts){
    assert.equal(typeof proof.missionId,'string');assert.ok(proof.missionId.length>0);assert.equal(proof.controllerSourceSha,expectedMcSha);
    assert.equal(consumer.status,'PASS');assert.equal(consumer.myEveSha,expectedSourceSha);assert.equal(consumer.missionId,proof.missionId);
    assert.deepEqual([...consumer.checks].sort(),[...resultSecurityChecks(consumer.cohort)].sort());
    for(const name of consumer.checks)union.add(name);
  }
  assert.deepEqual([...union].sort(),[...RESULT_SECURITY_CHECKS].sort());
  return {status:'PASS',myEveSha:expectedSourceSha,missionControlSha:expectedMcSha,checks:[...union],fullOwnerJourney:'NOT_RUN'};
}
export function validateResultSecurity(consumer,expectedSourceSha,missionId,cohort) {
  assert.match(expectedSourceSha??'',/^[a-f0-9]{40}$/);assert.ok(missionId);
  assert.equal(consumer?.schema,'sofie-completed-result-qualification/v1');assert.equal(consumer.status,'PASS');
  assert.equal(consumer.myeveSourceSha,expectedSourceSha);assert.equal(consumer.myeveDirty,false);
  assert.equal(consumer.cleanup,'VERIFIED');assert.equal(consumer.paidOperations,0);
  assert.equal(consumer.productionIntegration,'NOT_RUN');assert.equal(consumer.executableProductionGrants,0);
  assert.equal(consumer.browser,undefined,'Security qualification must exercise the complete non-browser path');
  assert.equal(consumer.cohort,cohort);
  assert.deepEqual([...consumer.checks].sort(),[...resultSecurityChecks(cohort)].sort());
  assert.equal(consumer.completed?.receipt.response.missionId,missionId);
  assert.equal(consumer.directObservations?.status,'PASS');assert.equal(consumer.directObservations.missionId,missionId);
  assert.deepEqual(consumer.directObservations.observations.map(({kind,index})=>({kind,index})),[
    {kind:'transport',index:0},{kind:'tool',index:0},{kind:'tool',index:1},{kind:'tool',index:2},
  ]);
  return {status:'PASS',cohort,myEveSha:expectedSourceSha,missionId,checks:[...consumer.checks],scope:'SEPARATE_COMPLETED_RESULT_SECURITY_FIXTURE',fullOwnerJourney:'NOT_RUN'};
}
