/** LiveFactoryPort composed with the REAL LiveFactoryAdapter (mocked fetch) and the REAL Result consumer. Synthetic only: no network, provider or spend. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {syntheticFactory,h} from './qualification-synthetic.mjs';
import {prepareAuthenticatedLocalFactoryInputV4} from '../lib/engineering/factory-authenticated-result.ts';
import {LiveFactoryAdapter} from '../lib/engineering/factory-live-adapter.ts';
import {LiveFactoryPort,FactoryResultPending} from '../lib/qualification/factory-live-port.ts';
import {consumeStageResult} from '../lib/qualification/result.ts';
import {QDEV_BASELINE} from '../lib/external-alpha/qualification-accounting.ts';

const fx=syntheticFactory(),s=fx.stage(1,fx.baseline),e=s.manifest.execution;
const raw={workId:randomUUID(),workVersion:1,workGeneration:1,criteriaVersion:1,agentId:'synthetic-agent',factoryId:fx.factoryId,factoryVersion:fx.factoryVersion,
  requestId:e.requestId,requestDigest:e.requestDigest,sourceDigest:fx.sourceDigest,configurationDigest:fx.configurationDigest,workOrderId:e.workOrderId,runId:e.runId,attemptNumber:1,
  inputCommit:e.inputCommit,inputTree:e.inputTree,localSnapshotVersion:4,configuration:fx.configuration};
const request={requestId:e.requestId,workId:raw.workId,workGeneration:1,repository:'synthetic/repo',deadline:'2099-01-01T00:00:00.000Z',maxSpendUsd:1,
  input:{baseRef:e.inputCommit,allowedPaths:fx.configuration.allowedPaths}};
const identity={runId:randomUUID(),writerGeneration:1,dispatchIdentity:'d',workId:raw.workId,workGeneration:1,factoryId:fx.factoryId,factoryVersion:fx.factoryVersion,requestId:e.requestId,
  workOrderId:e.workOrderId,remoteRunId:e.runId,repository:request.repository,baseSha:e.inputCommit,allowedPaths:request.input.allowedPaths,deadline:request.deadline};
const config={origin:'http://127.0.0.1:12345',token:'c'.repeat(64),factoryId:fx.factoryId,sourceDigest:fx.sourceDigest,configurationDigest:fx.configurationDigest,factoryVersion:fx.factoryVersion,
  repositoryPath:'/synthetic',keys:[fx.key],qualification:{scopeId:'synthetic-owner',profileHash:h('d'),evidenceRef:'synthetic',qualifiedAt:'2026-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z',mode:'LOCAL_FIXTURE',spendEnforced:true}};
const project={...QDEV_BASELINE,operatingProfileSha256:h('2'),factoryVersionSha256:fx.factoryVersion,protectedSpecificationSha256:h('3'),sources:{myeve:'1'.repeat(40),factory:'2'.repeat(40),relay:'3'.repeat(40),missioncontrol:'4'.repeat(40)}};
const consume=signed=>consumeStageResult({signed,keys:[fx.key],project,stage:1,precedingCandidate:null,expected:fx.expectedByStage[1],sourceDigest:fx.sourceDigest,baseline:fx.baseline,now:Date.parse('2026-10-30T17:00:00Z')});

const readback=(over={})=>({requestId:e.requestId,workOrderId:e.workOrderId,runId:e.runId,snapshot:null,identity,state:'RUNNING',quiescent:false,evidenceRef:null,spend:{status:'KNOWN',ceilingUsd:1},blocker:null,...over});
function composed(fetcher,extra={},ids={}){
  const {raw:bRaw=raw,request:rq=request,identity:idn=identity,e:ee=e}=ids;
  const adapter=new LiveFactoryAdapter(config,fetcher);
  const port=new LiveFactoryPort({enabled:true,retained:()=>({binding:bRaw,request:rq,identity:idn}),settleTimeoutMs:50,pollMs:10,sleep:async()=>{},
    live:{prepared:async()=>({requestId:ee.requestId,workOrderId:ee.workOrderId,runId:ee.runId,state:'PREPARED',snapshot:ee}),dispatch:i=>adapter.dispatch(i),read:i=>adapter.read(i),result:b=>adapter.result(b)},...extra});
  return port;
}
test('F1: a completed authenticated Result from the existing result channel is accepted by the real consumer through the port',async()=>{
  assert.equal(consume(s.signed).candidateCommit,s.candidate.commit,'control: raw signature valid');
  const port=composed(async()=>Response.json({state:'COMPLETED',result:s.signed}));
  await port.ready(1);
  assert.equal(consume(await port.fetchResult(1)).candidateCommit,s.candidate.commit);
});
test('F1: pending/UNKNOWN channel states are preserved, and a tampered Result is still rejected by the consumer',async()=>{
  for(const state of ['RUNNING','STOPPING','UNKNOWN']){
    const port=composed(async()=>Response.json({state,result:null}));await port.ready(1);
    await assert.rejects(port.fetchResult(1),e2=>e2 instanceof FactoryResultPending&&e2.state===state);
  }
  const tampered={...s.signed,encoded:s.signed.encoded.slice(0,-2)+'AA'};
  const port=composed(async()=>Response.json({state:'COMPLETED',result:tampered}));await port.ready(1);
  await assert.rejects(async()=>consume(await port.fetchResult(1)));
});
test('F2: through the real adapter a RUNNING readback never yields known:true; an unprovable legacy spend fences; nothing is resent',async()=>{
  const u=randomUUID(),ex={...e,requestId:u},
    uraw={...raw,requestId:u},ureq={...request,requestId:u},uid={...identity,requestId:u};
  const rb=(over={})=>({...readback(over),requestId:u,identity:uid});
  for(const [name,body] of Object.entries({running:rb(),terminalButLegacySpend:rb({state:'COMPLETED',quiescent:true,evidenceRef:'evidence-1'}),unknown:rb({state:'UNKNOWN'})})){
    const calls=[];
    const port=composed(async(url,init)=>{calls.push((init?.method??'GET')+' '+new URL(url).pathname.split('/').pop());return Response.json(body);},
      {now:(t=>()=>t+=20)(0)},{raw:uraw,request:ureq,identity:uid,e:ex});
    await port.ready(1);
    assert.deepEqual(await port.dispatch(prepareAuthenticatedLocalFactoryInputV4(port.admit(1,fx.baseline)), 1_300_000),{known:false},name);
    assert.equal(calls.filter(c=>c==='POST dispatch').length,1,name+': dispatched exactly once');
  }
});
