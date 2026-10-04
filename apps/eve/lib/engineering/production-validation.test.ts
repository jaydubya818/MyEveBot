import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({principal:{id:'owner'} as {id:string}|null,config:vi.fn(),store:vi.fn(),enqueue:vi.fn(),wake:vi.fn()}));
vi.mock('../web-auth.ts',async()=>({...await vi.importActual('../web-auth.ts'),webPrincipal:()=>mocks.principal}));
vi.mock('./factory-routing.ts',()=>({factoryConfig:mocks.config}));
vi.mock('./store.ts',()=>({WorkStore:class {constructor(){mocks.store();}}}));
vi.mock('./factory-commands.ts',()=>({enqueueFactoryCommand:mocks.enqueue}));
vi.mock('./cloud-controller-queue.ts',()=>({wakeCloudController:mocks.wake}));
import {handleProductionValidation,assertProductionValidationProof} from './production-validation.ts';
import type {ResultManifest} from './factory-producer-protocol.ts';
import type {FactoryConnection} from './factory-live-adapter.ts';
import type {Work} from './types.ts';
import {productionValidationConfiguration,productionCloudConfiguration} from './production-runtime-guard.ts';
import {handleProductionCanary} from './production-canary.ts';
import {cloudRuntimeEnabled} from './cloud-runtime-guard.ts';
import {engineeringWorkEnabled} from './deployment-mode.ts';
const installed={version:1,ownerScope:'owner',projectId:'prj_4hfceCN8l6wN1gUyYOzZLQ7aJapK',sourceDigest:'a'.repeat(64),origin:'https://myfactory-cloud-production.vercel.app'};
const env={NODE_ENV:'production' as const,VERCEL:'1',VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_L6faw25wnFGUZtrLKBIccg8gIDLR',MYEVE_OWNER_ID:'owner',MYEVE_CLOUD_PRODUCTION_INSTALLATION:JSON.stringify(installed),MYEVE_FACTORY_PRODUCTION_APPLICATION_TOKEN:'b'.repeat(64),MYEVE_PRODUCTION_VALIDATION_CONFIG:JSON.stringify({mode:'OPERATOR_DETERMINISTIC_VALIDATION',work:{id:'11111111-1111-4111-8111-111111111111',generation:1},engineering:{},factory:{},source:{sha:'c'.repeat(40),files:{}}})};
beforeEach(()=>{vi.clearAllMocks();mocks.principal={id:'owner'};for(const [k,v] of Object.entries(env))vi.stubEnv(k,v);});
afterEach(()=>vi.unstubAllEnvs());
describe('production release probe does not grant general Work or model authority',()=>{
 it('keeps both the synthetic conversation and ordinary Work disabled',()=>{
  expect(productionValidationConfiguration(env).mode).toBe('OPERATOR_DETERMINISTIC_VALIDATION');
  expect(cloudRuntimeEnabled(env)).toBe(false);expect(engineeringWorkEnabled(env)).toBe(false);
 });
 it.each([{VERCEL_ENV:'preview'},{VERCEL_PROJECT_ID:'other'},{MYEVE_OWNER_ID:'other'},{MYEVE_CLOUD_QUALIFICATION_CONFIG:'{}'},{MYEVE_FACTORY_REAL_EXECUTION_APPROVED:'true'},{MYEVE_FACTORY_LOCAL_WORKER:'true'}])('rejects conflicting scope or authority before model access: %j',patch=>expect(()=>productionValidationConfiguration({...env,...patch})).toThrow());
 it('returns same-origin denial before config, database, queue or controller effects',async()=>{
  const response=await handleProductionValidation(new Request('https://sofie-personal-agent.vercel.app/api/production-validation',{method:'POST',headers:{origin:'https://attacker.invalid'},body:'{}'}));
  expect(response.status).toBe(403);
  for(const spy of [mocks.config,mocks.store,mocks.enqueue,mocks.wake])expect(spy).not.toHaveBeenCalled();
 });
 it.each([null,{id:'partner'}])('denies missing or foreign owner before all effects',async principal=>{
  mocks.principal=principal;
  const response=await handleProductionValidation(new Request('https://sofie-personal-agent.vercel.app/api/production-validation'));
  expect(response.status).toBe(principal?403:401);
  for(const spy of [mocks.config,mocks.store,mocks.enqueue,mocks.wake])expect(spy).not.toHaveBeenCalled();
 });
});
describe('paid canary stays dormant without the separate exact owner authorization',()=>{
 const canary=(hash='d'.repeat(64))=>({...env,MYEVE_PRODUCTION_VALIDATION_CONFIG:undefined,MYEVE_PRODUCTION_CANARY_AUTHORIZATION_SHA256:hash,MYEVE_PRODUCTION_CANARY_CONFIG:JSON.stringify({...JSON.parse(env.MYEVE_PRODUCTION_VALIDATION_CONFIG),mode:'CLOUD_PRODUCTION_CANARY',authorizationSha256:'d'.repeat(64)})});
 it('binds both config and approval hash and keeps ordinary Work disabled',()=>{
  expect(productionCloudConfiguration(canary()).mode).toBe('CLOUD_PRODUCTION_CANARY');
  expect(engineeringWorkEnabled(canary())).toBe(false);
  for(const hash of ['', 'invalid','e'.repeat(64)])expect(()=>productionCloudConfiguration(canary(hash))).toThrow();
  expect(()=>productionCloudConfiguration({...canary(),MYEVE_PRODUCTION_VALIDATION_CONFIG:env.MYEVE_PRODUCTION_VALIDATION_CONFIG})).toThrow('PRODUCTION_AUTHORITY_CONFLICT');
 });
 it('returns absent when only validation is authorized',async()=>{
  const response=await handleProductionCanary(new Request('https://sofie-personal-agent.vercel.app/api/production-canary',{method:'POST',headers:{origin:'https://sofie-personal-agent.vercel.app'}}));
  expect(response.status).toBe(404);for(const spy of [mocks.config,mocks.store,mocks.enqueue,mocks.wake])expect(spy).not.toHaveBeenCalled();
 });
 it.each([null,{id:'partner'}])('denies foreign or missing owner before effects',async principal=>{
  mocks.principal=principal;expect((await handleProductionCanary(new Request('https://sofie-personal-agent.vercel.app/api/production-canary',{method:'POST'}))).status).toBe(principal?403:401);
  for(const spy of [mocks.config,mocks.store,mocks.enqueue,mocks.wake])expect(spy).not.toHaveBeenCalled();
 });
 it('denies cross-origin action before config or queue access',async()=>{
  expect((await handleProductionCanary(new Request('https://sofie-personal-agent.vercel.app/api/production-canary',{method:'POST',headers:{origin:'https://attacker.invalid'}}))).status).toBe(403);
  for(const spy of [mocks.config,mocks.store,mocks.enqueue,mocks.wake])expect(spy).not.toHaveBeenCalled();
 });
});

describe('production readback accepts only the exact current production provenance',()=>{
 const work={id:'current-work',version:2,generation:3} as Work;
 const connection={qualification:{mode:'CLOUD_PRODUCTION_VALIDATION'},factoryVersion:'version',sourceDigest:'source',configurationDigest:'configuration',source:{commit:'base',tree:'tree'}} as unknown as FactoryConnection;
 const manifest={status:'COMPLETED',candidate:{commit:'candidate'},execution:{factoryId:'myfactory-cloud-production',factoryVersion:'version',sourceDigest:'source',configurationDigest:'configuration',inputCommit:'base',inputTree:'tree',configuration:{model:'none',executor:'operator-authored-candidate-validation',cloud:{evidenceClass:'DETERMINISTIC'}}},verification:{workId:'current-work',workGeneration:3,outcome:'PASS',cleanupConfirmed:true}} as unknown as ResultManifest;
 it('accepts the exact validation provenance',()=>expect(()=>assertProductionValidationProof(manifest,work,connection,'candidate')).not.toThrow());
 it.each(['factoryId','factoryVersion','sourceDigest','configurationDigest','inputCommit','inputTree'] as const)('rejects foreign execution %s',key=>{
  const changed=structuredClone(manifest);(changed.execution as unknown as Record<string,unknown>)[key]='other';
  expect(()=>assertProductionValidationProof(changed,work,connection,'candidate')).toThrow('VALIDATION_PROVENANCE_MISMATCH');
 });
 it('rejects historical generation, different Work, candidate, model attribution and failed verification',()=>{
  for(const change of [m=>m.verification!.workGeneration=2,m=>m.verification!.workId='other',m=>m.candidate!.commit='other',m=>m.execution.configuration.model='openai/gpt-5.4-mini',m=>m.execution.configuration.executor='myfactory-codex',m=>m.verification!.outcome='FAIL'] as ((m:ResultManifest)=>void)[]){
   const changed=structuredClone(manifest);change(changed);expect(()=>assertProductionValidationProof(changed,work,connection,'candidate')).toThrow();
  }
 });
});
