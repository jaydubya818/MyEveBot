import { gateway, generateText } from "ai";
import { z } from "zod";
import { businessScopes } from "@/lib/business-runtime";
import { askBusinessSofie } from "@/lib/business-sofie";
import { requireSameOrigin, webPrincipal } from "@/lib/web-auth";
import { boundedJson } from "@/lib/relay/client";
const inputSchema=z.object({question:z.string().trim().min(1).max(4000),context:z.discriminatedUnion('scope',[
 z.object({scope:z.literal('BUSINESS_SHARED')}).strict(),z.object({scope:z.literal('WORK_SCOPED'),workOwner:z.string().min(1).max(255),workId:z.string().uuid()}).strict()
])}).strict();
export async function POST(request:Request){
 const headers={'cache-control':'no-store'};
 const owner=webPrincipal(request,{...process.env,NODE_ENV:'production'});
 if(!owner)return Response.json({error:'Sign in to continue.'},{status:401,headers});
 if(requireSameOrigin(request))return Response.json({error:'Same-origin request required.'},{status:403,headers});
 try{
  const input=inputSchema.parse(await boundedJson(new Response(request.body),8000));
  const scopes=businessScopes(owner.id);
  const partnership=await scopes.partnership();
  if(!partnership?.accepted_a||!partnership?.accepted_b)return Response.json({error:'Both partners must accept sharing first.'},{status:403,headers});
  const result=await askBusinessSofie(scopes,input.context,input.question,async prompt=>{
   const response=await generateText({model:gateway('anthropic/claude-sonnet-5'),...prompt,maxOutputTokens:800,maxRetries:0,abortSignal:AbortSignal.any([request.signal,AbortSignal.timeout(30000)])});
   return response.text;
  });
  return Response.json(result,{headers});
 }catch(e){return Response.json({error:e instanceof z.ZodError?'Review your question and Work selection.':'Sofie could not confirm current shared context. Refresh and try again.'},{status:503,headers});}
}
