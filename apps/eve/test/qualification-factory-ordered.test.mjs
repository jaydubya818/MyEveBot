import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {FactoryCapabilityClient} from '../lib/engineering/factory-capability-client.ts';
import {LiveFactoryAdapter} from '../lib/engineering/factory-live-adapter.ts';
import {digest} from '../lib/engineering/factory-producer-protocol.ts';
import {signFactoryPreparationTerminal} from '../../../packages/capability-enforcement/src/factory-preparation-terminal.ts';
import {buildOrderedFactoryClients,OrderedFactoryClientsRefused} from '../lib/qualification/factory-ordered-clients.ts';
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

test('local V4 loopback Factory cannot be ordered at the frozen upstream: typed refusal, no weakening',async()=>{
  const key=await policyKey();
  assert.throws(()=>buildOrderedFactoryClients({connection:local,capability:capabilityConfig(local,key)}),e=>e instanceof OrderedFactoryClientsRefused&&e.code==='QDEV_FACTORY_ORDERED_LOCAL_UNSUPPORTED');
  // The underlying actual-class constraints are intact (the dependency is real, not an artifact of this builder).
  assert.throws(()=>new FactoryCapabilityClient(capabilityConfig(local,key)),/FACTORY_CAPABILITY_CONFIGURATION/);               // capability requires HTTPS
  const https=new FactoryCapabilityClient(capabilityConfig({...local,origin:'https://synthetic.invalid'},key));
  assert.throws(()=>new LiveFactoryAdapter(local,async()=>{throw Error('NETWORK_MUST_NOT_RUN')},https,{requireOrderedAdmission:true}),/FACTORY_CAPABILITY_CONFIGURATION/);   // origins must be equal
  const bare=new LiveFactoryAdapter(local,async()=>{throw Error('NETWORK_MUST_NOT_RUN')},undefined,{requireOrderedAdmission:true});
  await assert.rejects(bare.prepared(prepareRequest()),/FACTORY_ORDERED_ADMISSION_REQUIRED/);                                  // cannot bypass ordering
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
