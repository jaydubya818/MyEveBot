import {cloudRuntimeEnabled} from '@/lib/engineering/cloud-runtime-guard';
import {controllerQueue,sendControllerWake} from '@/lib/engineering/cloud-controller-queue';
import {consumeControllerDelivery} from '@/lib/engineering/cloud-controller-delivery';
import {runCloudController} from '@/lib/engineering/cloud-controller';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request){
 if(!cloudRuntimeEnabled())return new Response(null,{status:404});
 return controllerQueue().handleCallback((payload,metadata)=>consumeControllerDelivery(payload,metadata,process.env.VERCEL_DEPLOYMENT_ID??'',{
  now:Date.now,send:message=>sendControllerWake(message,10),run:runCloudController,
 }),{visibilityTimeoutSeconds:60,retry:()=>({afterSeconds:15})})(request);
}
