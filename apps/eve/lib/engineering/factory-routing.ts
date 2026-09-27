import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {engineeringConfig} from './runtime.ts';
import {NativeRouteAuthority} from './native-routing.ts';
import {digest} from './contract.ts';
import {factoryConnectionSchema,LiveFactoryAdapter,type FactoryPrepareRequest} from './factory-live-adapter.ts';
import {WorkStore} from './store.ts';
import {WorkError,type Work} from './types.ts';

export const factoryRuntimeSchema=z.object({connection:factoryConnectionSchema,commands:z.array(z.string().min(1).max(500)).min(1).max(20)}).strict();
export async function factoryConfig(){
 const engineering=await engineeringConfig(),file=process.env.MYEVE_FACTORY_CONFIG;
 if(!file?.startsWith('/'))throw new WorkError('factory_setup','A reviewed MyFactory connection profile is required.',503);
 const factory=factoryRuntimeSchema.parse(JSON.parse(await readFile(file,'utf8')));
 return {engineering,...factory};
}
export type FactoryRuntime=Awaited<ReturnType<typeof factoryConfig>>;
/** Reuses canonical owner/agent/Work/budget context. Factory qualification comes
 * only from reviewed server configuration plus current authenticated health. */
export class FactoryRouteAuthority {
 constructor(readonly store:WorkStore,readonly readConfig:()=>Promise<FactoryRuntime>=factoryConfig){}
 async read(work:Work,requestId?:string,prepared?:FactoryPrepareRequest){
  const config=await this.readConfig(),connection=config.connection,q=connection.qualification;
  const native=await new NativeRouteAuthority(this.store,async()=>config.engineering).read(work);
  const adapter=new LiveFactoryAdapter(connection),healthy=await adapter.healthy();
  const now=Date.now();
  const qualified=q.scopeId===work.scopeId&&q.profileHash===digest(config.engineering.profile)&&Date.parse(q.qualifiedAt)<=now&&Date.parse(q.expiresAt)>now&&
    (q.mode==='LOCAL_FIXTURE'||q.spendEnforced);
  if(q.mode==='LIVE'&&!q.spendEnforced)throw new WorkError('factory_spend_unqualified','Live Factory spend enforcement is not qualified.',503);
  const provider={id:connection.factoryId,version:connection.factoryVersion};
  const contract={...native.contract,allowedRoutes:['MYFACTORY' as const],allowedOperations:['factory.submit'],
   deadline:prepared?.deadline??native.contract.deadline,
   routePolicy:{id:'beta-factory-engineering',version:config.engineering.profile.policyVersion},
   routingProfile:{...native.contract.routingProfile,interaction:'Sofie owns Work; MyFactory produces the bounded candidate',humanJudgment:'Approval and exceptional recovery only'}};
  const providers={DIRECT:null,DEEP_AGENT:null,EXECUTOR:null,MYFACTORY:provider,RELAY:null};
  const facts={...native.facts,allowedRoutes:['MYFACTORY' as const],allowedOperations:['factory.submit'],
   routePolicy:{...contract.routePolicy,allowedRoutes:contract.allowedRoutes,providers},factoryAdmission:qualified&&healthy?'ALLOW':'DENY',
   qualifications:{...providers,MYFACTORY:{provider,scope:contract.scope,status:qualified?'QUALIFIED':'UNQUALIFIED',health:healthy?'HEALTHY':'UNHEALTHY',evidenceRef:q.evidenceRef,observedAt:new Date(now).toISOString(),expiresAt:q.expiresAt}}};
  return {contract,context:native.context,facts,binding:native.binding,
   ...(requestId?{factory:{requestId,repository:work.repository,baseSha:config.engineering.approvedBase.sha,profileHash:digest(config.engineering.profile),allowedPaths:config.engineering.profile.allowedPaths,deadline:contract.deadline}}:{})};
 }
}
/** Product vocabulary only. Execution still requires canonical admission. */
export function betaRoute(intent:'INVESTIGATE'|'PLAN'|'PRODUCE'|'APPROVE',facts:{factoryQualified:boolean;factoryAvailable:boolean;writerFree:boolean;scopeAllowed:boolean;budgetAvailable:boolean;readOnlyAllowed:boolean}){
 if(intent==='APPROVE'||!facts.scopeAllowed)return {route:'HUMAN',reason:'Owner judgment or unsupported scope'} as const;
 if(intent==='INVESTIGATE'||intent==='PLAN')return {route:facts.readOnlyAllowed?'DIRECT':'HUMAN',reason:'Bounded read-only Sofie work'} as const;
 return facts.factoryQualified&&facts.factoryAvailable&&facts.writerFree&&facts.budgetAvailable?
  {route:'MYFACTORY',reason:'Qualified bounded software production uses MyFactory'} as const:
  {route:'HUMAN',reason:'Factory qualification, availability, writer or budget is blocked; no automatic native fallback'} as const;
}
