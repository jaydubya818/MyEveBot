import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {randomUUID} from 'node:crypto';
import {LiveFactoryAdapter,type FactoryConnection,type FactoryPrepareRequest} from './factory-live-adapter.ts';
import {factoryTransport} from './factory-transport.ts';
import {readFactoryAttempt} from './factory-result-channel.ts';
import {factorySpendAdmission} from './factory-spend.ts';
import {digest} from './factory-producer-protocol.ts';
vi.mock('@vercel/oidc',()=>({getVercelOidcToken:async()=>'eyJhbGciOiJub25lIn0.'+Buffer.from(JSON.stringify({project_id:'prj_XU7fJW735PtsnKoAYtGfzdnsotIB',owner_id:'team_p8z8exJRTGfOPk1GC9vUOpv3',environment:'preview',exp:Math.floor(Date.now()/1000)+300})).toString('base64url')+'.synthetic-test-signature'}));
beforeEach(()=>{vi.stubEnv('VERCEL','1');vi.stubEnv('VERCEL_PROJECT_ID','prj_XU7fJW735PtsnKoAYtGfzdnsotIB');vi.stubEnv('VERCEL_ENV','preview');});
afterEach(()=>vi.unstubAllEnvs());
const sourceDigest='a'.repeat(64),configurationDigest='b'.repeat(64);
const source={repository:'fixture/quantity',commit:'c'.repeat(40),tree:'d'.repeat(40)};
const config:FactoryConnection={transport:'CLOUD',protocol:'MYFACTORY_EXECUTION_V2',projectId:'prj_IRXTY6HOzS2q9wRPdabsJnmddzl4',origin:'https://myfactory-cloud-staging-azozoxm0r-jaydubya818.vercel.app',token:'a'.repeat(64),factoryId:'staging',sourceDigest,configurationDigest,factoryVersion:digest({sourceDigest,configurationDigest}),source,keys:[{factoryId:'staging',keyId:'test',publicKey:'test',activeFrom:'2020-01-01',notAfter:'2099-01-01'}],qualification:{scopeId:'synthetic-owner',profileHash:'e'.repeat(64),evidenceRef:'pending',qualifiedAt:'2026-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z',mode:'CLOUD_DETERMINISTIC',spendEnforced:true}};
const request=():FactoryPrepareRequest=>({requestId:randomUUID(),workId:randomUUID(),workGeneration:1,repository:source.repository,deadline:new Date(Date.now()+60000).toISOString(),maxSpendUsd:1,input:{title:'Quantity',description:'Implement positive integer validation.',kind:'feature',baseRef:source.commit,acceptanceCriteria:['Tests pass'],reproductionCommand:null,expectedFailureText:null,checkCommands:['node --test'],allowedPaths:['quantity.mjs'],workerProfile:'container'}});
describe('dedicated staging Factory transport',()=>{
 it.each(['http://127.0.0.1:8000','http://myfactory-cloud-staging-abc-jaydubya818.vercel.app','https://evil.invalid','https://sofie-personal-agent-abc-jaydubya818.vercel.app','https://myfactory-cloud-staging-abc-jaydubya818.vercel.app/other','https://myfactory-cloud-staging-abc-jaydubya818.vercel.app:8443'])('rejects credential destination %s',origin=>{expect(()=>new LiveFactoryAdapter({...config,origin})).toThrow();});
 it('does not promote a local repair binding into Cloud authority',async()=>{
  const input=request(),repairBinding={workId:input.workId,workVersion:1,workGeneration:1,workOrderId:randomUUID()};
  const fetcher=vi.fn();
  expect(()=>new LiveFactoryAdapter({...config,repairBinding} as never,fetcher)).toThrow();
  const adapter=new LiveFactoryAdapter(config,fetcher);
  for(const operation of ['prepare','prepared'] as const)await expect(adapter[operation]({...input,repairWorkOrderId:repairBinding.workOrderId})).rejects.toThrow(/reviewed host binding/);
  expect(fetcher).not.toHaveBeenCalled();
 });
 it('serializes immutable source without local paths and uses the versioned authenticated route',async()=>{
  const fetcher=vi.fn(async(_url:URL|RequestInfo,_options?:RequestInit)=>new Response('',{status:503}));
  const adapter=new LiveFactoryAdapter(config,fetcher as typeof fetch),input=request();
  await expect(adapter.prepare(input)).rejects.toThrow(/unavailable/);
  const [url,options]=fetcher.mock.calls[0] as [URL,RequestInit];
  expect(url.pathname).toBe('/api/connect/v2/dispatches');expect(options.redirect).toBe('error');
  expect(options.headers).toMatchObject({authorization:'Bearer '+config.token});
  const body=JSON.parse(String(options.body));expect(body.source).toEqual(source);expect(body.protocol).toBe('MYFACTORY_EXECUTION_V2');
  expect(body.input).not.toHaveProperty('repositoryPath');expect(body.input).not.toHaveProperty('workerProfile');expect(body.workId).toBe(input.workId);
 });
 it('refuses local paths and a changed base before contacting staging',async()=>{
  const fetcher=vi.fn();const adapter=new LiveFactoryAdapter(config,fetcher);
  const input=request();input.input.repositoryPath='/Users/owner/repo';await expect(adapter.prepare(input)).rejects.toThrow(/no local filesystem/);
  delete input.input.repositoryPath;input.input.baseRef='f'.repeat(40);await expect(adapter.prepare(input)).rejects.toThrow(/exact source/);expect(fetcher).not.toHaveBeenCalled();
 });
 it('scopes result reads to the same versioned destination and rejects redirects',async()=>{
  const fetcher=vi.fn(async(_url:URL|RequestInfo,_options?:RequestInit)=>Response.json({state:'UNKNOWN',result:null}));
  await expect(readFactoryAttempt(config,{workOrderId:'order',runId:'run'} as never,fetcher as typeof fetch)).resolves.toEqual({state:'UNKNOWN',result:null});
  const [url,options]=fetcher.mock.calls[0] as [URL,RequestInit];expect(url.pathname).toBe('/api/connect/v2/work-orders/order/runs/run/result');expect(options.redirect).toBe('error');
  await expect(readFactoryAttempt(config,{workOrderId:'order',runId:'run'} as never,vi.fn(async()=>new Response(null,{status:302,headers:{location:'https://evil.invalid'}})) as typeof fetch)).rejects.toThrow(/unavailable/);
 });
 it('cloud configuration cannot silently use local transport or unreviewed spending',()=>{
  expect(factorySpendAdmission(config).allowed).toBe(false);
  expect(()=>factoryTransport({...config,transport:undefined})).toThrow();expect(()=>factoryTransport({...config,projectId:'other'})).toThrow();
 });
});

describe('cloud custody delivery into the canonical writer',()=>{
 it('uses only the admitted staging identity and bounded custody endpoint',async()=>{
  const {treeObjects}=await import('./github.ts');
  const sourceFiles={'quantity.mjs':'export const quantity = 1;\n'},files={'quantity.mjs':'export const quantity = 2;\n'};
  const source={repository:'fixture/quantity',commit:'c'.repeat(40),tree:treeObjects(sourceFiles).sha};
  const packet={base:source.commit,candidateCommit:'e'.repeat(40),candidateTree:treeObjects(files).sha,sourceFiles,files};
  const fetcher=vi.fn(async()=>Response.json(packet)),adapter=new LiveFactoryAdapter({...config,source},fetcher);
  const identity={factoryId:config.factoryId,factoryVersion:config.factoryVersion,repository:source.repository,baseSha:source.commit,requestId:randomUUID()} as import('./factory-writer.ts').FactoryExecutionIdentity;
  await expect(adapter.custody(identity)).resolves.toEqual(packet);
  const [url,init]=fetcher.mock.calls[0] as unknown as [URL,RequestInit];expect(url.pathname).toBe('/api/connect/v2/dispatches/'+identity.requestId+'/custody');expect(init.redirect).toBe('error');
  await expect(adapter.custody({...identity,factoryVersion:'f'.repeat(64)})).rejects.toThrow(/admitted/);expect(fetcher).toHaveBeenCalledTimes(1);
  for(const altered of [{...packet,base:'a'.repeat(40)},{...packet,candidateTree:'a'.repeat(40)},{...packet,sourceFiles:{'quantity.mjs':'different'}},{...packet,files:{'../secret':'x'}},{...packet,artifactUrl:'https://other.invalid'}])await expect(new LiveFactoryAdapter({...config,source},async()=>Response.json(altered)).custody(identity)).rejects.toThrow();
 });
});
