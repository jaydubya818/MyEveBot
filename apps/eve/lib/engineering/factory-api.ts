import { hostedFactoryQueue } from "./deployment-mode.ts";
import { enqueueFactoryCommand } from "./factory-commands.ts";
import { betaConfiguration } from "../beta-integration/configuration.ts";
import { assertBusinessEffect } from "../business-effects.ts";
import {z} from 'zod';
import {boundedJson} from '../relay/client.ts';
import {engineeringPrincipal} from './api.ts';
import {factoryRuntime} from './factory-runtime.ts';
import {WorkStore} from './store.ts';
import {WorkError} from './types.ts';
export const factoryActionSchema=z.object({operation:z.enum(['start','reconcile','stop','takeover']),expectedWorkVersion:z.number().int().positive(),expectedWorkGeneration:z.number().int().positive()}).strict();
export async function factoryAction(store:WorkStore,id:string,value:unknown){
 if(hostedFactoryQueue())return enqueueFactoryCommand(store,id,value,{ownerId:process.env.MYEVE_OWNER_ID!,...betaConfiguration().policy});
 const input=factoryActionSchema.parse(value),work=await store.get(id);
 if(work.version!==input.expectedWorkVersion||work.generation!==input.expectedWorkGeneration)throw new WorkError('factory_work_changed','Reload the current Work before acting.');
 if(input.operation==='start')await assertBusinessEffect(store,id,{operation:"execute_factory"});
 const driver=await factoryRuntime(store);
 if(input.operation==='start')return driver.start(id,work.version,work.generation);
 if(input.operation==='reconcile')return driver.step(id);
 return driver.stop(id,input.operation==='takeover'?'takeover':'cancel');
}
export async function handleFactoryRequest(request:Request,id:string){
 const headers={'cache-control':'no-store'};
 try{
  z.string().uuid().parse(id);const store=new WorkStore(engineeringPrincipal(request));
  if(request.method==='GET'){await store.get(id);return Response.json({decision:await (await factoryRuntime(store)).decision(id)},{headers});}
  const result=await factoryAction(store,id,await boundedJson(new Response(request.body),2000));return Response.json({result},{headers});
 }catch(error){
  if(error instanceof WorkError)return Response.json({error:error.message,code:error.code},{status:error.status,headers});
  if(error instanceof z.ZodError)return Response.json({error:'Current Work revision and supported operation are required.'},{status:400,headers});
  return Response.json({error:'Factory action unavailable. The saved request and writer fence are retained; reconcile the same Work.'},{status:503,headers});
 }
}
