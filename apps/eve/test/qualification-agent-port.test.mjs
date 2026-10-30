import test from 'node:test';
import assert from 'node:assert/strict';
import {DeepAgentAdapter,AgentNotStarted,AgentPortRefused} from '../lib/qualification/agent-port.ts';
import {ProviderNotSent} from '../lib/qualification/gate.ts';

const H='a'.repeat(64),S='b'.repeat(64),OWNER='owner-q1';
const exec={requestId:'req-1',workOrderId:'wo-1',runId:'run-1'};
function build(over={},port={}){
  const calls={start:0,record:0};
  const p={available:()=>true,
    async start(task){calls.start++;calls.task=task;return {handle:'h1'};},
    async record(){calls.record++;return {source:'EXECUTOR_RECORD',taskKey:calls.task.key,ownerId:OWNER,projectSha256:H,usageFinal:true,execution:exec};},
    ...port};
  const a=new DeepAgentAdapter({enabled:true,ownerId:OWNER,slot:'Q1',projectSha256:H,sourceSha256:S,port:p,...over});
  return {a,calls};
}
const relay={};
const coding={stage:1,key:'s1-1',purpose:'CODING'};

test('disabled by default: nothing is started and the refusal is a proven no-send',async()=>{
  const {a,calls}=build({enabled:undefined});
  await assert.rejects(a.run(coding,relay),ProviderNotSent);assert.equal(calls.start,0);
  assert.throws(()=>a.admit({ownerId:OWNER,purpose:'SOFIE',projectSha256:H,sourceSha256:S}),e=>e instanceof AgentPortRefused&&e.code==='QDEV_AGENT_DISABLED');
});
test('guarded entrypoint refuses a foreign owner, binding, purpose or unavailable provider before any send',async()=>{
  const {a}=build();
  const ok={ownerId:OWNER,purpose:'SOFIE',projectSha256:H,sourceSha256:S};
  for(const [patch,code] of [[{ownerId:'owner-q2'},'QDEV_AGENT_OWNER'],[{projectSha256:S},'QDEV_AGENT_BINDING'],[{sourceSha256:H},'QDEV_AGENT_BINDING'],[{purpose:'FACTORY'},'QDEV_AGENT_PURPOSE']])
    assert.throws(()=>a.admit({...ok,...patch}),e=>e.code===code,code);
  const un=build({},{available:()=>false});
  await assert.rejects(un.a.run(coding,relay),ProviderNotSent);assert.equal(un.calls.start,0);
});
test('only a provable not-started failure is ProviderNotSent; any other start failure is ambiguous and rethrown',async()=>{
  await assert.rejects(build({},{start:async()=>{throw new AgentNotStarted();}}).a.run(coding,relay),ProviderNotSent);
  await assert.rejects(build({},{start:async()=>{throw new Error('socket reset after write');}}).a.run(coding,relay),e=>!(e instanceof ProviderNotSent)&&/socket reset/.test(e.cause.message));
});
test('coding reports the executor-record execution and only that; the task carries the grant-checked relay',async()=>{
  const {a,calls}=build();
  const out=await a.run(coding,relay);
  assert.deepEqual(out,{known:true,value:{execution:exec}});assert.equal(calls.task.relay,relay);assert.equal(calls.task.slot,'Q1');
});
test('untrusted, foreign, non-final or incomplete records are unknown exposure, never a bound execution',async()=>{
  const base=(task)=>({source:'EXECUTOR_RECORD',taskKey:task.key,ownerId:OWNER,projectSha256:H,usageFinal:true,execution:exec});
  const variants={
    modelSelfReport:r=>({...r,source:'MODEL_REPORT'}),foreignTask:r=>({...r,taskKey:'other'}),foreignOwner:r=>({...r,ownerId:'owner-q2'}),
    foreignProject:r=>({...r,projectSha256:S}),usageNotFinal:r=>({...r,usageFinal:false}),noExecution:r=>({...r,execution:undefined}),
    partialExecution:r=>({...r,execution:{requestId:'r',workOrderId:'',runId:'x'}}),
  };
  for(const [name,mutate] of Object.entries(variants)){
    let task;const {a}=build({},{start:async t=>{task=t;return {handle:'h'};},record:async()=>mutate(base(task))});
    assert.deepEqual(await a.run(coding,relay),{known:false},name);
  }
  const none=build({},{record:async()=>null});assert.deepEqual(await none.a.run(coding,relay),{known:false});
});
test('Sofie planning needs a trusted final record but reports no execution binding',async()=>{
  const {a}=build();assert.deepEqual(await a.run({stage:1,key:'s1-0',purpose:'SOFIE'},relay),{known:true,value:{sofie:'completed'}});
});

test('F5: ProviderNotSent from a nested layer once start began (start or record) is ambiguous, not a tombstone; AgentNotStarted stays a no-send',async()=>{
  for(const [name,port] of [['start',{start:async()=>{throw new ProviderNotSent('nested');}}],['record',{record:async()=>{throw new ProviderNotSent('read preflight refusal');}}]]){
    const {a}=build({},port);
    await assert.rejects(a.run(coding,relay),e=>!(e instanceof ProviderNotSent)&&/^QDEV_AGENT_(START_AMBIGUOUS|RECORD_UNAVAILABLE)$/.test(e.message)&&e.cause instanceof ProviderNotSent,name);
  }
  await assert.rejects(build({},{start:async()=>{throw new AgentNotStarted();}}).a.run(coding,relay),ProviderNotSent);
});
