import {describe,it,expect,vi} from 'vitest';
import {FactoryWorkDriver,factoryExecutionConfigurationHash} from './factory-work-driver.ts';
import {EvidenceWaiting} from './factory-evidence.ts';
import {FactoryValidationGrantPending,LiveFactoryAdapter,type FactoryConnection,type FactoryPrepareRequest} from './factory-live-adapter.ts';
import {digest} from './contract.ts';
import type {WorkStore} from './store.ts';
vi.mock('./factory-request-headers.ts',()=>({factoryRequestHeaders:async()=>({authorization:'Bearer local-test-only'})}));

function fixture(){
 const config={connection:{releaseValidation:true},engineering:{}};
 const preparation={validationState:'IDLE',configurationHash:factoryExecutionConfigurationHash(config as never),request:{requestId:'fixed-request',workGeneration:1,deadline:new Date(Date.now()+180000).toISOString()},validationFailure:''};
 const decision={id:'decision',work_version:1,status:'PROPOSED',factory_preparation:preparation};
 const query=vi.fn(async(sql:string,args:unknown[])=>{
  if(sql.includes('factory_preparation||'))Object.assign(preparation,JSON.parse(String(args[4])));
  else if(sql.includes("IN ('IDLE','WAITING_GRANT')")){
   if(!['IDLE','WAITING_GRANT'].includes(preparation.validationState))return [];
   preparation.validationState='IN_FLIGHT';return [{id:'decision'}];
  }else if(sql.includes('jsonb_set')&&preparation.validationState==='IN_FLIGHT')preparation.validationState=JSON.parse(String(args[4]));
  return [];
 });
 const store={principal:{scopeId:'owner',scopeKind:'personal'},database:{query},get:async()=>({version:1,generation:1})} as unknown as WorkStore;
 const driver=new FactoryWorkDriver(store,{readConfig:async()=>config} as never,{} as never,{} as never,async()=>({} as never));
 vi.spyOn(driver,'decision').mockImplementation(async()=>structuredClone(decision));
 const stop=vi.spyOn(driver,'stop').mockResolvedValue({} as never);
 const attempt=vi.spyOn(driver as unknown as {stepAttempt:(id:string)=>Promise<unknown>},'stepAttempt');
 return {driver,preparation,attempt,stop,decision};
}
describe('durable production validation failure boundary',()=>{
 it('waits only for explicit missing authority, retaining request and deadline',async()=>{
  const f=fixture(),request=structuredClone(f.preparation.request);
  f.attempt.mockRejectedValueOnce(new FactoryValidationGrantPending('pending')).mockResolvedValueOnce({state:'DISPATCHED'});
  expect(await f.driver.step('work')).toEqual({state:'WAITING_FOR_AUTHORITY'});
  expect(f.preparation.validationState).toBe('WAITING_GRANT');
  expect(await f.driver.step('work')).toEqual({state:'DISPATCHED'});
  expect(f.preparation.request).toEqual(request);expect(f.stop).not.toHaveBeenCalled();
 });
 it.each(['timeout','invalid JSON','candidate digest mismatch','Factory control unavailable (403)','VALIDATION_EXECUTION_UNKNOWN'])('never re-enters productive steps after %s',async reason=>{
  const f=fixture();f.attempt.mockRejectedValueOnce(Error(reason));
  await expect(f.driver.step('work')).rejects.toThrow(reason);
  expect(f.preparation.validationState).toBe('HALTED');
  expect(await f.driver.step('work')).toEqual({state:'HALTED'});
  expect(await f.driver.step('work')).toEqual({state:'HALTED'});
  expect(f.attempt).toHaveBeenCalledTimes(1);expect(f.stop).toHaveBeenCalled();
 });
 it.each(['IN_FLIGHT','expired'])('halts interrupted or expired authority before another external call: %s',async state=>{
  const f=fixture();if(state==='expired')f.preparation.request.deadline=new Date(Date.now()-1).toISOString();else f.preparation.validationState=state;
  expect(await f.driver.step('work')).toEqual({state:'HALTED'});expect(f.attempt).not.toHaveBeenCalled();
 });
 it('does not treat missing-grant denial after admission as permission to wait',async()=>{
  const f=fixture();f.decision.status='ADMITTED';f.attempt.mockRejectedValue(new FactoryValidationGrantPending('pending'));
  await expect(f.driver.step('work')).rejects.toThrow();expect(f.preparation.validationState).toBe('HALTED');
 });
 it('the real driver catch cannot convert EvidenceWaiting into a retryable validation',async()=>{
  const f=fixture(),prepare=vi.fn(async()=>{throw new EvidenceWaiting();});
  vi.spyOn(f.driver,'adapterFor').mockReturnValue({prepare} as never);
  await expect(f.driver.step('work')).rejects.toBeInstanceOf(EvidenceWaiting);
  expect(f.preparation.validationState).toBe('HALTED');await f.driver.step('work');expect(prepare).toHaveBeenCalledTimes(1);
 });
 it.each(['AWAITING_RESULT','HISTORICAL','NOT_PREPARED','WAITING_FOR_EVIDENCE','STOPPING'])('halts an unproven validation return without another productive call: %s',async state=>{
  const f=fixture();f.attempt.mockResolvedValue({state});
  expect(await f.driver.step('work')).toEqual({state:'HALTED'});expect(await f.driver.step('work')).toEqual({state:'HALTED'});
  expect(f.attempt).toHaveBeenCalledTimes(1);
 });
 it('retains the execution halt even when cleanup is unavailable',async()=>{
  const f=fixture();f.stop.mockRejectedValue(Error('cleanup unavailable'));f.attempt.mockRejectedValue(Error('transport lost'));
  await expect(f.driver.step('work')).rejects.toThrow();await f.driver.step('work');expect(f.attempt).toHaveBeenCalledTimes(1);expect(f.preparation.validationState).toBe('HALTED');
 });
 it('does not replay a completed Proof or cancel it on later expired ticks',async()=>{
  const f=fixture();f.attempt.mockResolvedValue({state:'PARTIAL',result:{id:'proof'}});
  await f.driver.step('work');f.preparation.request.deadline=new Date(0).toISOString();
  expect(await f.driver.step('work')).toEqual({state:'COMPLETED'});expect(f.attempt).toHaveBeenCalledTimes(1);expect(f.stop).not.toHaveBeenCalled();
 });
});

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
