import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {digest} from './contract.ts';
const mocks=vi.hoisted(()=>({engineering:vi.fn(),execution:vi.fn(),get:vi.fn(),query:vi.fn(),gate:vi.fn(),enqueue:vi.fn(),wake:vi.fn(),principal:{id:'owner'} as {id:string}|null}));
vi.mock('../web-auth.ts',async()=>({...await vi.importActual('../web-auth.ts'),webPrincipal:()=>mocks.principal}));
vi.mock('./runtime.ts',()=>({engineeringConfig:mocks.engineering}));
vi.mock('./factory-routing.ts',()=>({factoryConfig:mocks.execution}));
vi.mock('./store.ts',()=>({WorkStore:class{get=mocks.get;database={query:mocks.query};}}));
vi.mock('./factory-validation-lifecycle.ts',()=>({readValidationGate:mocks.gate}));
vi.mock('./factory-commands.ts',()=>({enqueueFactoryCommand:mocks.enqueue}));
vi.mock('./cloud-controller-queue.ts',()=>({wakeCloudController:mocks.wake}));
import {handleProductionValidation,retainedValidationProofConnection} from './production-validation.ts';
import type {Work} from './types.ts';
const source={repository:'jaydubya818/MyFactory',commit:'c'.repeat(40),tree:'d'.repeat(40)},profile={repository:source.repository};
const sourceDigest='a'.repeat(64),configurationDigest='b'.repeat(64),factoryVersion=digest({sourceDigest,configurationDigest});
const work={id:'11111111-1111-4111-8111-111111111111',generation:2,version:2,scopeId:'owner',repository:source.repository,title:'Saved validation',objective:'Read retained Proof',lifecycle:'active',control:'agent',criteriaVersion:1,criteria:[],maxCostUsd:1,maxDurationSeconds:180,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z'} satisfies Work;
const pin={mode:'OPERATOR_DETERMINISTIC_VALIDATION' as const,work:{id:work.id,generation:2},engineering:{},source:{sha:source.commit,files:{}},factory:{connection:{transport:'CLOUD',protocol:'MYFACTORY_EXECUTION_V2',projectId:'prj_4hfceCN8l6wN1gUyYOzZLQ7aJapK',releaseValidation:true,origin:'https://myfactory-cloud-production.vercel.app',factoryId:'myfactory-cloud-production',sourceDigest,configurationDigest,factoryVersion,source,
 keys:[{factoryId:'myfactory-cloud-production',keyId:'test',publicKey:'test',activeFrom:'2020-01-01',notAfter:'2099-01-01'}],qualification:{scopeId:'owner',profileHash:digest(profile),evidenceRef:'saved validation',qualifiedAt:'2026-01-01T00:00:00Z',expiresAt:'2026-01-02T00:00:00Z',mode:'CLOUD_PRODUCTION_VALIDATION',spendEnforced:true}}}};
beforeEach(()=>{vi.resetAllMocks();mocks.principal={id:'owner'};mocks.get.mockResolvedValue(work);mocks.query.mockResolvedValue([]);mocks.gate.mockResolvedValue({state:'COMPLETED'});mocks.engineering.mockResolvedValue({ownerId:'owner',profile,approvedBase:{sha:source.commit}});mocks.execution.mockRejectedValue(Error('PRODUCTION_VALIDATION_FACTORY_BINDING'));
 for(const [k,v] of Object.entries({NODE_ENV:'production',VERCEL:'1',VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_L6faw25wnFGUZtrLKBIccg8gIDLR',MYEVE_OWNER_ID:'owner',MYEVE_FACTORY_PRODUCTION_APPLICATION_TOKEN:'e'.repeat(64),FACTORY_PROOF_TOKEN:'f'.repeat(64),FACTORY_PROOF_EXPIRES_AT:'2099-01-01T00:00:00.000Z',MYEVE_PRODUCTION_VALIDATION_CONFIG:JSON.stringify(pin),MYEVE_CLOUD_PRODUCTION_INSTALLATION:JSON.stringify({version:1,ownerScope:'owner',projectId:'prj_4hfceCN8l6wN1gUyYOzZLQ7aJapK',sourceDigest:'9'.repeat(64),origin:'https://myfactory-cloud-production.vercel.app'})}))vi.stubEnv(k,v);
});
afterEach(()=>vi.unstubAllEnvs());
it('keeps saved execution pins after installation upgrade and permits expired execution qualification for readback only',async()=>{
 const c=await retainedValidationProofConnection(pin,work);expect(c.sourceDigest).toBe(sourceDigest);expect(c.factoryVersion).toBe(factoryVersion);expect(c.qualification.expiresAt).toBe('2026-01-02T00:00:00Z');expect(c.evidence?.token).toBe('f'.repeat(64));expect(mocks.execution).not.toHaveBeenCalled();
});
it('GET reaches retained evidence only after COMPLETED without current execution admission',async()=>{
 const response=await handleProductionValidation(new Request('https://sofie-personal-agent.vercel.app/api/production-validation'));
 expect(response.status).toBe(200);expect((await response.json()).state).toBe('AWAITING_EVIDENCE');expect(mocks.query).toHaveBeenCalledOnce();expect(mocks.execution).not.toHaveBeenCalled();expect(mocks.enqueue).not.toHaveBeenCalled();expect(mocks.wake).not.toHaveBeenCalled();
});
it('POST still denies historical source after upgrade and queues no execution',async()=>{
 const response=await handleProductionValidation(new Request('https://sofie-personal-agent.vercel.app/api/production-validation',{method:'POST',headers:{origin:'https://sofie-personal-agent.vercel.app'}}));
 expect(response.status).toBe(503);expect(mocks.execution).toHaveBeenCalledOnce();expect(mocks.enqueue).not.toHaveBeenCalled();expect(mocks.wake).not.toHaveBeenCalled();
});
it.each(['HALTED','AWAITING_EVIDENCE'])('does not assemble retained configuration for %s lifecycle',async state=>{mocks.gate.mockResolvedValue({state});await handleProductionValidation(new Request('https://sofie-personal-agent.vercel.app/api/production-validation'));expect(mocks.engineering).not.toHaveBeenCalled();expect(mocks.query).not.toHaveBeenCalled();});
it.each([{scopeId:'other'},{id:'22222222-2222-4222-8222-222222222222'},{generation:3},{repository:'other/repository'}])('denies foreign or changed Work %j',async patch=>{await expect(retainedValidationProofConnection(pin,{...work,...patch} as Work)).rejects.toThrow('VALIDATION_RETAINED_PROOF_BINDING');});
it.each(['sourceDigest','configurationDigest','factoryVersion'])('denies altered saved %s',async key=>{const changed=structuredClone(pin);(changed.factory.connection as Record<string,unknown>)[key]='8'.repeat(64);await expect(retainedValidationProofConnection(changed,work)).rejects.toThrow('VALIDATION_RETAINED_PROOF_BINDING');});
it('denies another signed-in owner before configuration or evidence access',async()=>{mocks.principal={id:'partner'};expect((await handleProductionValidation(new Request('https://sofie-personal-agent.vercel.app/api/production-validation'))).status).toBe(403);expect(mocks.get).not.toHaveBeenCalled();expect(mocks.engineering).not.toHaveBeenCalled();});
