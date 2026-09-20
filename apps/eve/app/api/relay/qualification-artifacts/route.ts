import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { qualificationEnabled, qualifyArtifact, qualifyIngress } from '@/lib/qualification/client';
import { artifactInsertSql } from '@/lib/qualification/artifact-storage';
import { FederationStore } from '@/lib/relay/store';
import { decryptSecret } from '@/lib/relay/transport';
export const runtime='nodejs';
export async function POST(request:Request){
 if(!qualificationEnabled())return new Response(null,{status:404});
 try {
  await qualifyIngress(request,/^\/api\/relay\/qualification-artifacts$/);
  const owner=process.env.FQ_OWNER_ID!;
  const store=new FederationStore(owner);
  const input=await request.json();
  if(input.action==='insert'){
   const v=z.tuple([z.string().max(255),z.literal(owner),z.string().max(255),z.string().max(100000),z.string().max(16384),z.string().max(4096),z.string().max(8192),z.string().datetime()]).parse(input.values);
   const content=decryptSecret<string>(owner,v[3]);
   await qualifyArtifact(owner,v[0],content);
   await store.database.query(artifactInsertSql+' ON CONFLICT(id) DO NOTHING',v);
   const [stored]=await store.database.query('SELECT * FROM myeve_relay_artifacts WHERE id=$1 AND owner_id=$2',[v[0],owner]);
   if(!stored||decryptSecret<string>(owner,stored.content_encrypted)!==content||stored.request_id!==v[2]||!isDeepStrictEqual(stored.metadata,JSON.parse(v[4]))||stored.audience!==v[5]||stored.audience_public_key!==v[6]||new Date(stored.expires_at).getTime()!==Date.parse(v[7])||stored.revoked)throw Error();
  }else if(input.action==='audience'){
   const v=z.object({action:z.literal('audience'),ownerId:z.literal(owner),id:z.string().max(255),audience:z.string().max(4096),key:z.string().max(8192)}).strict().parse(input);
   const [row]=await store.database.query('SELECT content_encrypted FROM myeve_relay_artifacts WHERE owner_id=$1 AND id=$2 AND NOT revoked AND expires_at>now()',[owner,v.id]);
   if(!row)throw Error();
   await qualifyArtifact(owner,v.id,decryptSecret<string>(owner,row.content_encrypted));
   await store.database.query('UPDATE myeve_relay_artifacts SET audience=$3,audience_public_key=$4 WHERE owner_id=$1 AND id=$2',[owner,v.id,v.audience,v.key]);
  }else throw Error();
  return Response.json({stored:true});
 }catch{return new Response(null,{status:403});}
}
