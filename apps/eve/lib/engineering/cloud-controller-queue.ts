import {productionCloudEnabled,productionCloudConfiguration} from './production-runtime-guard.ts';
import {QueueClient} from '@vercel/queue';
import {cloudRuntimeConfiguration} from './cloud-runtime-guard.ts';
import {cloudControllerTopic,productionValidationControllerTopic,productionCanaryControllerTopic,type ControllerMessage} from './cloud-controller-delivery.ts';
import type {WorkStore} from './store.ts';
export function controllerQueue(){return new QueueClient({region:'iad1'});}
export async function sendControllerWake(message:ControllerMessage,delaySeconds=0){
 if(productionCloudEnabled())productionCloudConfiguration();else cloudRuntimeConfiguration();
 const remaining=Math.ceil((message.expiresAt-Date.now())/1000);
 if(remaining<=0)return;
 return controllerQueue().send(productionCloudEnabled()?(productionCloudConfiguration().mode==='OPERATOR_DETERMINISTIC_VALIDATION'?productionValidationControllerTopic:productionCanaryControllerTopic):cloudControllerTopic,message,{idempotencyKey:`${message.commandId}:${message.deploymentId}:${message.tick}`,retentionSeconds:Math.min(600,remaining),delaySeconds});
}
export async function wakeCloudController(store:WorkStore,commandId:string){
 if(productionCloudEnabled())productionCloudConfiguration();else cloudRuntimeConfiguration();
 const p=store.principal;
 if(p.scopeKind!=='personal'||p.scopeId!==process.env.MYEVE_OWNER_ID||p.actorId!==p.scopeId)throw Error('CLOUD_CONTROLLER_OWNER');
 const [row]=await store.database.query('SELECT created_at FROM engineering_factory_commands WHERE id=$1 AND scope_id=$2 AND scope_kind=$3',[commandId,p.scopeId,p.scopeKind]);
 if(!row)throw Error('CLOUD_CONTROLLER_COMMAND');
 const deploymentId=process.env.VERCEL_DEPLOYMENT_ID??'';
 if(!/^dpl_[A-Za-z0-9]+$/.test(deploymentId))throw Error('CLOUD_CONTROLLER_DEPLOYMENT');
 const expiresAt=new Date(row.created_at).getTime()+600_000;
 if(expiresAt<=Date.now())throw Error('CLOUD_CONTROLLER_WINDOW_EXPIRED');
 await sendControllerWake({schemaVersion:1,commandId,deploymentId,expiresAt,tick:0});
}
