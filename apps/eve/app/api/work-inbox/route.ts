import { z } from 'zod';
import { authenticateWebPrincipal } from '../../../lib/web-auth.ts';
import { betaIntegration } from '../../../lib/beta-integration/runtime.ts';
import { readWorkInbox } from '../../../lib/product/work-inbox.ts';
export async function GET(request: Request) {
 const headers={'cache-control':'no-store'};
 const owner=await authenticateWebPrincipal(request,{...process.env,NODE_ENV:'production'});
 if(!owner)return Response.json({error:'Sign in to view Work.'},{status:401,headers});
 try {
  const offset=z.coerce.number().int().min(0).max(10000).parse(new URL(request.url).searchParams.get('offset')??0);
  const query=z.string().trim().max(120).parse(new URL(request.url).searchParams.get('q')??'');
  return Response.json(await readWorkInbox(betaIntegration(),owner.id,offset,query),{headers});
 }catch(error){return Response.json({error:'Work could not be refreshed.'},{status:error instanceof z.ZodError?400:503,headers});}
}
