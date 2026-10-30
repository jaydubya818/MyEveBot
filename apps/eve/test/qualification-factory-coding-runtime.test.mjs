/** FactoryCodingRuntime composed with the REAL RetainedExecutorAgentPort, DeepAgentAdapter and LiveFactoryPort. Fakes only at the Factory HTTP surface: no network, provider or spend. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {FactoryCodingRuntime} from '../lib/qualification/factory-coding-runtime.ts';
import {RetainedExecutorAgentPort} from '../lib/qualification/agent-execution-port.ts';
import {DeepAgentAdapter} from '../lib/qualification/agent-port.ts';
import {LiveFactoryPort} from '../lib/qualification/factory-live-port.ts';
import {ProviderNotSent} from '../lib/qualification/gate.ts';
import {prepareAuthenticatedLocalFactoryInputV4} from '../lib/engineering/factory-authenticated-result.ts';
import {syntheticFactory,h} from './qualification-synthetic.mjs';

const fx=syntheticFactory(),start=fx.baseline,OWNER='owner-q1',H=h('a'),S=h('b'),relay={};
function fixture({maxSpendUsd=1}={}){
  const raw={workId:randomUUID(),workVersion:1,workGeneration:1,criteriaVersion:1,agentId:'synthetic-agent',factoryId:fx.factoryId,factoryVersion:fx.factoryVersion,
    requestId:randomUUID(),requestDigest:h('5'),sourceDigest:fx.sourceDigest,configurationDigest:fx.configurationDigest,workOrderId:randomUUID(),runId:randomUUID(),attemptNumber:1,
    inputCommit:start.commit,inputTree:start.tree,localSnapshotVersion:4,configuration:fx.configuration};
  const b=prepareAuthenticatedLocalFactoryInputV4(raw);
  const request={requestId:b.requestId,workId:b.workId,workGeneration:b.workGeneration,repository:'synthetic/repo',deadline:'2099-01-01T00:00:00.000Z',maxSpendUsd,
    input:{title:'t',description:'d',kind:'feature',baseRef:b.inputCommit,acceptanceCriteria:['a'],reproductionCommand:null,expectedFailureText:null,checkCommands:['c'],allowedPaths:['src'],workerProfile:'mac'}};
  const identity={runId:randomUUID(),writerGeneration:1,dispatchIdentity:'d',workId:b.workId,workGeneration:b.workGeneration,factoryId:b.factoryId,factoryVersion:b.factoryVersion,
    requestId:b.requestId,workOrderId:b.workOrderId,remoteRunId:b.runId,repository:'synthetic/repo',baseSha:b.inputCommit,allowedPaths:['src'],deadline:request.deadline};
  const snapshot={factoryId:b.factoryId,factoryVersion:b.factoryVersion,sourceDigest:b.sourceDigest,configurationDigest:b.configurationDigest,requestId:b.requestId,
    workOrderId:b.workOrderId,runId:b.runId,attemptNumber:1,inputCommit:b.inputCommit,inputTree:b.inputTree,configuration:b.configuration};
  const expected={factoryId:b.factoryId,configurationDigest:b.configurationDigest,requestId:b.requestId,requestDigest:b.requestDigest,workOrderId:b.workOrderId,runId:b.runId,attemptNumber:1,configuration:b.configuration};
  return {raw,b,request,identity,snapshot,expected};
}
const terminal=(f,over={})=>({requestId:f.b.requestId,workOrderId:f.b.workOrderId,runId:f.b.runId,state:'COMPLETED',quiescent:true,evidenceRef:'evidence-1',
  accounting:{activeMicrousd:0,unknownMicrousd:0,settledMicrousd:1000},...over});
const running=f=>terminal(f,{state:'RUNNING',quiescent:false,evidenceRef:null,accounting:{activeMicrousd:500,unknownMicrousd:0,settledMicrousd:0}});
function build(f,{reads,expected,sofie,maxSpend}={}){
  const calls=[],queue=[...(reads??[terminal(f)])];
  const live={prepared:async()=>{calls.push('prepared');return {requestId:f.b.requestId,workOrderId:f.b.workOrderId,runId:f.b.runId,state:'PREPARED',snapshot:f.snapshot};},
    dispatch:async()=>{calls.push('dispatch');},read:async()=>{calls.push('read');return queue.length>1?queue.shift():queue[0];},result:async()=>({state:'COMPLETED',result:{signed:true}})};
  let t=0;
  const retained=async()=>({binding:f.raw,identity:f.identity,request:f.request});
  const factory=new LiveFactoryPort({enabled:true,live,retained,settleTimeoutMs:1000,pollMs:10,now:()=>t,sleep:async ms=>{t+=ms;}});
  const runtime=new FactoryCodingRuntime({project:{factoryVersionSha256:fx.factoryVersion},baseline:start,factory,retained,expectedFor:()=>expected??f.expected,sourceDigest:fx.sourceDigest,sofie});
  const port=new RetainedExecutorAgentPort({runtime,retained});
  const adapter=new DeepAgentAdapter({enabled:true,ownerId:OWNER,slot:'Q1',projectSha256:H,sourceSha256:S,port});
  return {factory,runtime,adapter,calls};
}
const coding=(stage=1,reserveMicrousd=1_300_000)=>({stage,key:`s${stage}-1`,purpose:'CODING',reserveMicrousd});
const sofieOp={stage:1,key:'s1-0',purpose:'SOFIE',reserveMicrousd:100_000};

test('CODING dispatches the prepared native run once, waits for terminal quiescent settlement, then reports the retained tuple',async()=>{
  const f=fixture(),{factory,adapter,calls}=build(f,{reads:[running(f),running(f),terminal(f)]});
  await factory.preflight(1,start);
  const out=await adapter.run(coding(),relay);
  assert.deepEqual(out,{known:true,value:{execution:{requestId:f.b.requestId,workOrderId:f.b.workOrderId,runId:f.b.runId}}});
  assert.equal(calls.filter(c=>c==='dispatch').length,1);
  assert.equal(calls.filter(c=>c==='read').length,3,'start did not return before the quiescent terminal readback');
});

test('a native ceiling above the charged reservation is refused before any native send',async()=>{
  const f=fixture({maxSpendUsd:0.9}),{factory,adapter,calls}=build(f);
  await factory.preflight(1,start);
  await assert.rejects(adapter.run(coding(1,650_000),relay),e=>e instanceof ProviderNotSent);
  assert.ok(!calls.includes('dispatch'));
});

test('nothing is sent when the stage was not prepared, the expectation differs, or the stage is not a Factory coding stage',async()=>{
  const f=fixture();
  const unprepared=build(f);
  await assert.rejects(unprepared.adapter.run(coding(),relay),e=>e instanceof ProviderNotSent);
  const other=fixture();
  const mismatch=build(f,{expected:{...f.expected,runId:other.b.runId}});
  await mismatch.factory.preflight(1,start);
  await assert.rejects(mismatch.adapter.run(coding(),relay),e=>e instanceof ProviderNotSent);
  const three=build(f);await three.factory.preflight(1,start);
  await assert.rejects(three.adapter.run(coding(3),relay),e=>e instanceof ProviderNotSent);
  for(const x of [unprepared,mismatch,three])assert.ok(!x.calls.includes('dispatch'));
});

test('unsettled, unknown or over-ceiling native execution is ambiguous exposure (fenced), and a second start is never a resend',async()=>{
  for(const reads of [[terminal(fixture(),{state:'UNKNOWN'})],[running(fixture())]]){
    const f=fixture();const patched=reads.map(r=>({...r,requestId:f.b.requestId,workOrderId:f.b.workOrderId,runId:f.b.runId}));
    const {factory,adapter,calls}=build(f,{reads:patched});await factory.preflight(1,start);
    await assert.rejects(adapter.run(coding(),relay),e=>!(e instanceof ProviderNotSent));
    assert.equal(calls.filter(c=>c==='dispatch').length,1);
    await assert.rejects(adapter.run(coding(),relay),e=>!(e instanceof ProviderNotSent));
    assert.equal(calls.filter(c=>c==='dispatch').length,1,'no second dispatch');
  }
  const f=fixture(),{factory,adapter}=build(f,{reads:[terminal(f,{accounting:{activeMicrousd:0,unknownMicrousd:0,settledMicrousd:2_000_000}})]});
  await factory.preflight(1,start);
  await assert.rejects(adapter.run(coding(),relay),e=>!(e instanceof ProviderNotSent));
});

test('Sofie is a proven no-send without a planning runtime and is delegated, with its own finished proof, when one is injected',async()=>{
  const f=fixture();
  await assert.rejects(build(f).adapter.run(sofieOp,relay),e=>e instanceof ProviderNotSent);
  const seen=[];
  const sofie={available:()=>true,async start(t){seen.push(t.purpose);return {handle:'sofie-1'};},async finished(handle){return handle==='sofie-1'?{usageFinal:true}:null;}};
  const {adapter,calls}=build(f,{sofie});
  assert.deepEqual(await adapter.run(sofieOp,relay),{known:true,value:{sofie:'completed'}});
  assert.deepEqual(seen,['SOFIE']);assert.deepEqual(calls,[]);
});
