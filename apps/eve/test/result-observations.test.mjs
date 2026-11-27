import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qualifyResultObservations} from './result-observations.mjs';
import {contentDigest} from '../lib/missioncontrol/consumer.ts';

const expected={missionId:'mission',planDigest:'plan-digest',ownerId:'owner',tenantId:'tenant',projectId:'project'};
function envelope(commandId) {return {authentication:{commandId,signature:'SECRET_SIGNATURE'},response:{...expected,plan:{missionId:'mission',planDigest:'plan-digest'},status:'AVAILABLE',enterpriseQualityGate:'PASS',ownerAcceptance:'PENDING',observedAt:900,freshUntil:2000,workOrders:[1,2,3].map(id=>({workOrderId:'wo-'+id,candidate:'candidate-'+id,proofDigest:'proof-'+id,verificationAttemptId:'verifier-'+id,evidenceSetDigest:'evidence-'+id}))}};}
function fixture(overrides={}) {
  const snapshots=[];let reads=0,validations=0;
  const options={expected,sourceSha:'source',missionControlSourceSha:'controller',stableDigest:contentDigest,now:()=>1000,writeProgress:async value=>snapshots.push(structuredClone(value)),
    readTransport:async()=>envelope('transport'),readTool:async()=>({receipt:envelope('tool-'+(++reads)),explanation:'Quality Gate is PASS'}),validate:()=>{validations++;},...overrides};
  return {options,snapshots,reads:()=>reads,validations:()=>validations};
}
test('three distinct direct observations retain exact proof identity and safe boundary timing',async()=>{
  const f=fixture(),result=await qualifyResultObservations(f.options);
  assert.equal(f.reads(),3);assert.equal(f.validations(),4);assert.equal(result.progress.status,'PASS');assert.equal(result.progress.observations.length,4);
  assert.equal(result.completed.receipt.authentication.commandId,'tool-3');
  assert.equal(f.snapshots[0].current.kind,'transport');assert.equal(f.snapshots[0].observations.length,0);
  for(const kind of ['transport','tool'])assert.ok(f.snapshots.some(s=>s.current.kind===kind && s.current.startedAt===1000));
  assert.equal(JSON.stringify(f.snapshots).includes('SECRET_SIGNATURE'),false);
});
test('any required tool failure stops immediately without retries and retains prior safe evidence',async()=>{
  let calls=0;const failure=new Error('SECRET_FAILURE'),f=fixture({readTool:async()=>{if(++calls===2)throw failure;return {receipt:envelope('tool-'+calls)};}});
  await assert.rejects(()=>qualifyResultObservations(f.options),error=>error===failure);
  assert.equal(calls,2);const final=f.snapshots.at(-1);assert.equal(final.status,'FAIL');assert.equal(final.current.index,1);assert.equal(final.observations.length,2);assert.equal(final.failedAt,1000);
  assert.equal(JSON.stringify(f.snapshots).includes('SECRET_FAILURE'),false);
});
test('changed Mission, Plan, owner, tenant, proof, expired evidence and repeated commands fail closed',async()=>{
  for(const change of [e=>e.response.missionId='foreign',e=>e.response.plan.planDigest='foreign',e=>e.response.ownerId='foreign',e=>e.response.tenantId='foreign',e=>e.response.workOrders[0].candidate='foreign',e=>e.response.workOrders[0].sourceAttemptId='foreign',e=>e.response.workOrders[0].verificationReceiptId='foreign',e=>e.response.workOrders[0].settlementDigest='foreign',e=>e.response.workOrders[0].provider='foreign',e=>e.response.freshUntil=999,e=>e.authentication.commandId='transport']) {
    let calls=0;const f=fixture({readTool:async()=>{calls++;const value=envelope('tool');change(value);return {receipt:value};}});
    await assert.rejects(()=>qualifyResultObservations(f.options));assert.equal(calls,1);assert.equal(f.snapshots.at(-1).status,'FAIL');
  }
});
test('transport failure is persisted before any tool observation and canonical validation is mandatory',async()=>{
  let calls=0;const f=fixture({readTransport:async()=>{assert.equal(f.snapshots[0].current.kind,'transport');throw Error('transport failure');},readTool:async()=>{calls++;}});
  await assert.rejects(()=>qualifyResultObservations(f.options));assert.equal(calls,0);assert.equal(f.snapshots.at(-1).status,'FAIL');
  const denied=fixture({validate:()=>{throw Error('canonical signature denial');}});
  await assert.rejects(()=>qualifyResultObservations(denied.options));assert.equal(denied.reads(),0);assert.equal(denied.snapshots.at(-1).status,'FAIL');
});
test('failure persistence never masks the original error and normal persistence errors fail closed',async()=>{
  const original=console.error,logs=[];console.error=value=>logs.push(String(value));
  try {
    const failure=new Error('SECRET_ORIGINAL'),writeFailure=new Error('SECRET_DISK');
    const f=fixture({readTransport:async()=>{throw failure;},writeProgress:async progress=>{if(progress.status==='FAIL')throw writeFailure;}});
    await assert.rejects(()=>qualifyResultObservations(f.options),error=>error===failure);
    let reads=0;const noEvidence=fixture({readTransport:async()=>{reads++;},writeProgress:async()=>{throw writeFailure;}});
    await assert.rejects(()=>qualifyResultObservations(noEvidence.options),error=>error===writeFailure);assert.equal(reads,0);
    assert.equal(logs.length,2);assert.equal(logs.join('').includes('SECRET_'),false);
  } finally {console.error=original;}
});
