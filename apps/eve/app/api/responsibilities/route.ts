import {webPrincipal} from '../../../lib/web-auth.ts';
import {betaIntegration} from '../../../lib/beta-integration/runtime.ts';
import {readResponsibilities} from '../../../lib/product/responsibilities.ts';
export async function GET(request:Request){
 const headers={'cache-control':'no-store'};
 const owner=webPrincipal(request,{...process.env,NODE_ENV:'production'});
 if(!owner)return Response.json({error:'Sign in to view responsibilities.'},{status:401,headers});
 try{return Response.json(await readResponsibilities(betaIntegration(),owner.id),{headers});}
 catch{return Response.json({error:'Responsibilities could not be refreshed.'},{status:503,headers});}
}
