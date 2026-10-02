import {webPrincipal} from '../../../../../lib/web-auth.ts';
import {betaIntegration} from '../../../../../lib/beta-integration/runtime.ts';
import {readAgentHome} from '../../../../../lib/product/agent-home.ts';
import {WorkError} from '../../../../../lib/engineering/types.ts';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
 const headers={'cache-control':'no-store'};
 const owner=webPrincipal(request,{...process.env,NODE_ENV:'production'});
 if(!owner)return Response.json({error:'Sign in to view this agent.'},{status:401,headers});
 try{return Response.json(await readAgentHome(betaIntegration(),owner.id,(await params).id),{headers});}
 catch(error){return Response.json({error:error instanceof WorkError&&error.status===404?'Agent not found.':'Agent activity could not be refreshed.'},{status:error instanceof WorkError?error.status:503,headers});}
}
