import {describe,it,expect,vi} from 'vitest';
import {factoryTerminalActivity} from './factory-preparation-terminal.ts';
import {FactoryCapabilityClient} from './factory-capability-client.ts';
import {signFactoryPreparationTerminal} from '../../../../packages/capability-enforcement/src/factory-preparation-terminal.ts';
import {digest} from './factory-producer-protocol.ts';
const request={requestId:'fixture-request',workId:'fixture-work',workGeneration:1};
const binding={ownerId:'owner',organizationId:'org',installationId:'installation',agentId:'agent',clientId:'client',backendId:'backend',incarnation:'incarnation',enrollmentVersion:1,missionId:'mission',factoryId:'factory',factoryVersion:'a'.repeat(64),sourceDigest:'b'.repeat(64),configurationDigest:'c'.repeat(64)};
const receipt=(outcome:'ADMISSION_UNCERTAIN'|'DEFINITELY_NOT_ADMITTED'='ADMISSION_UNCERTAIN')=>{const issuedAt=Date.now();return ({schema:'factory-capability-preparation-terminal/v1' as const,...binding,requestId:request.requestId,workId:request.workId,generation:1,nativeRequestDigest:digest(request),planId:'plan',planDigest:'d'.repeat(64),receiverSequence:3,receiverHeadDigest:'e'.repeat(64),outcome,reasonCode:outcome==='ADMISSION_UNCERTAIN'?'RESTORE_OR_COMMIT_AMBIGUITY' as const:'NATIVE_REVALIDATION_FAILED' as const,nativeOutcomeDigest:'f'.repeat(64),issuedAt,expiresAt:issuedAt+30000});};
describe('Factory terminal consumer does not retry or release funds',()=>{
 it('signs the exact maximum lifetime with one fixture clock sample',async()=>{
  const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const key={keyId:'clock-fixture',jwk:await crypto.subtle.exportKey('jwk',pair.privateKey)},issuedAt=Date.now();let reads=0;
  const clock=vi.spyOn(Date,'now').mockImplementation(()=>issuedAt+reads++);
  try{
   const value=receipt();await signFactoryPreparationTerminal(value,key);
   expect(value.issuedAt).toBe(issuedAt);expect(value.expiresAt).toBe(issuedAt+30000);expect(reads).toBe(1);
  }finally{clock.mockRestore();}
 });
 it('projects durable uncertainty and definite decline truthfully with HOLD',()=>{
  for(const outcome of ['ADMISSION_UNCERTAIN','DEFINITELY_NOT_ADMITTED'] as const){const activity=factoryTerminalActivity({receipt:receipt(outcome),accounting:'HOLD'});expect(activity?.activity).toContain('held');expect(activity?.nextStep).not.toContain('Dispatch');}
  expect(factoryTerminalActivity(null)).toBeNull();expect(()=>factoryTerminalActivity({receipt:receipt(),accounting:'RELEASED'})).toThrow();
 });
 it('strict signed terminal readback stops before challenge/permits/prepare and rejects foreign binding',async()=>{
  const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const key={keyId:'original-key',jwk:await crypto.subtle.exportKey('jwk',keys.privateKey)};
  let calls=0,issuances=0;
  const config={origin:'https://fixture.invalid',binding,key,headers:async()=>({}),sourcePermit:async()=>{issuances++;throw Error('UNEXPECTED_ISSUANCE');},relayPermit:async()=>{issuances++;throw Error('UNEXPECTED_ISSUANCE');}};
  const signed=await signFactoryPreparationTerminal(receipt(),key);
  const client=new FactoryCapabilityClient(config,async()=>{calls++;return Response.json(signed);});
  await expect(client.prepare(request,{} as never)).rejects.toMatchObject({message:'FACTORY_PREPARATION_TERMINAL',receipt:{outcome:'ADMISSION_UNCERTAIN'}});
  expect(calls).toBe(1);expect(issuances).toBe(0);
  const foreign=new FactoryCapabilityClient({...config,binding:{...binding,ownerId:'foreign'}},async()=>Response.json(signed));
  await expect(foreign.prepare(request,{} as never)).rejects.toThrow();expect(issuances).toBe(0);
 });
 it('missing owner authorization cannot start a new admission after exact not-found readback',async()=>{
  let calls=0;
  const client=new FactoryCapabilityClient({origin:'https://fixture.invalid',binding,key:{} as never,headers:async()=>({}),sourcePermit:async()=>{throw Error('UNEXPECTED_ISSUANCE');},relayPermit:async()=>{throw Error('UNEXPECTED_ISSUANCE');}},async()=>{calls++;return new Response(null,{status:404});});
  await expect(client.prepare(request)).rejects.toThrow('FACTORY_SOURCE_BINDING');expect(calls).toBe(1);
 });
});
