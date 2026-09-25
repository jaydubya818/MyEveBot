import { createServer } from "node:http";
import { gateway } from "ai";
import { engineeringConfig,engineeringRuntime } from "../lib/engineering/runtime.ts";
import { brokerMessage } from "../lib/engineering/model-broker.ts";
import { WorkStore } from "../lib/engineering/store.ts";
import { createRequire } from "node:module";

// This host process is deliberately local/dogfood only. Never borrow DATABASE_URL.
const url=new URL(process.env.MYEVE_ENGINEERING_DATABASE_URL??"invalid:");
if(process.env.MYEVE_ENGINEERING_MODE!=="dogfood"||process.env.VERCEL_ENV==="production"||
  url.hostname!=="127.0.0.1"||url.port!=="55468"||!/^\/golden_[a-z0-9_]+$/.test(url.pathname))
  throw new Error("Engineering worker requires its explicit isolated loopback PostgreSQL database.");
const {Pool}=createRequire(import.meta.url)("pg") as {Pool:new(options:{connectionString:string})=>{query:(q:string,p?:unknown[])=>Promise<{rows:Record<string,any>[]}>,end:()=>Promise<void>}};
const pool=new Pool({connectionString:url.href}),config=await engineeringConfig();
const principal={scopeId:config.ownerId,actorId:config.ownerId,scopeKind:"personal" as const};
const store=new WorkStore(principal,{query:async(q,p)=>(await pool.query(q,p)).rows});
const catalog=await gateway.getAvailableModels(),pricing=catalog.models.find(m=>m.id===`anthropic/${config.model}`)?.pricing;
if(!pricing)throw new Error("Current exact-model pricing is unavailable.");
const maxInputRate=Math.max(...[pricing.input,pricing.cachedInputTokens??pricing.input,pricing.cacheCreationInputTokens??pricing.input].map(Number)),outputRate=Number(pricing.output);
const credential=process.env.AI_GATEWAY_API_KEY??process.env.VERCEL_OIDC_TOKEN;
if(!credential)throw new Error("A model gateway credential is required only in this trusted worker.");
let stopping=false;
const server=createServer(async(request,response)=>{
  try {
    const path=/^\/broker\/([a-f0-9-]{36})\/([a-f0-9-]{36})$/.exec(request.url??"");
    if(request.method!=="POST"||!path||stopping){response.writeHead(403).end();return;}
    let body="";for await(const chunk of request){body+=chunk;if(Buffer.byteLength(body)>180000)throw new Error("Input exceeds model bound.");}
    const runtime=await engineeringRuntime(principal,store);
    if(!await runtime.authorityCurrent())throw new Error("Coordinating Agent authority revoked.");
    const result=await brokerMessage({store:runtime.execution,workId:path[1],attemptId:path[2],token:String(request.headers.authorization??"").replace(/^Bearer /,""),
      secret:process.env.MYEVE_ENGINEERING_BROKER_SECRET??"",body,model:config.model,maxInputRate,outputRate,
      upstream:payload=>fetch("https://ai-gateway.vercel.sh/v1/messages",{method:"POST",redirect:"error",signal:AbortSignal.timeout(90000),
        headers:{authorization:`Bearer ${credential}`,"content-type":"application/json","anthropic-version":"2023-06-01"},body:payload})});
    response.writeHead(result.status,{"content-type":result.headers.get("content-type")??"application/json"});response.end(Buffer.from(await result.arrayBuffer()));
  }catch {response.writeHead(403,{"content-type":"application/json"}).end(JSON.stringify({type:"error",error:{type:"permission_error",message:"Model allowance or current attempt authority unavailable."}}));}
});
server.listen(config.brokerPort,"0.0.0.0",()=>console.log("Golden Work worker and bounded model broker started; isolated dogfood only."));
async function stop(){stopping=true;server.close();}
process.on("SIGTERM",()=>void stop());process.on("SIGINT",()=>void stop());
while(!stopping) {
  for(const work of await store.list()) {
    try {const runtime=await engineeringRuntime(principal,store);if(await runtime.execution.get(work.id))await runtime.worker.tick(work.id);}
    catch(error){console.error("Golden Work tick unavailable",work.id,error instanceof Error?error.name:"Error");}
  }
  await new Promise(resolve=>setTimeout(resolve,2000));
}
await pool.end();
