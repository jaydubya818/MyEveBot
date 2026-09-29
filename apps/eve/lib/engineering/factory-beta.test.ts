import {describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {betaRoute} from './factory-routing.ts';
import {factoryActionSchema,handleFactoryRequest} from './factory-api.ts';
import {LiveFactoryAdapter,type FactoryConnection} from './factory-live-adapter.ts';
import {digest} from './factory-producer-protocol.ts';
const sourceDigest='a'.repeat(64),configurationDigest='b'.repeat(64);
const config:FactoryConnection={origin:'http://127.0.0.1:12345',token:'c'.repeat(64),factoryId:'fixture',sourceDigest,configurationDigest,factoryVersion:digest({sourceDigest,configurationDigest}),repositoryPath:'/fixture',keys:[{factoryId:'fixture',keyId:'k',publicKey:'fixture',activeFrom:'2020-01-01',notAfter:'2099-01-01'}],qualification:{scopeId:'owner',profileHash:'d'.repeat(64),evidenceRef:'local',qualifiedAt:'2026-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z',mode:'LOCAL_FIXTURE',spendEnforced:true}};
describe('Factory beta boundaries',()=>{
 const eligible={factoryQualified:true,factoryAvailable:true,writerFree:true,scopeAllowed:true,budgetAvailable:true,readOnlyAllowed:true};
 it('routes substantial production deterministically and never falls back to native',()=>{
  expect(betaRoute('PRODUCE',eligible).route).toBe('MYFACTORY');
  for(const key of ['factoryQualified','factoryAvailable','writerFree','scopeAllowed','budgetAvailable'])expect(betaRoute('PRODUCE',{...eligible,[key]:false}).route).toBe('HUMAN');
  expect(betaRoute('PLAN',eligible).route).toBe('DIRECT');expect(betaRoute('INVESTIGATE',eligible).route).toBe('DIRECT');expect(betaRoute('APPROVE',eligible).route).toBe('HUMAN');
 });
 it('keeps bounded operations behind separate qualification and sends unsupported judgment to human',()=>{
  expect(betaRoute('BOUNDED_OPERATION',eligible).route).toBe('HUMAN');
  expect(betaRoute('BOUNDED_OPERATION',{...eligible,boundedOperationQualified:true}).route).toBe('DIRECT');
  for(const key of ['scopeAllowed','budgetAvailable','writerFree'])expect(betaRoute('BOUNDED_OPERATION',{...eligible,boundedOperationQualified:true,[key]:false}).route).toBe('HUMAN');
  for(const intent of ['UNSUPPORTED','JUDGMENT'] as const)expect(betaRoute(intent,eligible).route).toBe('HUMAN');
  expect(betaRoute('unknown' as never,eligible).route).toBe('HUMAN');
 });
 it.each(['https://evil.invalid','http://localhost:12345','http://127.0.0.1:12345/private','http://x:y@127.0.0.1:12345'])('rejects unqualified credential destination %s',origin=>{expect(()=>new LiveFactoryAdapter({...config,origin})).toThrow();});
 it('rejects owner-supplied connection, qualification or dispatch bindings',()=>{
  const input={operation:'start',expectedWorkVersion:2,expectedWorkGeneration:2};expect(factoryActionSchema.safeParse(input).success).toBe(true);
  for(const field of ['factoryVersion','keys','token','qualification','runId','writerGeneration','spendPlan','spendContract','routing','intent','boundedOperationQualified'])expect(factoryActionSchema.safeParse({...input,[field]:'injected'}).success).toBe(false);
 });
 it('requires authenticated owner before resolving a Factory control',async()=>{
  vi.stubEnv('MYEVE_ENGINEERING_MODE','dogfood');try{const response=await handleFactoryRequest(new Request('http://localhost/api/engineering/work/x/factory',{method:'POST'}),randomUUID());expect(response.status).toBe(401);}finally{vi.unstubAllEnvs();}
 });
 it.each([{},null,{requestId:randomUUID(),state:'COMPLETED',quiescent:true},{requestId:randomUUID(),state:'RUNNING',quiescent:false,identity:{}}])('fails closed on malformed authenticated observation',async body=>{
  const adapter=new LiveFactoryAdapter(config,vi.fn(async()=>Response.json(body)) as unknown as typeof fetch);
  await expect(adapter.read({requestId:randomUUID()} as never)).rejects.toThrow();
 });
 it('unknown, unavailable and foreign execution never prove quiescence',async()=>{
  const id={runId:randomUUID(),writerGeneration:1,dispatchIdentity:randomUUID(),workId:randomUUID(),workGeneration:1,factoryId:config.factoryId,factoryVersion:config.factoryVersion,requestId:randomUUID(),workOrderId:randomUUID(),remoteRunId:randomUUID(),repository:'fixture/golden',baseSha:'a'.repeat(40),allowedPaths:['quantity.mjs'],deadline:new Date(Date.now()+10000).toISOString()};
  const body={requestId:id.requestId,workOrderId:id.workOrderId,runId:id.remoteRunId,snapshot:null,identity:id,state:'UNKNOWN',quiescent:false,evidenceRef:null,spend:{status:'UNKNOWN',ceilingUsd:1},blocker:'reconcile'};
  let reply=body;const adapter=new LiveFactoryAdapter(config,vi.fn(async()=>Response.json(reply)) as unknown as typeof fetch);
  expect(await adapter.observe(id)).toBeNull();reply={...body,quiescent:true};await expect(adapter.observe(id)).rejects.toThrow(/terminal/);
  reply={...body,identity:{...id,writerGeneration:2}};await expect(adapter.observe(id)).rejects.toThrow(/exact writer/);
  const offline=new LiveFactoryAdapter(config,vi.fn(async()=>new Response('',{status:503})) as unknown as typeof fetch);await expect(offline.observe(id)).rejects.toThrow(/unavailable/);
 });
});
