import {describe,it,expect,vi} from 'vitest';
import {FactoryWorkDriver,factoryExecutionConfigurationHash} from './factory-work-driver.ts';
import {EvidenceWaiting} from './factory-evidence.ts';
import {FactoryValidationGrantPending,LiveFactoryAdapter,type FactoryConnection,type FactoryPrepareRequest} from './factory-live-adapter.ts';
import {digest} from './contract.ts';
import type {WorkStore} from './store.ts';
vi.mock('./factory-request-headers.ts',()=>({factoryRequestHeaders:async()=>({authorization:'Bearer local-test-only'})}));

describe('only the exact authenticated missing-grant response permits waiting',()=>{
 const sourceDigest='a'.repeat(64),configurationDigest='b'.repeat(64),source={repository:'fixture/normalizer',commit:'c'.repeat(40),tree:'d'.repeat(40)};
 const config:FactoryConnection={transport:'CLOUD',protocol:'MYFACTORY_EXECUTION_V2',projectId:'prj_4hfceCN8l6wN1gUyYOzZLQ7aJapK',releaseValidation:true,origin:'https://myfactory-cloud-production.vercel.app',token:'a'.repeat(64),factoryId:'myfactory-cloud-production',sourceDigest,configurationDigest,factoryVersion:digest({sourceDigest,configurationDigest}),source,keys:[{factoryId:'myfactory-cloud-production',keyId:'test',publicKey:'test',activeFrom:'2020-01-01',notAfter:'2099-01-01'}],qualification:{scopeId:'test-owner',profileHash:'e'.repeat(64),evidenceRef:'local test only',qualifiedAt:'2026-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z',mode:'CLOUD_PRODUCTION_VALIDATION',spendEnforced:true}};
 const request:FactoryPrepareRequest={requestId:'11111111-1111-4111-8111-111111111111',workId:'22222222-2222-4222-8222-222222222222',workGeneration:1,repository:source.repository,deadline:new Date(Date.now()+180000).toISOString(),maxSpendUsd:1,input:{title:'Validation',description:'Local test',kind:'feature',baseRef:source.commit,acceptanceCriteria:['Exact bytes'],reproductionCommand:null,expectedFailureText:null,checkCommands:['node --test'],allowedPaths:['normalize.mjs'],workerProfile:'container'}};
 it('classifies only preparation POST and exact 403 payload as waiting',async()=>{
  const pending={error:'PRODUCTION_VALIDATION_GRANT_PENDING',admission:'DISABLED'};
  await expect(new LiveFactoryAdapter(config,async()=>Response.json(pending,{status:403})).prepare(request)).rejects.toBeInstanceOf(FactoryValidationGrantPending);
  for(const [body,status] of [[pending,503],[{...pending,extra:true},403],[{error:'PRODUCTION_WORK_NOT_AUTHORIZED',admission:'DISABLED'},403],[null,403]] as const){
   const e=await new LiveFactoryAdapter(config,async()=>Response.json(body,{status})).prepare(request).catch(e=>e);
   expect(e).toBeInstanceOf(Error);expect(e).not.toBeInstanceOf(FactoryValidationGrantPending);
  }
  const e=await new LiveFactoryAdapter(config,async()=>Response.json(pending,{status:403})).prepared(request).catch(e=>e);
  expect(e).not.toBeInstanceOf(FactoryValidationGrantPending);
 });
});
