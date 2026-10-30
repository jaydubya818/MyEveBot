/** RetainedExecutorAgentPort composed with the REAL DeepAgentAdapter. Synthetic only: a fake agent runtime; no provider, spend or network. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {RetainedExecutorAgentPort,AgentExecutionPortRefused} from '../lib/qualification/agent-execution-port.ts';
import {DeepAgentAdapter,AgentNotStarted} from '../lib/qualification/agent-port.ts';
import {ProviderNotSent} from '../lib/qualification/gate.ts';
import {syntheticFactory,h} from './qualification-synthetic.mjs';

const fx=syntheticFactory(),s=fx.stage(1,fx.baseline),e=s.manifest.execution;
const raw={workId:randomUUID(),workVersion:1,workGeneration:1,criteriaVersion:1,agentId:'synthetic-agent',factoryId:fx.factoryId,factoryVersion:fx.factoryVersion,
  requestId:e.requestId,requestDigest:e.requestDigest,sourceDigest:fx.sourceDigest,configurationDigest:fx.configurationDigest,workOrderId:e.workOrderId,runId:e.runId,attemptNumber:1,
  inputCommit:e.inputCommit,inputTree:e.inputTree,localSnapshotVersion:4,configuration:fx.configuration};
const OWNER='owner-q1',H=h('a'),S=h('b'),relay={};
function build({runtime={},retained}={}){
  const calls={start:[],finished:[],retained:[]};
  const rt={available:()=>true,async start(t){calls.start.push(t);return {handle:'run-'+calls.start.length};},async finished(handle){calls.finished.push(handle);return {usageFinal:true};},...runtime};
  const port=new RetainedExecutorAgentPort({runtime:rt,retained:retained??(async n=>{calls.retained.push(n);return {binding:raw,identity:{},request:{}};})});
  const adapter=new DeepAgentAdapter({enabled:true,ownerId:OWNER,slot:'Q1',projectSha256:H,sourceSha256:S,port});
  return {port,adapter,calls};
}
const coding={stage:1,key:'s1-1',purpose:'CODING'},sofie={stage:1,key:'s1-0',purpose:'SOFIE'};

test('CODING reports the tuple of the RETAINED admission, never anything the runtime or model says',async()=>{
  const {adapter,calls}=build();
  assert.deepEqual(await adapter.run(coding,relay),{known:true,value:{execution:{requestId:e.requestId,workOrderId:e.workOrderId,runId:e.runId}}});
  assert.equal(calls.start.length,1);assert.equal(calls.start[0].relay,relay);assert.deepEqual(calls.retained,[1]);
  // the runtime has no channel to supply an execution: even a hostile runtime result field is ignored
  const hostile=build({runtime:{finished:async()=>({usageFinal:true,execution:{requestId:'x',workOrderId:'y',runId:'z'}})}});
  assert.deepEqual((await hostile.adapter.run(coding,relay)).value.execution,{requestId:e.requestId,workOrderId:e.workOrderId,runId:e.runId});
});

test('Sofie planning needs a finished, final-usage run but reads no admission and reports no execution binding',async()=>{
  const {adapter,calls}=build();
  assert.deepEqual(await adapter.run(sofie,relay),{known:true,value:{sofie:'completed'}});
  assert.deepEqual(calls.retained,[]);
});

test('unfinished or non-final usage is unknown exposure (fenced), never a bound execution',async()=>{
  assert.deepEqual(await build({runtime:{finished:async()=>null}}).adapter.run(coding,relay),{known:false});
  assert.deepEqual(await build({runtime:{finished:async()=>({usageFinal:false})}}).adapter.run(coding,relay),{known:false});
});

test('pre-start refusals are proven no-sends: unavailable runtime, stage outside 1-3, provable AgentNotStarted',async()=>{
  const un=build({runtime:{available:()=>false}});
  await assert.rejects(un.adapter.run(coding,relay),ProviderNotSent);assert.equal(un.calls.start.length,0);
  const four=build();
  await assert.rejects(four.adapter.run({stage:4,key:'s4-0',purpose:'CODING'},relay),ProviderNotSent);assert.equal(four.calls.start.length,0);
  await assert.rejects(build({runtime:{start:async()=>{throw new AgentNotStarted('no');}}}).adapter.run(coding,relay),ProviderNotSent);
});

test('post-start failures are ambiguous (not ProviderNotSent) and a bad or duplicate handle is refused',async()=>{
  await assert.rejects(build({runtime:{start:async()=>{throw new Error('socket reset after write');}}}).adapter.run(coding,relay),e2=>!(e2 instanceof ProviderNotSent));
  const dup=build({runtime:{start:async()=>({handle:'same'})}});
  await dup.adapter.run(sofie,relay);
  await assert.rejects(dup.adapter.run({stage:2,key:'s2-0',purpose:'CODING'},relay),e2=>!(e2 instanceof ProviderNotSent));
  await assert.rejects(build({runtime:{start:async()=>({handle:''})}}).port.start({stage:1,key:'k',purpose:'SOFIE',ownerId:OWNER,slot:'Q1',projectSha256:H,sourceSha256:S,relay}),e2=>e2 instanceof AgentExecutionPortRefused);
});

test('a missing, unauthenticated or foreign retained admission is never turned into an execution; unknown handles have no record',async()=>{
  const none=build({retained:async()=>{throw new Error('no retained admission');}});
  await assert.rejects(none.adapter.run(coding,relay),e2=>!(e2 instanceof ProviderNotSent));
  const forged=build({retained:async()=>({binding:{...raw,runId:'not-a-uuid'},identity:{},request:{}})});
  await assert.rejects(forged.adapter.run(coding,relay),e2=>!(e2 instanceof ProviderNotSent));
  assert.equal(await build().port.record('never-started'),null);
});
