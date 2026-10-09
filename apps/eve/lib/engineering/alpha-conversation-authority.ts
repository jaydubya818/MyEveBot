import {selectedAlphaWork} from './alpha-selected-work.ts';
import {factoryConfig} from './factory-routing.ts';
import {factoryExecutionConfigurationHash} from './factory-work-driver.ts';
import {digest} from './contract.ts';
import type {WorkStore} from './store.ts';
/** Re-read the exact paid envelope and canonical Work before reservation and
 * dispatch. An installation binding or a selected Work alone cannot spend. */
export async function assertAlphaConversationAuthority(store:WorkStore,workId:string,engineering:unknown){
 if(!process.env.MYEVE_ALPHA_OWNER_BINDING)return null;
 const selected=selectedAlphaWork(workId);
 if(!selected)throw Error('ALPHA_CONVERSATION_AUTHORITY');
 const [work,runtime]=await Promise.all([store.get(workId),factoryConfig()]);
 const current=selectedAlphaWork(workId),request=selected.approval.manifestTemplate.request;
 if(!current||current.config.authorizationSha256!==selected.config.authorizationSha256||
   store.principal.scopeKind!=='personal'||store.principal.scopeId!==selected.binding.ownerScope||store.principal.actorId!==selected.binding.ownerScope||
   work.scopeId!==selected.binding.ownerScope||work.version!==selected.approval.workVersion||work.generation!==selected.config.work.generation||work.lifecycle!=='active'||work.control!=='agent'||
   work.repository!==request.repository||work.title!==request.input.title||work.objective!==request.input.description||digest(work.criteria)!==digest(selected.approval.criteria)||work.maxCostUsd>1.3||work.maxDurationSeconds>180||
   digest(engineering)!==digest(runtime.engineering)||factoryExecutionConfigurationHash(runtime)!==selected.approval.configurationHash)throw Error('ALPHA_CONVERSATION_AUTHORITY');
 return current;
}
