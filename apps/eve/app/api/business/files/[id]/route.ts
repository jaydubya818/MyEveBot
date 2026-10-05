import { businessScopes } from "@/lib/business-runtime";
import { authenticateWebPrincipal } from "@/lib/web-auth";
import { runApp } from "@/agent/lib/effect/runtime";
import { openChatFile } from "@/agent/lib/effect/chat-files";
import { chatFileContentHeaders,chatFileContentSize } from "@/lib/files-api";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
 const principal=await authenticateWebPrincipal(request,{...process.env,NODE_ENV:'production'});
 if(!principal)return new Response('Sign in to continue.',{status:401});
 const url=new URL(request.url),owner=url.searchParams.get('owner'),workId=url.searchParams.get('workId'),workOwner=url.searchParams.get('workOwner');
 if(!owner)return new Response('Not found',{status:404});
 const scopes=businessScopes(principal.id),id=(await context.params).id;
 const active=workId&&workOwner?{scope:'WORK_SCOPED' as const,workId,workOwner}:{scope:'BUSINESS_SHARED' as const};
 try{
  const before=await scopes.read(active,{kind:'FILE',id,owner});
  const {file,blob}=await runApp(openChatFile(owner,id));
  const after=await scopes.read(active,{kind:'FILE',id,owner});
  if(before[0].revision_hash!==after[0].revision_hash)throw Error('File changed');
  return new Response(blob.stream,{headers:{...chatFileContentHeaders({contentType:blob.blob.contentType??file.mediaType,filename:file.filename,size:chatFileContentSize(blob.blob.size,file.sizeBytes),download:true}),'Cache-Control':'private, no-store'}});
 }catch{return new Response('This file is not available in this scope.',{status:404,headers:{'cache-control':'no-store'}});}
}
