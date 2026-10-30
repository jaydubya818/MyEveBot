import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {FactoryCapabilityClient} from '../lib/engineering/factory-capability-client.ts';
import {LiveFactoryAdapter} from '../lib/engineering/factory-live-adapter.ts';
import {digest} from '../lib/engineering/factory-producer-protocol.ts';
import {signFactoryPreparationTerminal} from '../../../packages/capability-enforcement/src/factory-preparation-terminal.ts';
import {buildOrderedFactoryClients} from '../lib/qualification/factory-ordered-clients.ts';
import {admissionActionDigest,signPolicyMessage,verifyPolicyMessage,policyMessageHash} from '../../../packages/capability-enforcement/src/ordering-wire.ts';
import {LiveFactoryPort} from '../lib/qualification/factory-live-port.ts';
import {FactoryStageAdmitter,FactoryStageAdmissionRefused} from '../lib/qualification/factory-stage-admission.ts';
import {syntheticFactory} from './qualification-synthetic.mjs';

// Actual client/adapter classes; every transport is a mock. No network, credential or upstream server is contacted.
const sourceDigest='a'.repeat(64),configurationDigest='b'.repeat(64),factoryVersion=digest({sourceDigest,configurationDigest});
const source={repository:'fixture/quantity',commit:'c'.repeat(40),tree:'d'.repeat(40)};
const cloud={transport:'CLOUD',protocol:'MYFACTORY_EXECUTION_V2',projectId:'prj_IRXTY6HOzS2q9wRPdabsJnmddzl4',origin:'https://myfactory-cloud-staging-azozoxm0r-jaydubya818.vercel.app',token:'a'.repeat(64),factoryId:'staging',sourceDigest,configurationDigest,factoryVersion,source,
  keys:[{factoryId:'staging',keyId:'test',publicKey:'test',activeFrom:'2020-01-01',notAfter:'2099-01-01'}],
  qualification:{scopeId:'synthetic-owner',profileHash:'e'.repeat(64),evidenceRef:'pending',qualifiedAt:'2026-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z',mode:'CLOUD_DETERMINISTIC',spendEnforced:true}};
const fx=syntheticFactory();
const local={origin:'http://127.0.0.1:12345',token:'c'.repeat(64),factoryId:fx.factoryId,sourceDigest:fx.sourceDigest,configurationDigest:fx.configurationDigest,factoryVersion:fx.factoryVersion,repositoryPath:'/synthetic',keys:[fx.key],
  qualification:{scopeId:'synthetic-owner',profileHash:'e'.repeat(64),evidenceRef:'pending',qualifiedAt:'2026-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z',mode:'LOCAL_FIXTURE',spendEnforced:false}};
const binding=(c)=>({ownerId:'synthetic-owner',organizationId:'org',installationId:'install',agentId:'agent',clientId:'client',backendId:'backend',incarnation:'epoch',enrollmentVersion:1,missionId:'mission',factoryId:c.factoryId,factoryVersion:c.factoryVersion,sourceDigest:c.sourceDigest,configurationDigest:c.configurationDigest});
const capabilityConfig=(c,key)=>({origin:c.origin,binding:binding(c),key,headers:async()=>({}),sourcePermit:async()=>{throw Error('UNEXPECTED_ISSUANCE');},relayPermit:async()=>{throw Error('UNEXPECTED_ISSUANCE');}});
const prepareRequest=()=>({requestId:randomUUID(),workId:randomUUID(),workGeneration:1,repository:source.repository,deadline:new Date(Date.now()+60000).toISOString(),maxSpendUsd:1,
  input:{title:'Quantity',description:'Implement positive integer validation.',kind:'feature',baseRef:source.commit,acceptanceCriteria:['Tests pass'],reproductionCommand:null,expectedFailureText:null,checkCommands:['node --test'],allowedPaths:['quantity.mjs'],workerProfile:'container'}});
const policyKey=async()=>{const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);return {keyId:'original-receiver',jwk:await crypto.subtle.exportKey('jwk',pair.privateKey)};};
const nativeOf=(r)=>{const {title,description,kind,acceptanceCriteria,checkCommands,allowedPaths}=r.input;return {protocol:'MYFACTORY_EXECUTION_V2',requestId:r.requestId,workId:r.workId,workGeneration:1,repository:r.repository,deadline:r.deadline,maxSpendUsd:r.maxSpendUsd,source,input:{title,description,kind,acceptanceCriteria,checkCommands,allowedPaths}};};

test('local V4 loopback composes the actual ordered pair; guards on origin, scheme and capability are intact',async()=>{
  const key=await policyKey();
  const {adapter,capability}=buildOrderedFactoryClients({connection:local,capability:capabilityConfig(local,key),factoryFetch:async()=>{throw Error('NETWORK_MUST_NOT_RUN')},capabilityFetch:async()=>{throw Error('NETWORK_MUST_NOT_RUN')}});
  assert.ok(capability instanceof FactoryCapabilityClient&&adapter instanceof LiveFactoryAdapter);
  // only exact IPv4 loopback http with a port; everything else is still refused
  for(const origin of ['http://localhost:12345','http://127.0.0.2:12345','http://127.0.0.1','http://10.0.0.5:12345','http://example.invalid:80','http://user@127.0.0.1:12345','ws://127.0.0.1:12345'])
    assert.throws(()=>new FactoryCapabilityClient({...capabilityConfig(local,key),origin}),/FACTORY_CAPABILITY_CONFIGURATION|Invalid URL/,origin);
  // the adapter still requires one origin for Factory and capability
  const other=new FactoryCapabilityClient(capabilityConfig({...local,origin:'http://127.0.0.1:12346'},key));
  assert.throws(()=>new LiveFactoryAdapter(local,async()=>{throw Error('NETWORK_MUST_NOT_RUN')},other,{requireOrderedAdmission:true}),/FACTORY_CAPABILITY_CONFIGURATION/);
  const https=new FactoryCapabilityClient(capabilityConfig({...local,origin:'https://synthetic.invalid'},key));
  assert.throws(()=>new LiveFactoryAdapter(local,async()=>{throw Error('NETWORK_MUST_NOT_RUN')},https,{requireOrderedAdmission:true}),/FACTORY_CAPABILITY_CONFIGURATION/);
  const bare=new LiveFactoryAdapter(local,async()=>{throw Error('NETWORK_MUST_NOT_RUN')},undefined,{requireOrderedAdmission:true});
  await assert.rejects(bare.prepared(localRequest()),/FACTORY_ORDERED_ADMISSION_REQUIRED/);                                  // cannot bypass ordering
});
// ---- mocked local ordered-admission receiver (the contract MyFactory's local supervisor must serve) ----
const fxe=fx.stage(1,fx.baseline).manifest.execution;
const localRequest=(over={})=>({requestId:randomUUID(),workId:randomUUID(),workGeneration:1,repository:'synthetic/repo',deadline:'2099-01-01T00:00:00.000Z',maxSpendUsd:1,
  input:{title:'Quantity',description:'Implement positive integer validation.',kind:'feature',repositoryPath:'/synthetic',baseRef:fxe.inputCommit,acceptanceCriteria:['Tests pass'],reproductionCommand:null,expectedFailureText:null,
   checkCommands:fx.configuration.commands,allowedPaths:fx.configuration.allowedPaths,workerProfile:'mac'},...over});
function receiver(key,request,{terminal}={}){
  const log=[];let prepared=false;
  const b=binding(local),readback=()=>({requestId:request.requestId,workOrderId:fxe.workOrderId,runId:fxe.runId,
    snapshot:{...fxe,requestId:request.requestId},identity:null,state:'PREPARED',quiescent:false,evidenceRef:null,spend:{status:'KNOWN',ceilingUsd:1},blocker:null});
  const fetcher=async(url,init)=>{
    const u=new URL(url);assert.equal(u.origin,local.origin);assert.equal(init.method,'POST');assert.equal(init.redirect,'error');
    const step=u.pathname.replace('/api/capability-admission/','');log.push(step);const body=JSON.parse(init.body);
    if(terminal)return Response.json(terminal);
    assert.equal(body.missionId,b.missionId);assert.deepEqual(body.request.requestId,request.requestId);
    if(step==='readback')return prepared?Response.json(readback()):new Response(null,{status:404});
    if(step==='challenge'){
      const now=Date.now(),action=await admissionActionDigest({workId:request.workId,missionId:b.missionId,generation:request.workGeneration,
        nativeSnapshot:{factoryId:b.factoryId,factoryVersion:b.factoryVersion,sourceDigest:b.sourceDigest,configurationDigest:b.configurationDigest,backendId:b.backendId,incarnation:b.incarnation,enrollmentVersion:b.enrollmentVersion},args:body.request});
      return Response.json(await signPolicyMessage({kind:'CHALLENGE',authority:'myeve',ownerId:b.ownerId,organizationId:b.organizationId,installationId:b.installationId,backendId:b.backendId,incarnation:b.incarnation,
        enrollmentVersion:b.enrollmentVersion,version:1,policyId:'policy',referenceId:randomUUID(),capabilityId:'myfactory',registryVersion:'r1',agentId:b.agentId,workId:request.workId,missionId:b.missionId,
        workGeneration:request.workGeneration,actionDigest:action,budgetMicros:Math.ceil(request.maxSpendUsd*1e6),issuedAt:now-1,expiresAt:now+20000},key));
    }
    if(step==='prepare'){
      const {myeve,relay}=body.capabilityPermits,m=await verifyPolicyMessage(myeve,key),r=await verifyPolicyMessage(relay,key);
      assert.equal(m.kind,'PERMIT');assert.equal(r.kind,'PERMIT');assert.equal(r.sourcePermitHash,await policyMessageHash(m));
      prepared=true;return Response.json(readback());
    }
    throw Error('unexpected '+step);
  };
  return {fetcher,log};
}
async function permits(key,sourceCalls){
  return {...capabilityConfig(local,key),
    sourcePermit:async(envelope,request,proof)=>{
      assert.deepEqual(proof,{proof:true});sourceCalls.push(request.requestId);
      const c=await verifyPolicyMessage(envelope,key),{kind,...rest}=c;
      return signPolicyMessage({...rest,kind:'PERMIT',requiredCapabilities:['myfactory','work'],agentRevision:1,sourcePermitHash:'SELF'},key);},
    relayPermit:async(source)=>{
      const m=await verifyPolicyMessage(source,key);
      return signPolicyMessage({...m,authority:'relay',sourcePermitHash:await policyMessageHash(m)},key);}};
}
test('local ordered admission end to end with mocked transports: readback → challenge → permits → prepare → PREPARED v4 → port preflight',async()=>{
  const key=await policyKey(),request=localRequest(),srv=receiver(key,request),sourceCalls=[];
  const {adapter}=buildOrderedFactoryClients({connection:local,capability:await permits(key,sourceCalls),factoryFetch:async()=>{throw Error('FACTORY_FETCH_MUST_NOT_RUN');},capabilityFetch:srv.fetcher});
  const start={commit:fxe.inputCommit,tree:fxe.inputTree},w={id:request.workId,version:1,generation:1,criteriaVersion:1,agentId:'agent'};
  const admitter=new FactoryStageAdmitter({enabled:true,work:()=>w,request:()=>request,start:()=>start,missionControl:async()=>({proof:true}),
    prepare:(r,p)=>adapter.prepare(r,p),
    identity:(st,wk,rb,rq)=>({runId:randomUUID(),writerGeneration:1,dispatchIdentity:'d',workId:wk.id,workGeneration:1,factoryId:fx.factoryId,factoryVersion:fx.factoryVersion,requestId:rb.requestId,
      workOrderId:rb.workOrderId,remoteRunId:rb.runId,repository:rq.repository,baseSha:start.commit,allowedPaths:rq.input.allowedPaths,deadline:rq.deadline})});
  const retained=await admitter.retained(1);
  assert.deepEqual(srv.log,['readback','challenge','prepare']);                                   // ordering: nothing prepared before the signed challenge and both permits
  assert.deepEqual(sourceCalls,[request.requestId]);
  const port=new LiveFactoryPort({enabled:true,retained:()=>retained,live:{prepared:r=>adapter.prepared(r),dispatch:async()=>{throw Error('NO_DISPATCH');},read:async()=>{throw Error('NO_READ');},result:async()=>{throw Error('NO_RESULT');}}});
  await port.preflight(1,start);                                                                   // re-proves via capability readback (now PREPARED)
  assert.deepEqual(srv.log,['readback','challenge','prepare','readback']);
  await assert.rejects(port.preflight(1,{commit:'3'.repeat(40),tree:start.tree}),/QDEV_FACTORY_START_MISMATCH/);
  assert.equal(srv.log.filter(s=>s==='prepare').length,1);                                         // one preparation only
});
test('local ordered admission: a tampered or foreign-key challenge is refused before any permit is issued',async()=>{
  const key=await policyKey(),foreign=await policyKey(),request=localRequest(),srv=receiver(foreign,request),sourceCalls=[];
  const {adapter}=buildOrderedFactoryClients({connection:local,capability:await permits(key,sourceCalls),factoryFetch:async()=>{throw Error('NO');},capabilityFetch:srv.fetcher});
  await assert.rejects(adapter.prepare(request,{proof:true}));
  assert.deepEqual(sourceCalls,[]);assert.deepEqual(srv.log,['readback','challenge']);
});
test('local ordered admission: a signed terminal preparation envelope is a stage-admission refusal, never a retry',async()=>{
  const key=await policyKey(),request=localRequest(),now=Date.now();
  const nativeDigest=digest(request);
  const envelope=await signFactoryPreparationTerminal({schema:'factory-capability-preparation-terminal/v1',...binding(local),requestId:request.requestId,workId:request.workId,generation:1,nativeRequestDigest:nativeDigest,
    planId:'plan',planDigest:'d'.repeat(64),receiverSequence:3,receiverHeadDigest:'e'.repeat(64),outcome:'ADMISSION_UNCERTAIN',reasonCode:'RESTORE_OR_COMMIT_AMBIGUITY',nativeOutcomeDigest:'f'.repeat(64),issuedAt:now,expiresAt:now+30000},key);
  const srv=receiver(key,request,{terminal:envelope}),{adapter}=buildOrderedFactoryClients({connection:local,capability:await permits(key,[]),factoryFetch:async()=>{throw Error('NO');},capabilityFetch:srv.fetcher});
  let prepares=0;
  const admitter=new FactoryStageAdmitter({enabled:true,work:()=>({id:request.workId,version:1,generation:1,criteriaVersion:1,agentId:'agent'}),request:()=>request,
    start:()=>({commit:fxe.inputCommit,tree:fxe.inputTree}),missionControl:async()=>({proof:true}),prepare:async(r,p)=>{prepares++;return adapter.prepare(r,p);},identity:()=>{throw Error('UNREACHABLE');}});
  await assert.rejects(admitter.retained(1),e=>e instanceof FactoryStageAdmissionRefused&&e.code==='QDEV_STAGE_ADMISSION_TERMINAL');
  assert.equal(prepares,1);assert.deepEqual(srv.log,['readback']);
});
test('cloud Factory composes with the actual ordered client pair over one origin',async()=>{
  const key=await policyKey(),seen=[];
  const {adapter}=buildOrderedFactoryClients({connection:cloud,capability:capabilityConfig(cloud,key),
    factoryFetch:async()=>{throw Error('FACTORY_FETCH_MUST_NOT_RUN');},capabilityFetch:async(url)=>{seen.push(String(url));return new Response(null,{status:404});}});
  await assert.rejects(adapter.prepared(prepareRequest()),/FACTORY_PREPARATION_UNAVAILABLE/);
  assert.deepEqual(seen,[cloud.origin+'/api/capability-admission/readback']);                                                      // readback goes through the capability client only
  // a different capability origin is still refused
  assert.throws(()=>buildOrderedFactoryClients({connection:cloud,capability:capabilityConfig({...cloud,origin:'https://myfactory-cloud-staging-other-jaydubya818.vercel.app'},key)}),/FACTORY_CAPABILITY_CONFIGURATION/);
});
test('a signed preparation terminal from the actual client is a stage-admission refusal, never a retry',async()=>{
  const key=await policyKey(),request=prepareRequest(),now=Date.now();
  const receipt={schema:'factory-capability-preparation-terminal/v1',...binding(cloud),requestId:request.requestId,workId:request.workId,generation:1,nativeRequestDigest:digest(nativeOf(request)),planId:'plan',planDigest:'d'.repeat(64),receiverSequence:3,receiverHeadDigest:'e'.repeat(64),outcome:'ADMISSION_UNCERTAIN',reasonCode:'RESTORE_OR_COMMIT_AMBIGUITY',nativeOutcomeDigest:'f'.repeat(64),issuedAt:now,expiresAt:now+30000};
  const envelope=await signFactoryPreparationTerminal(receipt,key);
  const {adapter}=buildOrderedFactoryClients({connection:cloud,capability:capabilityConfig(cloud,key),factoryFetch:async()=>{throw Error('NO');},capabilityFetch:async()=>Response.json(envelope)});
  let prepares=0;
  const admitter=new FactoryStageAdmitter({enabled:true,
    work:()=>({id:request.workId,version:1,generation:1,criteriaVersion:1,agentId:'agent'}),request:()=>request,start:()=>({commit:source.commit,tree:source.tree}),
    missionControl:async()=>({proof:true}),prepare:async(r,p)=>{prepares++;return adapter.prepare(r,p);},identity:()=>{throw Error('UNREACHABLE');}});
  await assert.rejects(admitter.retained(1),e=>e instanceof FactoryStageAdmissionRefused&&e.code==='QDEV_STAGE_ADMISSION_TERMINAL');
  assert.equal(prepares,1);
});
