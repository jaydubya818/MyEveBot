import {productionCloudEnabled,productionCloudConfiguration} from './production-runtime-guard.ts';
import {productionInstallation} from './production-installation.ts';
import {cloudEnvironmentRouting} from './cloud-environment-routing.ts';
import {cloudRuntimeEnabled,cloudRuntimeConfiguration} from './cloud-runtime-guard.ts';
import {factorySpendAdmission} from './factory-spend.ts';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {engineeringConfig,runtimeSchema} from './runtime.ts';
import {NativeRouteAuthority} from './native-routing.ts';
import {digest} from './contract.ts';
import {factoryConnectionSchema,LiveFactoryAdapter,type FactoryPrepareRequest} from './factory-live-adapter.ts';
import {WorkStore} from './store.ts';
import {WorkError,type Work} from './types.ts';

export const betaIntentSchema=z.enum(['INVESTIGATE','PLAN','BOUNDED_OPERATION','PRODUCE','APPROVE','JUDGMENT','UNSUPPORTED']);
const betaPolicySchema=z.object({intent:betaIntentSchema,boundedOperationQualified:z.boolean().default(false)}).strict();
export const factoryRuntimeSchema=z.object({routing:betaPolicySchema.default({intent:'UNSUPPORTED',boundedOperationQualified:false}),connection:factoryConnectionSchema,commands:z.array(z.string().min(1).max(500)).min(1).max(20)}).strict();
export async function factoryConfig(work?:Work){
 const catalogFile=process.env.MYEVE_FACTORY_WORK_PROFILES;
 if(catalogFile&&work){
  if(process.env.MYEVE_ENGINEERING_MODE!=="dogfood"||process.env.VERCEL_ENV==="production"||cloudRuntimeEnabled()||productionCloudEnabled()||!catalogFile.startsWith('/'))
   throw new WorkError('factory_project_disabled','Project profiles are deferred outside isolated dogfood qualification.',403);
  const catalog=projectFactoryProfilesSchema.parse(JSON.parse(await readFile(catalogFile,'utf8')));
  return selectProjectFactoryProfile(catalog,work);
 }
 const engineering=await engineeringConfig(),file=process.env.MYEVE_FACTORY_CONFIG;
 if(productionCloudEnabled()){
  const production=productionCloudConfiguration(),raw=production.factory,installed=productionInstallation(),validation=production.mode==='OPERATOR_DETERMINISTIC_VALIDATION';
  const connection={...(raw.connection as Record<string,unknown>),...installed.connection,...(validation?{releaseValidation:true}:{productionCanary:true,authorizationEnvelopeSha256:production.mode==='CLOUD_PRODUCTION_CANARY'?production.authorizationSha256:undefined}),evidence:{ownerScope:engineering.ownerId,token:process.env.FACTORY_PROOF_TOKEN,expiresAt:process.env.FACTORY_PROOF_EXPIRES_AT}};
  const factory=factoryRuntimeSchema.parse({...raw,connection});
  if(!('source' in factory.connection)||factory.connection.factoryId!=='myfactory-cloud-production'||factory.connection.sourceDigest!==installed.config.sourceDigest||factory.connection.qualification.mode!==(validation?'CLOUD_PRODUCTION_VALIDATION':'LIVE')||factory.connection.qualification.scopeId!==engineering.ownerId||factory.connection.qualification.profileHash!==digest(engineering.profile))throw Error('PRODUCTION_VALIDATION_FACTORY_BINDING');
  return {engineering,...factory};
 }
 if(cloudRuntimeEnabled()){
  const raw=cloudRuntimeConfiguration().factory as Record<string,unknown>;
  const connection={...(raw?.connection as Record<string,unknown>),evidence:{ownerScope:engineering.ownerId,token:process.env.FACTORY_PROOF_TOKEN,expiresAt:process.env.FACTORY_PROOF_EXPIRES_AT},token:process.env.FACTORY_SOFIE_STAGING_TOKEN,origin:process.env.FACTORY_STAGING_ORIGIN};
  const factory=factoryRuntimeSchema.parse({...raw,connection});
  if(!('source' in factory.connection)||factory.connection.factoryId!=='myfactory-cloud-staging'||factory.connection.qualification.mode!=='CLOUD_DETERMINISTIC'||factory.connection.qualification.scopeId!==engineering.ownerId||factory.connection.qualification.profileHash!==digest(engineering.profile))throw Error('CLOUD_QUALIFICATION_FACTORY_BINDING');
  return {engineering,...factory};
 }
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
  const {selection,...snapshot}=await this.assess(work,requestId,prepared);
  return snapshot;
 }
 async assess(work:Work,requestId?:string,prepared?:FactoryPrepareRequest){
  const config=await this.readConfig(),connection=config.connection,q=connection.qualification;
  if('source' in connection&&connection.projectId==='prj_4hfceCN8l6wN1gUyYOzZLQ7aJapK'){
   const pin=productionCloudConfiguration().work;
   if(work.id!==pin.id||work.generation!==pin.generation||work.scopeId!==config.engineering.ownerId)throw new WorkError('production_validation_scope','Only the exact operator release-validation Work is authorized.',403);
  }
  const native=await new NativeRouteAuthority(this.store,async()=>config.engineering).read(work);
  const policy=betaPolicySchema.parse(config.routing??{intent:'UNSUPPORTED'});
  // Non-Factory proposals do not depend on Factory transport or paid execution readiness.
  if(policy.intent==='PRODUCE'){
   const spend=factorySpendAdmission(connection);
   if(!spend.allowed)throw new WorkError('factory_spend_unqualified',spend.reasons.join('; '),503);
  }
  const healthy=policy.intent==='PRODUCE'?await new LiveFactoryAdapter(connection).healthy():false;
  const now=Date.now();
  const qualified=q.scopeId===work.scopeId&&q.profileHash===digest(config.engineering.profile)&&Date.parse(q.qualifiedAt)<=now&&Date.parse(q.expiresAt)>now&&
    (q.mode==='LOCAL_FIXTURE'||q.spendEnforced);
  const selection=betaRoute(policy.intent,{factoryQualified:qualified,factoryAvailable:healthy,
   writerFree:native.facts.writerState==='NONE',scopeAllowed:native.facts.workActive&&native.facts.authority==='ALLOW',
   budgetAvailable:native.facts.remainingBudgetUsd>0,readOnlyAllowed:native.facts.authority==='ALLOW',
   boundedOperationQualified:policy.boundedOperationQualified});
  const provider={id:connection.factoryId,version:connection.factoryVersion};
  const contract={...native.contract,allowedRoutes:['MYFACTORY' as const],allowedOperations:['factory.submit'],
   deadline:prepared?.deadline??native.contract.deadline,
   routePolicy:{id:'beta-factory-engineering',version:config.engineering.profile.policyVersion},
   routingProfile:{...native.contract.routingProfile,interaction:'Sofie owns Work; MyFactory produces the bounded candidate',humanJudgment:'Approval and exceptional recovery only'}};
  const providers={DIRECT:null,DEEP_AGENT:null,EXECUTOR:null,MYFACTORY:provider,RELAY:null};
  const facts={...native.facts,allowedRoutes:['MYFACTORY' as const],allowedOperations:['factory.submit'],
   routePolicy:{...contract.routePolicy,allowedRoutes:contract.allowedRoutes,providers},factoryAdmission:qualified&&healthy?'ALLOW':'DENY',
   qualifications:{...providers,MYFACTORY:{provider,scope:contract.scope,status:qualified?'QUALIFIED':'UNQUALIFIED',health:healthy?'HEALTHY':'UNHEALTHY',evidenceRef:q.evidenceRef,observedAt:new Date(now).toISOString(),expiresAt:q.expiresAt}}};
  const environment='source' in connection?cloudEnvironmentRouting(work,config,healthy,contract.deadline,now):undefined;
  return {selection,contract,context:native.context,facts,binding:native.binding,...(environment?{environment}:{}),
   ...(requestId?{factory:{requestId,repository:work.repository,baseSha:config.engineering.approvedBase.sha,profileHash:digest(config.engineering.profile),allowedPaths:config.engineering.profile.allowedPaths,deadline:contract.deadline}}:{})};
 }
}
/** Backend-reviewed Work intent selects a proposal. Execution still requires canonical admission. */
export function betaRoute(intent:'INVESTIGATE'|'PLAN'|'BOUNDED_OPERATION'|'PRODUCE'|'APPROVE'|'JUDGMENT'|'UNSUPPORTED',facts:{factoryQualified:boolean;factoryAvailable:boolean;writerFree:boolean;scopeAllowed:boolean;budgetAvailable:boolean;readOnlyAllowed:boolean;boundedOperationQualified?:boolean}){
 if(intent==='APPROVE'||intent==='JUDGMENT'||intent==='UNSUPPORTED'||!facts.scopeAllowed)return {route:'HUMAN',reason:'Owner judgment or unsupported scope'} as const;
 if(intent==='INVESTIGATE'||intent==='PLAN')return {route:facts.readOnlyAllowed?'DIRECT':'HUMAN',reason:'Bounded read-only Sofie work'} as const;
 if(intent==='BOUNDED_OPERATION')return {route:facts.boundedOperationQualified&&facts.budgetAvailable&&facts.writerFree?'DIRECT':'HUMAN',reason:'Bounded operations require separate backend qualification and normal action admission'} as const;
 if(intent!=='PRODUCE')return {route:'HUMAN',reason:'Unsupported intent'} as const;
 return facts.factoryQualified&&facts.factoryAvailable&&facts.writerFree&&facts.budgetAvailable?
  {route:'MYFACTORY',reason:'Qualified bounded software production uses MyFactory'} as const:
  {route:'HUMAN',reason:'Factory qualification, availability, writer or budget is blocked; no automatic native fallback'} as const;
}

/** Reviewed server allocation over canonical Works, never an execution ledger.
 * No model/API field selects a profile or increases the fixed project envelope. */
export const projectFactoryProfilesSchema=z.object({
 ownerId:z.string().min(1),projectId:z.string().min(1),ceilingMicrousd:z.number().int().positive().max(100_000_000),
 profiles:z.array(z.object({workId:z.string().uuid(),allocationMicrousd:z.number().int().positive(),engineering:runtimeSchema,factory:factoryRuntimeSchema}).strict()).min(1).max(20),
}).strict().superRefine((c,ctx)=>{
 if(new Set(c.profiles.map(p=>p.workId)).size!==c.profiles.length||c.profiles.reduce((n,p)=>n+p.allocationMicrousd,0)>c.ceilingMicrousd)
  ctx.addIssue({code:'custom',message:'Distinct Work allocations must fit the fixed project envelope'});
 for(const p of c.profiles)if(p.engineering.ownerId!==c.ownerId||p.engineering.mode!=='isolated-dogfood'||!['LOCAL_FIXTURE','LOCAL_SPEND_FIXTURE'].includes(p.factory.connection.qualification.mode))
  ctx.addIssue({code:'custom',message:'Only owner-bound isolated fixture profiles are qualified'});
});
export function selectProjectFactoryProfile(catalog:z.infer<typeof projectFactoryProfilesSchema>,work:Work){
 const p=catalog.profiles.find(p=>p.workId===work.id);
 if(!p||work.scopeId!==catalog.ownerId||work.maxCostUsd*1_000_000>p.allocationMicrousd||
   p.engineering.profile.repository!==work.repository||p.engineering.objective!==work.objective||digest(p.engineering.criteria)!==digest(work.criteria))
  throw new WorkError('factory_project_binding','Canonical Work differs from its fixed reviewed project allocation.',403);
 return {engineering:p.engineering,...p.factory};
}

/** Re-read owner, Work revision and reviewed configuration at every authority
 * check. A prepared source snapshot must never freeze revocation policy. */
export async function factoryConfigForWork(store:Pick<WorkStore,'get'>,workId?:string,read:typeof factoryConfig=factoryConfig){
 return read(workId?await store.get(workId):undefined);
}
