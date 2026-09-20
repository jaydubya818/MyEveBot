import { after } from "next/server";
import { OwnerRunControl } from "../../../../lib/relay/owner/control.ts";
import { dispatchOwnerRun,reconcileOwnerRun,cancelOwnerRuntime } from "../../../../lib/relay/owner/worker.ts";
import { agentMailSendAdapter } from "../../../../agent/lib/email-send-adapter.ts";
import { ownerChannelConfiguration } from "../../../../lib/relay/owner/config.ts";
import { OwnerChannelHandoff,OwnerWorkNotAdmitted } from "../../../../lib/relay/owner/handoff.ts";
import { ownerRunSnapshot } from "../../../../lib/relay/owner/snapshot.ts";
export const runtime="nodejs";
export const maxDuration=90;
export async function POST(request:Request){
 const config=ownerChannelConfiguration();
 if(!config.enabled||!config.trust)return Response.json({code:"OWNER_EXECUTOR_NOT_QUALIFIED"},{status:503});
 // This release gate remains closed until runtime and live qualification pass.
 // No owner cookie or Federation assertion is accepted.
 if(!request.headers.get("content-type")?.startsWith("application/json"))return Response.json({code:"INVALID_INPUT"},{status:415});
 try{
  const reader=request.body?.getReader();if(!reader)throw new Error();let size=0;const chunks:Uint8Array[]=[];
  const deadline=Date.now()+2000;
  try{for(;;){let timer:ReturnType<typeof setTimeout>|undefined;const part=await Promise.race([reader.read(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{reject(new Error());void reader.cancel();},Math.max(1,deadline-Date.now()));})]).finally(()=>clearTimeout(timer));if(part.done)break;size+=part.value.length;if(size>32768){await reader.cancel();throw new Error();}chunks.push(part.value);}}finally{reader.releaseLock();}
  const accepted=await new OwnerChannelHandoff(config.trust).accept(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks))));
  if(accepted.command.operation==="start")after(()=>dispatchOwnerRun(accepted));
  if(accepted.command.operation==="status")await reconcileOwnerRun(accepted);
  if(["approval","recovery"].includes(accepted.command.operation))await new OwnerRunControl().apply(accepted,capability=>{
   if(capability!=="tool.send_email")throw new Error("Owner continuation adapter unavailable.");
   return agentMailSendAdapter();
  });
  if(accepted.command.operation==="cancel"){
   await new OwnerRunControl().cancel(accepted);
   after(()=>cancelOwnerRuntime(accepted.mapping.ownerId,accepted.runId,accepted.mapping.agentId));
  }
  return Response.json(await ownerRunSnapshot(accepted),{headers:{"cache-control":"no-store"}});
 }catch(error){if(error instanceof OwnerWorkNotAdmitted)return Response.json(error.proof,{status:409,headers:{"cache-control":"no-store"}});return Response.json({code:"OWNER_INGRESS_DENIED"},{status:403});}
}
