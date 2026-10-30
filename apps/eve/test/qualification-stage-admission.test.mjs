/** Ordered Factory stage admission (MissionControl proof -> prepare -> retained admission) composed with LiveFactoryPort. Fakes only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {FactoryStageAdmitter,FactoryStageAdmissionRefused} from '../lib/qualification/factory-stage-admission.ts';
import {LiveFactoryPort,FactoryLivePortRefused} from '../lib/qualification/factory-live-port.ts';
import {syntheticFactory} from './qualification-synthetic.mjs';

const fx=syntheticFactory(),start=fx.baseline;
function build(over={}){
  const s=fx.stage(1,start),e=s.manifest.execution,order=[];
  const work={id:randomUUID(),version:1,generation:1,criteriaVersion:1,agentId:'synthetic-agent'};
  const request={requestId:e.requestId,workId:work.id,workGeneration:1,repository:'synthetic/repo',deadline:'2099-01-01T00:00:00.000Z',maxSpendUsd:1,
    input:{title:'t',description:'d',kind:'feature',baseRef:start.commit,acceptanceCriteria:['a'],reproductionCommand:null,expectedFailureText:null,checkCommands:['c'],allowedPaths:fx.configuration.allowedPaths,workerProfile:'mac'}};
  const readback={requestId:e.requestId,workOrderId:e.workOrderId,runId:e.runId,state:'PREPARED',snapshot:e,spend:{status:'KNOWN',ceilingUsd:1}};
  const sources={enabled:true,work:()=>work,start:()=>start,request:()=>request,
    missionControl:async()=>{order.push('proof');return {synthetic:'proof'};},
    prepare:async(r,proof)=>{order.push('prepare');assert.deepEqual(proof,{synthetic:'proof'});return readback;},
    identity:(stage,w,rb,rq)=>({runId:randomUUID(),writerGeneration:1,dispatchIdentity:'d',workId:w.id,workGeneration:w.generation,factoryId:e.factoryId,factoryVersion:e.factoryVersion,requestId:e.requestId,
      workOrderId:e.workOrderId,remoteRunId:e.runId,repository:rq.repository,baseSha:start.commit,allowedPaths:rq.input.allowedPaths,deadline:rq.deadline}),...over};
  return {e,work,request,readback,sources,order,admitter:new FactoryStageAdmitter(sources)};
}
const refused=(p,code)=>assert.rejects(p,x=>x instanceof FactoryStageAdmissionRefused&&x.code===code,code);

test('ordered admission: proof first, then prepare once; the retained admission feeds LiveFactoryPort which re-proves it',async()=>{
  const b=build();
  const retained=await b.admitter.retained(1);
  assert.deepEqual(b.order,['proof','prepare']);
  await b.admitter.retained(1);assert.deepEqual(b.order,['proof','prepare'],'a second call never re-prepares');
  assert.equal(retained.binding.workId,b.work.id);assert.equal(retained.binding.inputTree,start.tree);assert.equal(retained.binding.localSnapshotVersion,4);
  const calls=[];
  const port=new LiveFactoryPort({enabled:true,retained:s=>b.admitter.retained(s),live:{prepared:async()=>b.readback,dispatch:async()=>{calls.push('dispatch');},read:async()=>({}),result:async()=>({})}});
  await port.ready(1);
  assert.equal(port.admit(1,start).requestId,b.e.requestId);
  assert.deepEqual(calls,[]);
});
test('disabled by default; absent MissionControl proof, missing/odd snapshots and unstartable spend are refused before dispatch',async()=>{
  await refused(build({enabled:false}).admitter.retained(1),'QDEV_STAGE_ADMISSION_DISABLED');
  const none=build({missionControl:async()=>null});
  await refused(none.admitter.retained(1),'QDEV_STAGE_ADMISSION_REQUIRED');
  assert.deepEqual(none.order,[],'prepare is never reached without a proof');
  const b=build();
  await refused(build({prepare:async()=>({...b.readback,snapshot:null})}).admitter.retained(1),'QDEV_STAGE_ADMISSION_SNAPSHOT');
  await refused(build({prepare:async()=>({...b.readback,state:'PREPARING'})}).admitter.retained(1),'QDEV_STAGE_ADMISSION_STATE');
  await refused(build({prepare:async()=>({...b.readback,snapshot:{...b.e,inputTree:'9'.repeat(40)}})}).admitter.retained(1),'QDEV_STAGE_ADMISSION_SNAPSHOT');
  await refused(build({prepare:async()=>({...b.readback,runId:randomUUID()})}).admitter.retained(1),'QDEV_STAGE_ADMISSION_SNAPSHOT');
  await refused(build({prepare:async()=>({...b.readback,spend:{currency:'USD',workId:'x',ceilingMicrousd:1}})}).admitter.retained(1),'QDEV_STAGE_ADMISSION_SPEND');
});
test('a request that disagrees with the trusted Work or start, or an identity with foreign paths, is refused',async()=>{
  const b=build();
  await refused(build({request:()=>({...b.request,workId:randomUUID()})}).admitter.retained(1),'QDEV_STAGE_ADMISSION_REQUEST');
  await refused(build({request:()=>({...b.request,input:{...b.request.input,baseRef:'7'.repeat(40)}})}).admitter.retained(1),'QDEV_STAGE_ADMISSION_REQUEST');
  await refused(build({identity:(s,w,rb,rq)=>({...b.sources.identity(s,w,rb,rq),allowedPaths:['.github']})}).admitter.retained(1),'QDEV_STAGE_ADMISSION_IDENTITY');
  // and LiveFactoryPort still refuses an identity/binding disagreement downstream
  const bad=build({identity:(s,w,rb,rq)=>({...b.sources.identity(s,w,rb,rq),workOrderId:randomUUID()})});
  const port=new LiveFactoryPort({enabled:true,retained:s=>bad.admitter.retained(s),live:{prepared:async()=>bad.readback,dispatch:async()=>{},read:async()=>({}),result:async()=>({})}});
  await assert.rejects(port.ready(1),x=>x instanceof FactoryLivePortRefused&&x.code==='QDEV_FACTORY_IDENTITY_MISMATCH');
});
