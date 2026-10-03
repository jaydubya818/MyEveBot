import {z} from 'zod';
import {capabilityNames} from '../environment-fabric/environment.ts';
import {deriveRequirements,environmentIdentity,routeEnvironment,requirementsDigest} from '../environment-fabric/router.ts';
import type {EnvironmentDescriptor} from '../environment-fabric/environment.ts';
import type {FactoryRuntime} from './factory-routing.ts';
import type {Work} from './types.ts';
import {WorkError} from './types.ts';

/** Consumes the accepted Fabric router. This qualification-only descriptor and
 * scoped grant cannot enable production or grant a writer/model operation. */
export function cloudEnvironmentRouting(work:Work,config:FactoryRuntime,healthy:boolean,deadline:string,now=Date.now()){
 const c=config.connection,q=c.qualification;
 if(!('source' in c)||q.mode!=='CLOUD_DETERMINISTIC'||work.scopeId!==config.engineering.ownerId||q.scopeId!==work.scopeId||work.repository!==c.source.repository)
  throw new WorkError('cloud_environment_scope','The dedicated qualification scope is required.',403);
 const {requirements,reasons}=deriveRequirements({workId:work.id,generation:work.generation,ownerId:work.scopeId,businessId:null,repository:work.repository},{kind:'repository'});
 const image=config.engineering.profile.image.split('@')[1];
 const environment:EnvironmentDescriptor={schemaVersion:1,id:'myfactory-cloud-staging',name:'MyFactory staging',type:'CLOUD',ownerId:work.scopeId,businessId:null,
  provider:'vercel-sandbox',runtime:image,factoryVersion:c.factoryVersion,protocol:{min:1,max:1},
  capabilities:requirements.capabilities.map(name=>({name,version:1,available:healthy})),connectivity:healthy?'ONLINE':'OFFLINE',observedAt:now,capacity:healthy?1:0,revoked:false};
 const qualification={identityDigest:environmentIdentity(environment),capabilities:requirements.capabilities,evidenceRef:q.evidenceRef,qualifiedAt:Date.parse(q.qualifiedAt),expiresAt:Date.parse(q.expiresAt),status:'QUALIFIED' as const};
 const authority={workId:work.id,generation:work.generation,ownerId:work.scopeId,businessId:null,environmentIds:[environment.id],capabilities:requirements.capabilities,repositories:[c.source.repository],expiresAt:Date.parse(deadline)};
 const decision=routeEnvironment(requirements,[environment],[qualification],authority,now);
 if(!('binding' in decision))throw new WorkError(decision.state==='DENIED'?'cloud_environment_denied':'cloud_waiting_for_environment',decision.reason,503);
 return {requirements,reasons,binding:decision.binding,qualificationEvidenceRef:q.evidenceRef,evidenceClass:'DETERMINISTIC',productionAdmission:'DISABLED',sessionSurface:'HEADLESS'} as const;
}

/** Strict persisted routing evidence. It carries no execution authority. */
export const cloudRoutingEvidenceSchema=z.object({
 requirements:z.object({workId:z.string().uuid(),generation:z.number().int().positive(),ownerId:z.string().min(1).max(200),businessId:z.null(),repository:z.string().regex(/^[-\w.]+\/[-\w.]+$/),environmentType:z.literal('CLOUD'),environmentId:z.null(),capabilities:z.array(z.enum(capabilityNames)).min(1).max(capabilityNames.length)}).strict(),
 reasons:z.array(z.object({capability:z.enum(capabilityNames),resource:z.literal('repository')}).strict()).min(1).max(capabilityNames.length),
 binding:z.object({environmentId:z.literal('myfactory-cloud-staging'),environmentType:z.literal('CLOUD'),identityDigest:z.string().regex(/^[a-f0-9]{64}$/),factoryVersion:z.string().regex(/^[a-f0-9]{64}$/),protocolVersion:z.literal(1),policyVersion:z.literal('environment-routing-v1'),requirementsDigest:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
 qualificationEvidenceRef:z.string().min(1).max(200),evidenceClass:z.literal('DETERMINISTIC'),productionAdmission:z.literal('DISABLED'),sessionSurface:z.literal('HEADLESS'),
}).strict().superRefine((value,ctx)=>{
 try{if(requirementsDigest(value.requirements)!==value.binding.requirementsDigest)throw Error();}
 catch{ctx.addIssue({code:'custom',message:'Cloud routing requirements do not match the pinned binding.'});}
});
export function assertCloudRoutingWork(value:z.infer<typeof cloudRoutingEvidenceSchema>,work:Work,factoryVersion:string|number|undefined){
 const r=value.requirements;
 if(r.workId!==work.id||r.generation!==work.generation||r.ownerId!==work.scopeId||r.repository!==work.repository||value.binding.factoryVersion!==factoryVersion)
  throw new WorkError('cloud_environment_binding_changed','Cloud environment does not match current Work and FactoryVersion.',403);
}
