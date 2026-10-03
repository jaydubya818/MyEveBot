import {z} from 'zod';
import {factoryRequestHeaders} from './factory-request-headers.ts';
import {factoryTransport} from './factory-transport.ts';
import {boundedJson} from '../relay/client.ts';
import {webPrincipal} from '../web-auth.ts';

const installationSchema=z.object({version:z.literal(1),ownerScope:z.string().min(1).max(200),
 projectId:z.literal('prj_4hfceCN8l6wN1gUyYOzZLQ7aJapK'),sourceDigest:z.string().regex(/^[a-f0-9]{64}$/),origin:z.string().url()}).strict();
/** Production platform configuration is separate from an execution connection.
 * It has no source grant, model, writer or qualification that could admit Work. */
export function productionInstallation(env:Readonly<Record<string,string|undefined>>=process.env){
 if(env.VERCEL!=='1'||env.VERCEL_ENV!=='production'||env.VERCEL_PROJECT_ID!=='prj_L6faw25wnFGUZtrLKBIccg8gIDLR'||(env.VERCEL_TARGET_ENV&&env.VERCEL_TARGET_ENV!=='production'))throw Error('PRODUCTION_INSTALLATION_SCOPE');
 if(env.MYEVE_CLOUD_DETERMINISTIC_ENABLED||env.MYEVE_CLOUD_QUALIFICATION_CONFIG||env.FACTORY_STAGING_PROTECTION_BYPASS)throw Error('QUALIFICATION_CONFIGURATION_FORBIDDEN');
 const raw=env.MYEVE_CLOUD_PRODUCTION_INSTALLATION??'';
 if(raw.length>4000)throw Error('PRODUCTION_INSTALLATION_BOUND');
 const config=installationSchema.parse(JSON.parse(raw));
 if(config.ownerScope!==env.MYEVE_OWNER_ID||/qualification|synthetic|staging/i.test(config.ownerScope))throw Error('PRODUCTION_OWNER_SCOPE');
 const token=env.MYEVE_FACTORY_PRODUCTION_APPLICATION_TOKEN;
 if(!/^[a-f0-9]{64}$/.test(token??''))throw Error('PRODUCTION_APPLICATION_AUTHENTICATION');
 const connection={origin:config.origin,token:token!,projectId:config.projectId,transport:'CLOUD' as const,protocol:'MYFACTORY_EXECUTION_V2' as const};
 factoryTransport(connection);return {config,connection};
}
const readinessSchema=z.object({service:z.literal('myfactory'),environment:z.literal('production'),projectId:z.literal('prj_4hfceCN8l6wN1gUyYOzZLQ7aJapK'),sourceDigest:z.string(),alive:z.literal(true),platformReady:z.boolean(),ready:z.literal(false),executionAdmission:z.literal('DISABLED'),admission:z.literal('DISABLED'),dependencies:z.object({database:z.enum(['AVAILABLE','UNAVAILABLE']),artifacts:z.enum(['AVAILABLE','UNAVAILABLE']),provider:z.enum(['AVAILABLE','UNAVAILABLE'])}).strict(),executionQualification:z.literal('AWAITING_PRODUCTION_EXECUTION_CONTRACT'),publication:z.literal('DISABLED')}).strict();
export async function productionInstallationStatus(env:Readonly<Record<string,string|undefined>>=process.env,fetcher:typeof fetch=fetch,headers=factoryRequestHeaders){
 const {config,connection}=productionInstallation(env);
 const response=await fetcher(new URL('/api/readiness',connection.origin),{headers:await headers(connection),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(![200,503].includes(response.status))throw Error('PRODUCTION_FACTORY_AUTHENTICATION');
 const body=readinessSchema.parse(await boundedJson(response,8000));
 const available=Object.values(body.dependencies).every(value=>value==='AVAILABLE');
 if(body.sourceDigest!==config.sourceDigest||body.platformReady!==available||(response.status===200)!==available)throw Error('PRODUCTION_FACTORY_READINESS_BINDING');
 return {environment:'CLOUD',name:'MyFactory cloud',platform:available?'AVAILABLE':'UNAVAILABLE',execution:'AWAITING_QUALIFICATION_AND_AUTHORIZATION',admission:'DISABLED',publication:'DISABLED',dependencies:body.dependencies} as const;
}
export async function handleProductionInstallation(request:Request){
 const headers={'cache-control':'private, no-store'};
 const principal=webPrincipal(request,{...process.env,NODE_ENV:'production'});
 if(!principal)return Response.json({error:'Sign in to this workspace first.'},{status:401,headers});
 if(principal.id!==process.env.MYEVE_OWNER_ID)return Response.json({error:'This connection is private to its owner.'},{status:403,headers});
 try{return Response.json(await productionInstallationStatus(),{headers});}
 catch{return Response.json({environment:'CLOUD',platform:'UNAVAILABLE',admission:'DISABLED',error:'Cloud installation is not ready. No Work has been dispatched.'},{status:503,headers});}
}
