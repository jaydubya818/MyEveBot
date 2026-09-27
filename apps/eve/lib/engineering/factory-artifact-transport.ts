import { createHash } from "node:crypto";
import type { Graphql } from "../myfactory-protocol.mjs";
const sha = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");
const query = `query FactoryArtifactChunks($id: String!, $after: String) { issue(id:$id) { id comments(first:50,after:$after) { nodes { id body } pageInfo { hasNextPage endCursor } } } }`;
export interface FactoryArtifact { id: string; kind: "patch"|"log"; byteLength: number; sha256: string; bytes?: string; reference?: {version:1;transport:"linear-comments-v1";expiresAt:string} }
function chunkId(op: string, artifact: string, index: number) { const d=sha(JSON.stringify(["myfactory-artifact-chunk-v1",op,artifact,index])); return `${d.slice(0,8)}-${d.slice(8,12)}-4${d.slice(13,16)}-a${d.slice(17,20)}-${d.slice(20,32)}`; }
function decode(s: string) { const b=Buffer.from(s,"base64url"); if(b.toString("base64url")!==s) throw Error("FACTORY_ARTIFACT_ENCODING_INVALID"); return b; }
/** Signed manifest binds bytes; the scoped Linear credential grants retrieval. */
export async function retrieveFactoryArtifacts(input: {issueId:string;operationId:string;workOrderId:string;runId:string;attemptNumber:number;manifest:{workOrderId:string;runId:string;attemptNumber:number;artifacts:FactoryArtifact[]};graphql:Graphql;now?:number}):Promise<Map<string,Buffer>> {
 const m=input.manifest;
 if(m.workOrderId!==input.workOrderId||m.runId!==input.runId||m.attemptNumber!==input.attemptNumber||m.artifacts.length>21) throw Error("FACTORY_ARTIFACT_SCOPE_DENIED");
 if(m.artifacts.reduce((n,a)=>n+a.byteLength,0)>256000) throw Error("FACTORY_ARTIFACT_TOO_LARGE");
 const comments=new Map<string,string>();
 if(m.artifacts.some(a=>a.reference)){let after:string|null=null;for(let page=0;page<20;page++){
  let timer: ReturnType<typeof setTimeout> | undefined;
  let response: any;
  try { response=await Promise.race([input.graphql(query,{id:input.issueId,after}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error("FACTORY_ARTIFACT_TIMEOUT")),10000)})]); }
  finally { if(timer)clearTimeout(timer); }
  if(response.issue?.id!==input.issueId||!Array.isArray(response.issue.comments?.nodes)) throw Error("FACTORY_ARTIFACT_SCOPE_DENIED");
  for(const node of response.issue.comments.nodes){if(comments.has(node.id)&&comments.get(node.id)!==node.body)throw Error("FACTORY_ARTIFACT_CHUNK_CONFLICT");comments.set(node.id,node.body)}
  if(!response.issue.comments.pageInfo.hasNextPage)break;
  after=response.issue.comments.pageInfo.endCursor;if(!after||page===19)throw Error("FACTORY_ARTIFACT_PAGINATION_BOUND");
 }}
 const out=new Map<string,Buffer>();
 for(const a of m.artifacts){
  if(a.id!==`${a.kind}:${a.sha256}`||!/^[a-f0-9]{64}$/.test(a.sha256)||a.byteLength<0||a.byteLength>128000)throw Error("FACTORY_ARTIFACT_MANIFEST_INVALID");
  let bytes:Buffer;
  if(a.reference){
   if(a.reference.version!==1||a.reference.transport!=="linear-comments-v1"||Date.parse(a.reference.expiresAt)<=(input.now??Date.now())||a.bytes!==undefined)throw Error("FACTORY_ARTIFACT_REFERENCE_EXPIRED_OR_INVALID");
   const count=Math.max(1,Math.ceil(a.byteLength/8000)),parts:Buffer[]=[];
   for(let index=0;index<count;index++){
    const body=comments.get(chunkId(input.operationId,a.id,index));
    const match=body?.match(/^<!-- MYFACTORY_ARTIFACT_CHUNK_V1 -->\n([^\n]+)\n<!-- \/MYFACTORY_ARTIFACT_CHUNK_V1 -->$/);
    if(!match)throw Error("FACTORY_ARTIFACT_CHUNK_MISSING");
    const c=JSON.parse(match[1]);if(c.version!==1||c.operationId!==input.operationId||c.artifactId!==a.id||c.index!==index||c.count!==count||typeof c.bytes!=="string")throw Error("FACTORY_ARTIFACT_CHUNK_SCOPE_DENIED");
    const part=decode(c.bytes);if(part.length>8000)throw Error("FACTORY_ARTIFACT_CHUNK_TOO_LARGE");parts.push(part);
   }bytes=Buffer.concat(parts);
  }else if(typeof a.bytes==="string")bytes=decode(a.bytes);else throw Error("FACTORY_ARTIFACT_BYTES_MISSING");
  if(bytes.length!==a.byteLength||sha(bytes)!==a.sha256)throw Error("FACTORY_ARTIFACT_INTEGRITY_FAILED");out.set(a.id,bytes);
 }return out;
}
