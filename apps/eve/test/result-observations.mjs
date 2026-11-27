import assert from 'node:assert/strict';

// Required observations, never retries. A failure ends this qualification immediately.
export async function qualifyResultObservations({readTransport,readTool,validate,stableDigest,expected,sourceSha,missionControlSourceSha,writeProgress,now=Date.now}) {
  const progress={schema:'checkpoint-h-direct-result-observations/v1',sourceSha,missionControlSourceSha,scope:'DIRECT_COMPONENT_OBSERVATIONS',status:'IN_PROGRESS',
    missionId:expected.missionId,planDigest:expected.planDigest,ownerId:expected.ownerId,tenantId:expected.tenantId,projectId:expected.projectId,observations:[]};
  const commandIds=new Set();let proofIdentity,completed;
  async function observe(kind,index,read) {
    const startedAt=now();progress.current={kind,index,startedAt};await writeProgress(progress);
    const value=await read(),receivedAt=now(),envelope=kind==='transport'?value:value.receipt;
    validate(envelope);
    const result=envelope.response;
    assert.equal(result.missionId,expected.missionId);assert.equal(result.plan.missionId,expected.missionId);
    assert.equal(result.plan.planDigest,expected.planDigest);assert.equal(result.ownerId,expected.ownerId);
    assert.equal(result.tenantId,expected.tenantId);assert.equal(result.projectId,expected.projectId);
    assert.equal(result.status,'AVAILABLE');assert.equal(result.enterpriseQualityGate,'PASS');assert.equal(result.ownerAcceptance,'PENDING');
    assert.ok(result.observedAt<=receivedAt && result.freshUntil>receivedAt,'Each observation must still be current');
    const commandId=envelope.authentication.commandId;
    assert.ok(typeof commandId==='string' && commandId.length>0 && !commandIds.has(commandId),'Each read requires a distinct signed command');commandIds.add(commandId);
    assert.equal(result.workOrders.length,3);
    const workOrders=[...result.workOrders].sort((a,b)=>a.workOrderId.localeCompare(b.workOrderId));
    const proofs=workOrders.map(wo=>({workOrderId:wo.workOrderId,revisionId:wo.revisionId,revision:wo.revision,sourceAttemptId:wo.sourceAttemptId,candidate:wo.candidate,proofDigest:wo.proofDigest,verificationAttemptId:wo.verificationAttemptId,verificationReceiptId:wo.verificationReceiptId,evidenceSetDigest:wo.evidenceSetDigest}));
    assert.equal(new Set(proofs.map(proof=>proof.workOrderId)).size,3);
    const resultIdentityDigest=stableDigest({plan:result.plan,qualityContract:result.qualityContract,assertions:result.assertions,workOrders});
    if(proofIdentity)assert.equal(resultIdentityDigest,proofIdentity,'Required reads must describe the same exact Result and accounting bindings');else proofIdentity=resultIdentityDigest;
    progress.observations.push({kind,index,commandId,startedAt,receivedAt,observedAt:result.observedAt,freshUntil:result.freshUntil,resultIdentityDigest,proofs});
    await writeProgress(progress);return value;
  }
  try {
    await observe('transport',0,readTransport);
    for(let index=0;index<3;index++)completed=await observe('tool',index,readTool);
    progress.status='PASS';progress.completedAt=now();await writeProgress(progress);
    return {completed,progress};
  } catch(error) {
    progress.status='FAIL';progress.failedAt=now();progress.failure='REQUIRED_OBSERVATION_FAILED';
    try {await writeProgress(progress);} catch {
      try {console.error('[enterprise-fixture-diagnostic] {"phase":"result-observation-progress","outcome":"FAIL","code":"PROGRESS_WRITE_FAILED"}');} catch {}
    }
    throw error;
  }
}
