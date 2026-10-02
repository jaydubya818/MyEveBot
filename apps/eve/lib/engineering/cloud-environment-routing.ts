import {deriveRequirements,environmentIdentity,routeEnvironment} from '../environment-fabric/router.ts';
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
