import {productionCloudEnabled,productionCloudConfiguration} from './production-runtime-guard.ts';
import {cloudRuntimeEnabled,cloudRuntimeConfiguration} from './cloud-runtime-guard.ts';
import {z} from 'zod';
import {treeObjects} from './github.ts';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {factoryConfig,FactoryRouteAuthority} from './factory-routing.ts';
import {FactoryWorkDriver} from './factory-work-driver.ts';
import {DirectDevelopmentStore} from './direct-development.ts';
import {WorkStore} from './store.ts';
import {WorkError} from './types.ts';
import {usesFactoryCommandChecks} from './factory-signed-check-verifier.ts';
import {preflightApprovedBase} from './base-preflight.ts';
import {hasMissionControlEnrollment} from '../missioncontrol/owner-factory-binding.ts';
import {LiveFactoryAdapter} from './factory-live-adapter.ts';
import type {FactoryCapabilityClient} from './factory-capability-client.ts';
const exec=promisify(execFile);
/** Only reviewed exact Git objects; no ambient credentials or mutable checkout. */
export async function factoryRuntime(store:WorkStore,workId?:string,capability?:FactoryCapabilityClient){
 // Owner app profiles derive objective and criteria from the Work, so every authority check re-reads it.
 const readConfig=async()=>factoryConfig(workId?await store.get(workId):undefined);
 const config=await readConfig(),c=config.engineering,authority=new FactoryRouteAuthority(store,readConfig);
 const requireOrderedAdmission=await hasMissionControlEnrollment(store.database,store.principal.scopeId);
 if(capability&&(capability.config.binding.ownerId!==store.principal.scopeId||capability.config.binding.agentId!==c.agentId))throw Error('FACTORY_CAPABILITY_CONFIGURATION');
 const adapterFor=(connection:typeof config.connection)=>new LiveFactoryAdapter(connection,fetch,capability,{requireOrderedAdmission});
 if('transport' in config.connection){
  if((!cloudRuntimeEnabled()&&!productionCloudEnabled())||store.principal.scopeKind!=='personal'||store.principal.scopeId!==c.ownerId||store.principal.actorId!==c.ownerId)throw Error('CLOUD_QUALIFICATION_OWNER_REQUIRED');
  const snapshot=z.object({sha:z.string().regex(/^[a-f0-9]{40}$/),files:z.record(z.string(),z.string().max(100000))}).strict().parse((productionCloudEnabled()?productionCloudConfiguration():cloudRuntimeConfiguration()).source);
  if(snapshot.sha!==config.connection.source.commit||treeObjects(snapshot.files).sha!==config.connection.source.tree)throw Error('CLOUD_QUALIFICATION_SOURCE_PIN');
  preflightApprovedBase(c.profile,c.approvedBase,snapshot,1);
  // FactoryWorkDriver consumes the separately signed protected cloud evidence.
  // This sentinel makes any accidental local-verifier route fail closed.
  const verifier={verify:async()=>{throw Error('LOCAL_VERIFIER_FORBIDDEN_IN_CLOUD');}};
  return new FactoryWorkDriver(store,authority,new DirectDevelopmentStore(store,{profile:c.profile,approvedBase:c.approvedBase,objective:c.objective,criteria:c.criteria,agentId:c.agentId,issueNumber:1}),verifier,async()=>structuredClone(snapshot),adapterFor);
 }
 const repositoryPath=config.connection.repositoryPath;
 const source=async()=>{
  const files:Record<string,string>={};
  for(const file of c.approvedBase.files){
   const {stdout}=await exec('git',['-C',repositoryPath,'show',`${c.approvedBase.sha}:${file.path}`],{encoding:'utf8',maxBuffer:1000000,timeout:10000});
   files[file.path]=stdout;
  }
  const snapshot={sha:c.approvedBase.sha,files};preflightApprovedBase(c.profile,c.approvedBase,snapshot,1);return snapshot;
 };
 // MyFactory verifies local candidates and signs the outcome; MyEve never runs candidate checks itself.
 if(!usesFactoryCommandChecks(c.profile))throw new WorkError('factory_verification_profile','Local Factory Work requires MyFactory command checks.',503);
 const verifier={verify:async()=>{throw Error('LOCAL_VERIFIER_FORBIDDEN_FOR_FACTORY');}};
 return new FactoryWorkDriver(store,authority,new DirectDevelopmentStore(store,{profile:c.profile,approvedBase:c.approvedBase,objective:c.objective,criteria:c.criteria,agentId:c.agentId,issueNumber:1}),verifier,source,adapterFor);
}
