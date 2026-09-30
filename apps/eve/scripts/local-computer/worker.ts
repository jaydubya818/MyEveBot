import { readFile, realpath, mkdir, open } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { desktopStatus, executeLocalOperation } from "./operations.ts";
import { localResultSchema } from "../../lib/local-computer-contract.ts";

const directory=path.dirname(fileURLToPath(import.meta.url));
const configPath=process.env.SOFIE_LOCAL_CONFIG ?? path.join(directory,"../../.local-computer/config.json");
const config=JSON.parse(await readFile(configPath,"utf8")) as {appUrl:string;token:string;roots:string[];helper:string};
const origin=new URL(config.appUrl);
if(origin.protocol!=="https:" && !(origin.protocol==="http:" && ["localhost","127.0.0.1"].includes(origin.hostname)))throw new Error("The app URL must use HTTPS (or localhost for testing).");
if(origin.username || origin.password || config.token.length<32)throw new Error("Invalid local pairing configuration.");
const endpoint=new URL("/api/local-computer/worker",origin);
const roots=await Promise.all(config.roots.map(root=>realpath(root)));
const journal=path.join(path.dirname(configPath),"claims");
await mkdir(journal,{recursive:true,mode:0o700});
async function request(body:unknown){
  const response=await fetch(endpoint,{method:"POST",headers:{Authorization:`Bearer ${config.token}`,"Content-Type":"application/json"},
    body:JSON.stringify(body),redirect:"error",signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`App returned HTTP ${response.status}.`);
  return response.json();
}
console.log(`Sofie Local connecting to ${origin.origin}; shared folders: ${roots.join(", ")}`);
let stopped=false;
process.on("SIGTERM",()=>{stopped=true;});process.on("SIGINT",()=>{stopped=true;});
while(!stopped){
  try{
    const permissions=await desktopStatus(config.helper);
    const {job}=await request({operation:"poll",roots,permissions});
    if(job){
      if(typeof job.id!=="string" || typeof job.claim_id!=="string" || !Number.isFinite(Date.parse(job.expires_at)) || Date.parse(job.expires_at)<=Date.now()+25000)throw new Error("Invalid or expired job.");
      // Persist before execution. Even a server or process retry cannot repeat an operation.
      const marker=path.join(journal,createHash("sha256").update(job.id).digest("hex"));
      const file=await open(marker,"wx",0o600);
      await file.writeFile(JSON.stringify({id:job.id,at:new Date().toISOString()}));await file.sync();await file.close();
      let result;
      try{result=await executeLocalOperation(job.parameters,roots,config.helper);}
      catch(error){result={text:error instanceof Error?error.message:"Local operation failed.",isError:true};}
      result=localResultSchema.parse(result);
      // Retry delivery of the same result, never execution of the operation.
      for(let attempt=0;attempt<3;attempt++){
        try{const reply=await request({operation:"complete",jobId:job.id,claimId:job.claim_id,result});
          console.log(`Local job ${job.id}: ${reply.accepted ? (result.isError?"failed":"completed") : "result not accepted; inspect before retry"}`);break;
        }catch{if(attempt===2)console.error(`Local job ${job.id}: result delivery failed; will not repeat operation.`);}
      }
    }
  }catch(error){console.error(error instanceof Error?error.message:"Companion connection failed.");}
  if(!stopped)await new Promise(resolve=>setTimeout(resolve,3000));
}
