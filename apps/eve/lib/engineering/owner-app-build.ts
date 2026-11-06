import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {WorkStore} from './store.ts';
import type {Work} from './types.ts';
import type {FactoryCommand} from './factory-commands.ts';

// Model tool schemas must be one top-level object, so the two operations share it and a refinement keeps them exact.
export const ownerAppBuildSchema=z.object({operation:z.enum(['build','status']),title:z.string().trim().min(1).max(160).optional(),
 request:z.string().trim().min(1).max(3000).optional(),acceptance:z.array(z.string().trim().min(1).max(500)).min(1).max(8).optional(),
 workId:z.string().uuid().optional()}).strict().superRefine((value,ctx)=>{
 const build=value.operation==='build';
 if(build?!value.title||!value.request||!value.acceptance||value.workId!==undefined:!value.workId||value.title!==undefined||value.request!==undefined||value.acceptance!==undefined)
  ctx.addIssue({code:'custom',message:'build needs title, request and acceptance; status needs only workId.'});
});
export type OwnerAppBuildInput=z.infer<typeof ownerAppBuildSchema>;
export interface OwnerAppBuildRequest {operation:'build';title:string;request:string;acceptance:string[]}
export interface OwnerAppBuildProfile {repository:string;limits:{maxCostUsd:number;maxDurationSeconds:number};allowedPaths:string[];brief?:string}

/** Under the owner app switch every Work targets the bound repository inside the MyFactory LIVE envelope. */
export function bindOwnerAppWork<T extends {repository:string;maxCostUsd:number;maxDurationSeconds:number}>(create:T,profile:OwnerAppBuildProfile):T{
 return {...create,repository:profile.repository,maxCostUsd:Math.min(create.maxCostUsd,profile.limits.maxCostUsd),
  maxDurationSeconds:Math.min(create.maxDurationSeconds,profile.limits.maxDurationSeconds)};
}
/** A retried tool call converges on the same Work instead of creating a second paid build. */
export function buildIdempotencyKey(ownerId:string,callId:string):string{
 const h=createHash('sha256').update('myeve:owner-app-build:'+ownerId+':'+callId).digest('hex');
 return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-${((parseInt(h[16],16)&3)|8).toString(16)}${h.slice(17,20)}-${h.slice(20,32)}`;
}

/** Creates canonical Work bound to the owner's app repository and envelope, then asks MyFactory to start it.
 * No coding, checks, repair or spend happen here; `start` is the existing canonical Factory action. */
export async function startOwnerAppBuild(store:Pick<WorkStore,'principal'|'create'|'change'>,input:OwnerAppBuildRequest,
 profile:OwnerAppBuildProfile,callId:string,start:(store:never,id:string,input:FactoryCommand)=>Promise<unknown>){
 const objective=[input.request,'',...(profile.brief?[`Platform: ${profile.brief}`]:[]),`Editable files: ${profile.allowedPaths.join(', ')}.`].join('\n');
 const {work:created}=await store.create({title:input.title,objective,repository:profile.repository,
  criteria:input.acceptance.map(statement=>({id:randomUUID(),statement,method:'test'})),
  maxCostUsd:profile.limits.maxCostUsd,maxDurationSeconds:profile.limits.maxDurationSeconds,
  idempotencyKey:buildIdempotencyKey(store.principal.scopeId,callId)});
 const work:Work=created.control==='paused'?await store.change(created.id,{operation:'resume',expectedVersion:created.version}):created;
 const started=await start(store as never,work.id,{operation:'start',expectedWorkVersion:work.version,expectedWorkGeneration:work.generation});
 return {workId:work.id,started};
}
