import {webPrincipal,requireSameOrigin} from '../web-auth.ts';
import {productionCanaryEnabled,productionCloudConfiguration} from './production-runtime-guard.ts';
import {WorkStore} from './store.ts';
import {factoryConfig} from './factory-routing.ts';
import {enqueueFactoryCommand} from './factory-commands.ts';
import {wakeCloudController} from './cloud-controller-queue.ts';
/** Dormant until a separate owner-approved envelope is installed. This route
 * cannot mint that approval or choose Work, source, effects or model settings. */
export async function handleProductionCanary(request:Request){
 const headers={'cache-control':'private, no-store'},principal=webPrincipal(request,{...process.env,NODE_ENV:'production'});
 if(!principal)return Response.json({error:'Sign in first.'},{status:401,headers});
 if(principal.id!==process.env.MYEVE_OWNER_ID)return Response.json({error:'Owner required.'},{status:403,headers});
 const denied=requireSameOrigin(request);if(denied)return denied;
 if(!productionCanaryEnabled())return new Response(null,{status:404,headers});
 try{
  const pin=productionCloudConfiguration();if(pin.mode!=='CLOUD_PRODUCTION_CANARY')throw Error('CANARY_NOT_AUTHORIZED');
  const config=await factoryConfig(),store=new WorkStore({scopeId:principal.id,actorId:principal.id,scopeKind:'personal'}),work=await store.get(pin.work.id);
  if(work.generation!==pin.work.generation)throw Error('CANARY_WORK_CHANGED');
  const queued=await enqueueFactoryCommand(store,work.id,{operation:'start',expectedWorkVersion:work.version,expectedWorkGeneration:work.generation},{ownerId:principal.id,repository:config.engineering.profile.repository,maxCostUsd:1,maxDurationSeconds:180});
  await wakeCloudController(store,queued.command.id);
  return Response.json({state:'QUEUED',workId:work.id,publication:'DISABLED'},{headers});
 }catch{return Response.json({state:'BLOCKED',error:'The exact canary requires reconciliation; no replacement attempt is authorized.'},{status:503,headers});}
}
