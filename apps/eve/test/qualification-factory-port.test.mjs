/** LiveFactoryPort over the existing LiveFactoryAdapter surface. Fakes only: no network, provider, credential or spend. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {LiveFactoryPort,FactoryLivePortRefused,FactoryResultPending} from '../lib/qualification/factory-live-port.ts';
import {ProviderNotSent} from '../lib/qualification/gate.ts';
import {prepareAuthenticatedLocalFactoryInputV4} from '../lib/engineering/factory-authenticated-result.ts';
import {bindFactoryDispatch} from '../lib/qualification/factory-dispatch.ts';
import {syntheticFactory,h} from './qualification-synthetic.mjs';

const fx=syntheticFactory(),start=fx.baseline;
function fixture(over={}){
  const raw={workId:randomUUID(),workVersion:1,workGeneration:1,criteriaVersion:1,agentId:'synthetic-agent',factoryId:fx.factoryId,factoryVersion:fx.factoryVersion,
    requestId:randomUUID(),requestDigest:h('5'),sourceDigest:fx.sourceDigest,configurationDigest:fx.configurationDigest,workOrderId:randomUUID(),runId:randomUUID(),attemptNumber:1,
    inputCommit:start.commit,inputTree:start.tree,localSnapshotVersion:4,configuration:fx.configuration,...over};
  const b=prepareAuthenticatedLocalFactoryInputV4(raw);
  const request={requestId:b.requestId,workId:b.workId,workGeneration:b.workGeneration,repository:'synthetic/repo',deadline:'2099-01-01T00:00:00.000Z',maxSpendUsd:1,
    input:{title:'t',description:'d',kind:'feature',baseRef:b.inputCommit,acceptanceCriteria:['a'],reproductionCommand:null,expectedFailureText:null,checkCommands:['c'],allowedPaths:['src'],workerProfile:'mac'}};
  const identity={runId:randomUUID(),writerGeneration:1,dispatchIdentity:'d',workId:b.workId,workGeneration:b.workGeneration,factoryId:b.factoryId,factoryVersion:b.factoryVersion,
    requestId:b.requestId,workOrderId:b.workOrderId,remoteRunId:b.runId,repository:'synthetic/repo',baseSha:b.inputCommit,allowedPaths:['src'],deadline:request.deadline};
  const snapshot={factoryId:b.factoryId,factoryVersion:b.factoryVersion,sourceDigest:b.sourceDigest,configurationDigest:b.configurationDigest,requestId:b.requestId,
    workOrderId:b.workOrderId,runId:b.runId,attemptNumber:1,inputCommit:b.inputCommit,inputTree:b.inputTree,configuration:b.configuration};
  return {raw,b,request,identity,snapshot};
}
const terminal=(f,over={})=>({requestId:f.b.requestId,workOrderId:f.b.workOrderId,runId:f.b.runId,state:'COMPLETED',quiescent:true,evidenceRef:'evidence-1',
  accounting:{activeMicrousd:0,unknownMicrousd:0,settledMicrousd:1000},...over});
function port(f,opts={}){
  const {enabled=true,readback,retained,reads,settleTimeoutMs=1000}=opts,hasEnvelope='envelope' in opts,envelope=opts.envelope;
  const calls=[];
  const queue=[...(reads??[terminal(f)])];
  const live={prepared:async r=>{calls.push(['prepared',r.requestId]);return readback??{requestId:f.b.requestId,workOrderId:f.b.workOrderId,runId:f.b.runId,state:'PREPARED',snapshot:f.snapshot};},
    dispatch:async i=>{calls.push(['dispatch',i.requestId]);if(opts.dispatchError)throw opts.dispatchError;},
    read:async i=>{calls.push(['read',i.requestId]);if(opts.readError)throw opts.readError;return queue.length>1?queue.shift():queue[0];},
    result:async b=>{calls.push(['result',b.requestId]);return hasEnvelope?envelope:{state:'COMPLETED',result:{signed:true}};}};
  let t=0;
  return {calls,port:new LiveFactoryPort({enabled,live,retained:()=>retained??{binding:f.raw,identity:f.identity,request:f.request},settleTimeoutMs,pollMs:10,now:()=>t,sleep:async ms=>{t+=ms;}})};
}
const refused=(p,code)=>assert.rejects(p,e=>e instanceof FactoryLivePortRefused&&e.code===code,code);

test('disabled by default: no preparation, dispatch or result I/O',async()=>{
  const f=fixture(),{port:p,calls}=port(f,{enabled:false});
  await refused(p.ready(1),'QDEV_FACTORY_DISABLED');
  await assert.rejects(p.dispatch(f.b),e=>e instanceof ProviderNotSent);
  await refused(p.fetchResult(1),'QDEV_FACTORY_DISABLED');
  assert.deepEqual(calls,[]);
});
test('admit is refused until the exact prepared execution is proved, then dispatch and result use the existing client',async()=>{
  const f=fixture(),{port:p,calls}=port(f);
  assert.throws(()=>p.admit(1,start),e=>e.code==='QDEV_FACTORY_NOT_READY');
  await p.ready(1);
  assert.deepEqual(p.admit(1,start),f.raw);
  assert.throws(()=>p.admit(1,{commit:'3'.repeat(40),tree:start.tree}),e=>e.code==='QDEV_FACTORY_START_MISMATCH');
  assert.deepEqual(await p.dispatch(prepareAuthenticatedLocalFactoryInputV4(p.admit(1,start))),{known:true,value:{state:'COMPLETED',evidenceRef:'evidence-1',settledMicrousd:1000}});
  assert.deepEqual(await p.fetchResult(1),{signed:true});
  assert.deepEqual(calls.map(c=>c[0]),['prepared','dispatch','read','result']);
});
test('a prepared readback that differs from the retained admission is refused before any claim',async()=>{
  const f=fixture();
  const base={requestId:f.b.requestId,workOrderId:f.b.workOrderId,runId:f.b.runId,state:'PREPARED',snapshot:f.snapshot};
  await refused(port(f,{readback:{...base,state:'PREPARING',snapshot:null}}).port.ready(1),'QDEV_FACTORY_NOT_PREPARED');
  await refused(port(f,{readback:{...base,runId:randomUUID()}}).port.ready(1),'QDEV_FACTORY_PREPARED_MISMATCH');
  await refused(port(f,{readback:{...base,snapshot:{...f.snapshot,inputTree:'9'.repeat(40)}}}).port.ready(1),'QDEV_FACTORY_PREPARED_MISMATCH');
  await refused(port(f,{readback:{...base,snapshot:{...f.snapshot,configuration:{...f.snapshot.configuration,model:'other/model'}}}}).port.ready(1),'QDEV_FACTORY_PREPARED_MISMATCH');
});
test('an execution identity or request that disagrees with the binding is refused',async()=>{
  const f=fixture();
  for(const [k,v] of [['workOrderId',randomUUID()],['remoteRunId',randomUUID()],['baseSha','4'.repeat(40)],['factoryVersion',h('8')],['allowedPaths',['src','.github']]])
    await refused(port(f,{retained:{binding:f.raw,identity:{...f.identity,[k]:v},request:f.request}}).port.ready(1),'QDEV_FACTORY_IDENTITY_MISMATCH');
  await refused(port(f,{retained:{binding:f.raw,identity:f.identity,request:{...f.request,input:{...f.request.input,baseRef:'5'.repeat(40)}}}}).port.ready(1),'QDEV_FACTORY_IDENTITY_MISMATCH');
});
test('dispatch refuses a binding that was not the prepared one, before the client is touched',async()=>{
  const f=fixture(),{port:p,calls}=port(f);
  await p.ready(1);
  const other=fixture();
  await assert.rejects(p.dispatch(other.b),e=>e instanceof ProviderNotSent);
  await assert.rejects(p.dispatch({...f.b,configurationDigest:h('6')}),e=>e instanceof ProviderNotSent);
  assert.deepEqual(calls.map(c=>c[0]),['prepared']);
});

test('F2: a dispatch acknowledgment is not final usage; known:true only after terminal quiescence with zero active/unknown spend',async()=>{
  const f=fixture();
  const running=terminal(f,{state:'RUNNING',quiescent:false,evidenceRef:null,accounting:{activeMicrousd:1000,unknownMicrousd:0,settledMicrousd:0}});
  const a=port(f,{reads:[running,running,running,terminal(f)]});await a.port.ready(1);
  assert.equal((await a.port.dispatch(prepareAuthenticatedLocalFactoryInputV4(a.port.admit(1,start)))).known,true);
  assert.equal(a.calls.filter(c=>c[0]==='read').length,4,'kept polling through nonterminal readbacks');
  for(const [name,reads] of Object.entries({
    stillRunningUntilTimeout:[running],
    unknown:[terminal(f,{state:'UNKNOWN',quiescent:false,evidenceRef:null})],
    activeSpend:[terminal(f,{accounting:{activeMicrousd:5,unknownMicrousd:0,settledMicrousd:0}})],
    unknownSpend:[terminal(f,{accounting:{activeMicrousd:0,unknownMicrousd:5,settledMicrousd:0}})],
    spendUnproven:[terminal(f,{accounting:{activeMicrousd:null,unknownMicrousd:null,settledMicrousd:null}})],
    noEvidence:[terminal(f,{evidenceRef:null})],
    foreignRun:[terminal(f,{runId:randomUUID()})],
  })){
    const x=port(f,{reads});await x.port.ready(1);
    assert.deepEqual(await x.port.dispatch(prepareAuthenticatedLocalFactoryInputV4(x.port.admit(1,start))),{known:false},name);
    assert.equal(x.calls.filter(c=>c[0]==='dispatch').length,1,name+': never resent');
  }
  const failing=port(f);await failing.port.ready(1);
  failing.port.c.live.read=async()=>{throw new Error('unavailable');};
  await assert.rejects(failing.port.dispatch(prepareAuthenticatedLocalFactoryInputV4(failing.port.admit(1,start))),e=>!(e instanceof ProviderNotSent));
});
test('F1: fetchResult unwraps the existing result-channel envelope; pending/unknown states are preserved without redispatch',async()=>{
  const f=fixture();
  const ok=port(f);await ok.port.ready(1);
  assert.deepEqual(await ok.port.fetchResult(1),{signed:true});
  for(const state of ['RUNNING','STOPPING','UNKNOWN']){
    const x=port(f,{envelope:{state,result:null}});await x.port.ready(1);
    await assert.rejects(x.port.fetchResult(1),e=>e instanceof FactoryResultPending&&e.message==='QDEV_FACTORY_RESULT_PENDING:'+state);
    assert.equal(x.calls.filter(c=>c[0]==='dispatch').length,0);
  }
  for(const bad of [null,{result:{signed:true}},{state:'COMPLETED',result:{signed:true},extra:1},{state:'RUNNING',result:{signed:true}},{state:7,result:null}]){
    const x=port(f,{envelope:bad});await x.port.ready(1);
    await assert.rejects(x.port.fetchResult(1),e=>e.code==='QDEV_FACTORY_RESULT_ENVELOPE');
  }
});
test('F4: preflight proves the prepared execution against the exact accepted start and refuses a different one before any claim',async()=>{
  const f=fixture(),{port:p,calls}=port(f);
  await p.preflight(1,start);assert.deepEqual(p.admit(1,start),f.raw);assert.deepEqual(calls.map(c=>c[0]),['prepared']);
  const other=port(f);
  await refused(other.port.preflight(1,{commit:'3'.repeat(40),tree:start.tree}),'QDEV_FACTORY_START_MISMATCH');
  await refused(other.port.preflight(1,{commit:start.commit,tree:'4'.repeat(40)}),'QDEV_FACTORY_START_MISMATCH');
  assert.deepEqual(other.calls.map(c=>c[0]),['prepared','prepared']);   // no dispatch ever
});
test('F5: a ProviderNotSent from a nested layer after dispatch began is ambiguous exposure, never a tombstone',async()=>{
  for(const [name,opts] of [['read',{readError:new ProviderNotSent('read preflight refusal')}],['dispatch',{dispatchError:new ProviderNotSent('client says not sent')}]]){
    const f=fixture(),{port:p}=port(f,opts);await p.ready(1);
    await assert.rejects(p.dispatch(prepareAuthenticatedLocalFactoryInputV4(p.admit(1,start))),e=>!(e instanceof ProviderNotSent)&&e.message==='QDEV_FACTORY_POST_DISPATCH_AMBIGUOUS'&&e.cause instanceof ProviderNotSent,name);
  }
  // the genuine pre-dispatch refusals stay proven no-sends
  const f=fixture(),{port:p}=port(f);
  await assert.rejects(p.dispatch({...p.admit.call({ready_:new Map([[1,{binding:f.b}]])},1,start)}),ProviderNotSent);
});

test('composition: admit returns the retained admission, so the wiring bindFactoryDispatch re-validation reproduces the exact prepared binding that dispatch compares',async()=>{
  const f=fixture(),{port:p}=port(f);
  await p.ready(1);
  const bound=bindFactoryDispatch({admitted:p.admit(1,start),project:{factoryVersionSha256:f.b.factoryVersion},stage:1,start,baseline:start});
  assert.deepEqual(bound,f.b);
  assert.equal((await p.dispatch(bound)).known,true);
  assert.throws(()=>prepareAuthenticatedLocalFactoryInputV4(f.b),'the validator is not idempotent over its own output, which is why admit must not return it');
});
test('Result read for an agent-executed stage rests on the retained admission only: identity is still proven, and admit/dispatch stay refused until prepared',async()=>{
  const f=fixture(),{port:p,calls}=port(f);
  assert.deepEqual(await p.fetchResult(1),{signed:true});                          // never prepared: no `prepared` readback, no dispatch
  assert.deepEqual(calls.map(c=>c[0]),['result']);
  assert.throws(()=>p.admit(1,start),e=>e.code==='QDEV_FACTORY_NOT_READY');
  await assert.rejects(p.dispatch(f.b),e=>e instanceof ProviderNotSent);
  const foreign=fixture(),{port:q}=port(f,{retained:{binding:f.raw,identity:foreign.identity,request:f.request}});
  await refused(q.fetchResult(1),'QDEV_FACTORY_IDENTITY_MISMATCH');
  const {port:off}=port(f,{enabled:false});
  await refused(off.fetchResult(1),'QDEV_FACTORY_DISABLED');
});
