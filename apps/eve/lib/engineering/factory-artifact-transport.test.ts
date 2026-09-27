import {createHash,randomUUID} from "node:crypto";
import {describe,expect,it} from "vitest";
import {retrieveFactoryArtifacts} from "./factory-artifact-transport.ts";
const sha=(s:string|Buffer)=>createHash("sha256").update(s).digest("hex");
const op=sha("operation"),issue=randomUUID(),workOrderId=randomUUID(),runId=randomUUID();
const bytes=Buffer.alloc(20000,7),id=`log:${sha(bytes)}`;
const reference={version:1 as const,transport:"linear-comments-v1" as const,expiresAt:new Date(Date.now()+60000).toISOString()};
const item={id,kind:"log" as const,byteLength:bytes.length,sha256:sha(bytes),reference};
const chunks=Array.from({length:3},(_,index)=>{const d=sha(JSON.stringify(["myfactory-artifact-chunk-v1",op,id,index]));return {id:`${d.slice(0,8)}-${d.slice(8,12)}-4${d.slice(13,16)}-a${d.slice(17,20)}-${d.slice(20,32)}`,body:`<!-- MYFACTORY_ARTIFACT_CHUNK_V1 -->\n${JSON.stringify({version:1,operationId:op,artifactId:id,index,count:3,bytes:bytes.subarray(index*8000,(index+1)*8000).toString("base64url")})}\n<!-- /MYFACTORY_ARTIFACT_CHUNK_V1 -->`}});
const input={issueId:issue,operationId:op,workOrderId,runId,attemptNumber:1,manifest:{workOrderId,runId,attemptNumber:1,artifacts:[item]},graphql:async()=>({issue:{id:issue,comments:{nodes:chunks,pageInfo:{hasNextPage:false,endCursor:null}}}})};
describe("hosted artifact transport",()=>{
 it("retrieves and checks a bounded 20 KB signed reference",async()=>{expect((await retrieveFactoryArtifacts(input)).get(id)).toEqual(bytes)});
 it("denies missing, expired, and cross-Work data",async()=>{
  await expect(retrieveFactoryArtifacts({...input,manifest:{...input.manifest,workOrderId:randomUUID()}})).rejects.toThrow("SCOPE_DENIED");
  await expect(retrieveFactoryArtifacts({...input,manifest:{...input.manifest,artifacts:[{...item,reference:{...reference,expiresAt:"2020-01-01T00:00:00Z"}}]}})).rejects.toThrow("EXPIRED");
  await expect(retrieveFactoryArtifacts({...input,graphql:async()=>({issue:{id:issue,comments:{nodes:chunks.slice(1),pageInfo:{hasNextPage:false,endCursor:null}}}})})).rejects.toThrow("MISSING");
 });
});
