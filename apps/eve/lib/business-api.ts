import { z } from "zod";
import { BusinessScopes, ScopeDenied, resourceKind } from "./business-scopes.ts";
import { configuredOwnerIds, requireSameOrigin, authenticateWebPrincipal } from "./web-auth.ts";
import { boundedJson } from "./relay/client.ts";
const contextSchema=z.discriminatedUnion('scope',[
 z.object({scope:z.literal('BUSINESS_SHARED')}).strict(),
 z.object({scope:z.literal('WORK_SCOPED'),workOwner:z.string().min(1).max(255),workId:z.string().uuid()}).strict()
]);
export function businessApi(deps:{ scopes:(actor:string)=>BusinessScopes; env?:NodeJS.ProcessEnv }) {
 return async (request:Request) => {
  const headers={'cache-control':'no-store'};
  const send=(body:unknown,status=200)=>Response.json(body,{status,headers});
  const env=deps.env??process.env;
  const principal=await authenticateWebPrincipal(request,{...env,NODE_ENV:'production'});
  if(!principal)return send({error:'Sign in to continue.'},401);
  if(requireSameOrigin(request))return send({error:'Same-origin request required.'},403);
  const service=deps.scopes(principal.id);
  try {
   if(request.method==='GET') {
    const url=new URL(request.url);
    const context=contextSchema.parse(url.searchParams.get('workId')?{scope:'WORK_SCOPED',workOwner:url.searchParams.get('workOwner'),workId:url.searchParams.get('workId')}:{scope:'BUSINESS_SHARED'});
    return send({owner:principal.id,configured:configuredOwnerIds(env).length===2,partnership:await service.partnership(),private:await service.privateResources(),shared:await service.read(context),grants:await service.grants(),decisions:await service.decisions()});
   }
   const input=z.object({operation:z.enum(['accept','leave','share','revoke','request_decision','decide','context']),value:z.unknown().optional()}).strict().parse(await boundedJson(new Response(request.body),16000));
   if(input.operation==='accept') {
    const owners=configuredOwnerIds(env);if(owners.length!==2)throw new ScopeDenied();
    return send({partnership:await service.accept(owners[0],owners[1])});
   }
   if(input.operation==='leave'){await service.leave();return send({ok:true});}
   if(input.operation==='share')return send({grant:await service.share(input.value)},201);
   if(input.operation==='revoke'){await service.revoke(z.string().uuid().parse(input.value));return send({ok:true});}
   if(input.operation==='context')return send(await service.context(contextSchema.parse(input.value)));
   if(input.operation==='request_decision')return send({decision:await service.requestDecision(input.value)},201);
   const value=z.object({id:z.string().uuid(),effectHash:z.string().regex(/^[a-f0-9]{64}$/),approve:z.boolean()}).strict().parse(input.value);
   return send(await service.decide(value.id,value.effectHash,value.approve));
  }catch(e){return send({error:e instanceof ScopeDenied?e.message:e instanceof z.ZodError?'Review the selected scope and fields.':'The saved scope could not be confirmed. Refresh and try again.'},e instanceof ScopeDenied?403:e instanceof z.ZodError?400:503);}
 };
}
