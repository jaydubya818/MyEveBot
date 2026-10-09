import {describe,it,expect,vi} from 'vitest';
import {consumeControllerDelivery,cloudControllerTopic} from './cloud-controller-delivery.ts';
import {cloudRuntimeEnabled,cloudRuntimeConfiguration,cloudQualificationProjectId} from './cloud-runtime-guard.ts';
const env={VERCEL:'1',VERCEL_PROJECT_ID:cloudQualificationProjectId,VERCEL_ENV:'preview',MYEVE_CLOUD_DETERMINISTIC_ENABLED:'true',MYEVE_CLOUD_QUALIFICATION_CONFIG:JSON.stringify({engineering:{},factory:{},source:{}})};
const now=1800000000000,message={schemaVersion:1 as const,commandId:'00000000-0000-4000-8000-000000000001',deploymentId:'dpl_abc',expiresAt:now+600000,tick:0};
const metadata={topicName:cloudControllerTopic,region:'iad1'};
describe('bounded hosted controller installation',()=>{
 it('requires the exact approved hosted preview and explicit deterministic enablement',()=>{
  expect(cloudRuntimeEnabled(env)).toBe(true);
  for(const change of [{VERCEL:'0'},{VERCEL_PROJECT_ID:'other'},{VERCEL_ENV:'production'},{VERCEL_ENV:'development'},{VERCEL_TARGET_ENV:'production'},{MYEVE_CLOUD_DETERMINISTIC_ENABLED:'false'}])expect(cloudRuntimeEnabled({...env,...change})).toBe(false);
 });
 it('rejects conflicting local, paid or static Factory authority and unknown configuration',()=>{
  expect(cloudRuntimeConfiguration(env)).toEqual({engineering:{},factory:{},source:{}});
  for(const change of [{FACTORY_STAGING_PROTECTION_BYPASS:'synthetic'},{MYEVE_FACTORY_REAL_EXECUTION_APPROVED:'true'},{MYEVE_FACTORY_LOCAL_WORKER:'true'},{MYEVE_CLOUD_QUALIFICATION_CONFIG:'{}'},{MYEVE_CLOUD_QUALIFICATION_CONFIG:'x'.repeat(100001)}])expect(()=>cloudRuntimeConfiguration({...env,...change})).toThrow();
 });
});
describe('cloud controller durable wakeups',()=>{
 it('persists the next bounded wake before command execution, retaining the same command and deployment',async()=>{
  const order:string[]=[],send=vi.fn(async()=>{order.push('wake');}),run=vi.fn(async()=>{order.push('run');});
  await consumeControllerDelivery(message,metadata,'dpl_abc',{now:()=>now,send,run});
  expect(order).toEqual(['wake','run']);expect(send).toHaveBeenCalledWith({...message,tick:1});expect(run).toHaveBeenCalledWith(message);
 });
 it('does not execute when recovery enqueue fails',async()=>{
  const run=vi.fn();await expect(consumeControllerDelivery(message,metadata,'dpl_abc',{now:()=>now,send:async()=>{throw Error('outage');},run})).rejects.toThrow('outage');expect(run).not.toHaveBeenCalled();
 });
 it('denies wrong deployment, topic, region, additional authority and extended deadline before any work',async()=>{
  for(const [payload,meta,deployment] of [[message,metadata,'dpl_other'],[message,{...metadata,topicName:'other'},'dpl_abc'],[message,{...metadata,region:'sfo1'},'dpl_abc'],[{...message,token:'untrusted'},metadata,'dpl_abc'],[{...message,expiresAt:now+600001},metadata,'dpl_abc']] as const){
   const send=vi.fn(),run=vi.fn();await expect(consumeControllerDelivery(payload,meta,deployment,{now:()=>now,send,run})).rejects.toThrow();expect(send).not.toHaveBeenCalled();expect(run).not.toHaveBeenCalled();
  }
 });
 it('stops after the retained deadline without extending authority',async()=>{
  const send=vi.fn(),run=vi.fn();await consumeControllerDelivery(message,metadata,'dpl_abc',{now:()=>message.expiresAt,send,run});expect(send).not.toHaveBeenCalled();expect(run).not.toHaveBeenCalled();
 });
 it('bounds wakeup count while permitting final reconciliation of the same attempt',async()=>{
  const send=vi.fn(),run=vi.fn();await consumeControllerDelivery({...message,tick:60},metadata,'dpl_abc',{now:()=>now,send,run});expect(send).not.toHaveBeenCalled();expect(run).toHaveBeenCalledOnce();
 });
});
