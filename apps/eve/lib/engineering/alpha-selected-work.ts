import {alphaOwnerBinding} from './alpha-owner-binding.ts';
import {productionCloudConfiguration} from './production-runtime-guard.ts';
import {assertProductionApproval} from './production-approval.ts';
/** An exception for one explicitly approved selection; never general discovery,
 * Work creation, native execution or a different owner/Work/generation. */
export function selectedAlphaWork(workId:unknown,env:NodeJS.ProcessEnv=process.env,requireLive=true){
 if(!env.MYEVE_ALPHA_OWNER_BINDING||typeof workId!=='string')return null;
 const binding=alphaOwnerBinding(env),config=productionCloudConfiguration(env);
 if(!binding||config.mode!=='CLOUD_PRODUCTION_CANARY'||config.work.id!==workId)throw Error('ALPHA_SELECTED_WORK_REQUIRED');
 const approval=assertProductionApproval(config.authorizationEnvelope,config.authorizationSha256,Date.now(),requireLive);
 return {binding,config,approval};
}
export function selectedEngineeringWorkEnabled(workId:unknown,general:boolean,env:NodeJS.ProcessEnv=process.env){
 if(env.MYEVE_ALPHA_OWNER_BINDING)return !!selectedAlphaWork(workId,env);
 return general;
}
