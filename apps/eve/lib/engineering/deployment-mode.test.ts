import {afterEach,expect,it,vi} from 'vitest';
import {engineeringWorkEnabled,hostedFactoryQueue} from './deployment-mode.ts';
import {checkCapabilityAvailability} from '../capability-registry.ts';
import {factoryAction} from './factory-api.ts';
import {CanonicalBetaWork} from '../beta-integration/canonical-work.ts';
import {WorkStore} from './store.ts';
const alpha: NodeJS.ProcessEnv={NODE_ENV:'production',MYEVE_BETA_MODE:'private-alpha',MYEVE_ENGINEERING_MODE:'private-alpha',MYEVE_FACTORY_WORKER_ENABLED:'true',MYEVE_OWNER_ID:'owner',MYEVE_FACTORY_ID:'factory',VERCEL_ENV:'production',DATABASE_URL:'postgres://localhost/unused',MYEVE_ALPHA_REPOSITORY:'test/fixture',MYEVE_ALPHA_MAX_WORK_USD:'1.35',MYEVE_ALPHA_MAX_WORK_SECONDS:'600',MYEVE_ACCESS_PASSWORD:'test-password-123',MYEVE_SESSION_SECRET:'test-session-secret-at-least-32-characters'};
afterEach(()=>vi.unstubAllEnvs());
it('requires every explicit alpha flag; production native discovery stays disabled',()=>{
 expect(hostedFactoryQueue(alpha)).toBe(true);
 for(const key of ['MYEVE_BETA_MODE','MYEVE_ENGINEERING_MODE','MYEVE_FACTORY_WORKER_ENABLED','MYEVE_OWNER_ID','MYEVE_FACTORY_ID']) expect(engineeringWorkEnabled({...alpha,[key]:''})).toBe(false);
 expect(engineeringWorkEnabled({NODE_ENV:'production',MYEVE_ENGINEERING_MODE:'dogfood',VERCEL_ENV:'production'})).toBe(false);
 for(const id of ['tool.engineering_work','tool.engineering_factory'])expect(checkCapabilityAvailability(id,alpha)?.status).toBe('available');
 expect(checkCapabilityAvailability('tool.engineering_direct',alpha)?.status).toBe('disabled');
});
it('hosted Factory action only queues owner intent and never constructs the local driver',async()=>{
 for(const [key,value] of Object.entries(alpha))vi.stubEnv(key,value);
 const query=vi.fn(async(sql:string)=>sql.startsWith('SELECT NOT EXISTS')?[{allowed:true}]:[{id:'queued',status:'pending'}]);
 const store=new WorkStore({scopeKind:'personal',scopeId:'owner',actorId:'owner'},{query});
 vi.spyOn(store,'get').mockResolvedValue({version:1,generation:1,repository:'test/fixture',maxCostUsd:1.35,maxDurationSeconds:600} as any);
 expect(await factoryAction(store,'id',{operation:'start',expectedWorkVersion:1,expectedWorkGeneration:1})).toMatchObject({state:'QUEUED',executionGranted:false});
 expect(query.mock.calls).toHaveLength(2);
});

it('owner continuation queues Factory admission without entering native execution or claiming ADMITTED',async()=>{
 for(const [key,value] of Object.entries(alpha))if(value!==undefined)vi.stubEnv(key,value);
 const query=vi.fn(async(sql:string)=>sql.startsWith('SELECT NOT EXISTS')?[{allowed:true}]:[{id:'queued',status:'pending'}]);
 const store=new WorkStore({scopeKind:'personal',scopeId:'owner',actorId:'owner'},{query});
 vi.spyOn(store,'get').mockResolvedValue({version:1,generation:1,repository:'test/fixture',maxCostUsd:1.35,maxDurationSeconds:600} as any);
 const native=vi.fn(()=>{throw Error('Native fallback forbidden');});
 const beta={store:()=>store,query:vi.fn()} as any;
 expect(await new CanonicalBetaWork(beta,native).admit('owner','id',1,1)).toMatchObject({status:'QUEUED',receipt:{executionGranted:false}});
 expect(native).not.toHaveBeenCalled();expect(beta.query).not.toHaveBeenCalled();
 await expect(new CanonicalBetaWork(beta,native).admit('owner','id',2,1)).rejects.toMatchObject({code:'work_changed'});
});
