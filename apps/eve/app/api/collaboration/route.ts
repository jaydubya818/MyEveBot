import {webPrincipal} from '../../../lib/web-auth.ts';
import {isPartnerPrincipal} from '../../../lib/private-owner-boundary.ts';
import {betaIntegration} from '../../../lib/beta-integration/runtime.ts';
import {readCollaboration} from '../../../lib/product/collaboration.ts';
export async function GET(request:Request){
 const headers={'cache-control':'no-store'};
 const owner=webPrincipal(request,{...process.env,NODE_ENV:'production'});
 if(!owner)return Response.json({error:'Sign in to view collaboration.'},{status:401,headers});
 if(isPartnerPrincipal(owner.id))return Response.json({error:'This Relay connection is private to its owner.'},{status:403,headers});
 try{return Response.json(await readCollaboration(betaIntegration(),owner.id),{headers});}
 catch{return Response.json({error:'Collaboration could not be refreshed.'},{status:503,headers});}
}
