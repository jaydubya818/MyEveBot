/** LiveFactoryPort over the existing LiveFactoryAdapter surface. Fakes only: no network, provider, credential or spend. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {LiveFactoryPort,FactoryLivePortRefused} from '../lib/qualification/factory-live-port.ts';
import {ProviderNotSent} from '../lib/qualification/gate.ts';
import {prepareAuthenticatedLocalFactoryInputV4} from '../lib/engineering/factory-authenticated-result.ts';
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
function port(f,{enabled=true,readback,retained}={}){
  const calls=[];
  const live={prepared:async r=>{calls.push(['prepared',r.requestId]);return readback??{requestId:f.b.requestId,workOrderId:f.b.workOrderId,runId:f.b.runId,state:'PREPARED',snapshot:f.snapshot};},
    dispatch:async i=>{calls.push(['dispatch',i.requestId]);},result:async b=>{calls.push(['result',b.requestId]);return {signed:true};}};
  return {calls,port:new LiveFactoryPort({enabled,live,retained:()=>retained??{binding:f.raw,identity:f.identity,request:f.request}})};
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
  assert.deepEqual(p.admit(1,start),f.b);
  assert.throws(()=>p.admit(1,{commit:'3'.repeat(40),tree:start.tree}),e=>e.code==='QDEV_FACTORY_START_MISMATCH');
  assert.deepEqual(await p.dispatch(p.admit(1,start)),{known:true,value:undefined});
  assert.deepEqual(await p.fetchResult(1),{signed:true});
  assert.deepEqual(calls.map(c=>c[0]),['prepared','dispatch','result']);
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
