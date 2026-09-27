import {defineDynamic,defineTool} from 'eve/tools';
import {factoryAction,factoryActionSchema} from '../../lib/engineering/factory-api.ts';
import {factoryConfig} from '../../lib/engineering/factory-routing.ts';
import {WorkStore} from '../../lib/engineering/store.ts';
import {WorkError} from '../../lib/engineering/types.ts';
import {EngineeringWorkerProjectionStore} from '../../lib/engineering/worker-projection.ts';
import {currentTruthLines} from '../../lib/engineering/current-truth-lines.ts';
import {ActionGateway,consumeActionAuthority,consumeProviderAuthority} from '../../lib/action-gateway.ts';
import {toolActionRequest} from '../lib/action-context.ts';
import {assertEngineeringKnowledgeWorkBinding} from '../lib/engineering-knowledge-binding.ts';
import {resolveSessionAgent} from '../lib/session-settings.ts';
import {ENGINEERING_WORK_ID_PATTERN} from '../lib/engineering-work-binding.ts';
/** Selection and qualification are backend observations, never model parameters. */
export default defineDynamic({events:{'step.started':async(_event,ctx)=>{
 const initial=ctx.session.auth.current,selected=initial?.attributes.myeveEngineeringWorkId;
 if(process.env.MYEVE_ENGINEERING_MODE!=='dogfood'||process.env.VERCEL_ENV==='production'||!process.env.MYEVE_FACTORY_CONFIG||typeof selected!=='string'||!ENGINEERING_WORK_ID_PATTERN.test(selected))return null;
 return defineTool({availableInSubagents:false,description:'Start or reconcile the selected owner-resumed Work through qualified MyFactory. Substantial code production defaults to MyFactory; do not select native execution as an automatic fallback. Exact Work revision and generation are required. Stop or take over only on the direct owner request. Factory results require independent protected verification and remain PARTIAL; never grant Ready or publication. Read Current Truth through engineering_work get. The local worker automatically receives, reconciles and verifies results.',inputSchema:factoryActionSchema,
 async execute(input,toolCtx){
  const principal=toolCtx.session.auth.current;
  if(!principal||principal.principalId!==initial?.principalId||principal.principalType!=='user'||principal.attributes.owner!=='true'||principal.attributes.role==='guest'||principal.attributes.myeveRoleId||principal.attributes.myeveEngineeringWorkId!==selected||toolCtx.session.parent)throw new WorkError('factory_binding','Current owner selected Work is required.',403);
  await assertEngineeringKnowledgeWorkBinding(toolCtx,principal.principalId,selected);
  const config=await factoryConfig(),agent=await resolveSessionAgent({ownerId:principal.principalId,sessionId:toolCtx.session.id,auth:toolCtx.session.auth,primaryFallback:true});
  if(!agent?.isPrimary||agent.id!==config.engineering.agentId)throw new WorkError('factory_agent','The configured primary Agent is required.',403);
  const store=new WorkStore({scopeKind:'personal',scopeId:principal.principalId,actorId:principal.principalId});
  const action=await toolActionRequest(toolCtx,{capabilityId:'tool.engineering_factory',actionClass:'write',parameters:{workId:selected,...input}});
  return new ActionGateway().execute(action,{
   async resolveTarget(){return {provider:config.connection.factoryId,account:principal.principalId,resource:'engineering-work:'+selected,environment:'isolated-dogfood'};},
   async execute(parameters,handle){await consumeActionAuthority(handle,parameters,action.capabilityId);await consumeProviderAuthority(handle,parameters,action.capabilityId);await factoryAction(store,selected,input);return {currentTruth:currentTruthLines((await new EngineeringWorkerProjectionStore(store,agent.id).get(selected)).projection)};},
   receipt(result){return {...result};},async verify(result){return {verified:true,receipt:{...result}};}
  });
 }});
}}});
