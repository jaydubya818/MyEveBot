import { authenticateWebPrincipal,requireSameOrigin } from "../../../../lib/web-auth.ts";
import { betaIntegration } from "../../../../lib/beta-integration/runtime.ts";
import { OwnerPublication } from "../../../../lib/engineering/owner-publication.ts";
import { boundedJson } from "../../../../lib/relay/client.ts";
import { WorkError } from "../../../../lib/engineering/types.ts";
import { z } from "zod";
async function handle(request:Request){
 const headers={"cache-control":"no-store"};
 try{
  const owner=await authenticateWebPrincipal(request,{...process.env,NODE_ENV:'production'});
  if(!owner)return Response.json({error:'Sign in to continue.'},{status:401,headers});
  if(requireSameOrigin(request))return Response.json({error:'Same-origin request required.'},{status:403,headers});
  const service=new OwnerPublication(betaIntegration());
  if(request.method==='GET'){
   const id=z.uuid().parse(new URL(request.url).searchParams.get('workId'));
   return Response.json(await service.view(owner.id,id),{headers});
  }
  return Response.json({decision:await service.decide(owner.id,await boundedJson(new Response(request.body),16000))},{headers});
 }catch(e){return Response.json({error:e instanceof WorkError?e.message:'Owner decision unavailable; reload the retained Result.'},{status:e instanceof WorkError?e.status:409,headers});}
}
export const GET=handle;export const POST=handle;
