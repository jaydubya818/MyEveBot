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
export function validateResultSecurity(consumer,expectedSourceSha,missionId) {
  assert.match(expectedSourceSha??'',/^[a-f0-9]{40}$/);assert.ok(missionId);
  assert.equal(consumer?.schema,'sofie-completed-result-qualification/v1');assert.equal(consumer.status,'PASS');
  assert.equal(consumer.myeveSourceSha,expectedSourceSha);assert.equal(consumer.myeveDirty,false);
  assert.equal(consumer.cleanup,'VERIFIED');assert.equal(consumer.paidOperations,0);
  assert.equal(consumer.productionIntegration,'NOT_RUN');assert.equal(consumer.executableProductionGrants,0);
  assert.equal(consumer.browser,undefined,'Security qualification must exercise the complete non-browser path');
  assert.deepEqual([...consumer.checks].sort(),[...RESULT_SECURITY_CHECKS].sort());
  assert.equal(consumer.completed?.receipt.response.missionId,missionId);
  assert.equal(consumer.directObservations?.status,'PASS');assert.equal(consumer.directObservations.missionId,missionId);
  assert.deepEqual(consumer.directObservations.observations.map(({kind,index})=>({kind,index})),[
    {kind:'transport',index:0},{kind:'tool',index:0},{kind:'tool',index:1},{kind:'tool',index:2},
  ]);
  return {status:'PASS',myEveSha:expectedSourceSha,missionId,checks:[...consumer.checks],scope:'SEPARATE_COMPLETED_RESULT_SECURITY_FIXTURE',fullOwnerJourney:'NOT_RUN'};
}
