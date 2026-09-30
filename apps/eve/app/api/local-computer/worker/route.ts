import { z } from "zod";
import { completeLocalJob, localWorkerAuthenticated, pollLocalDevice } from "../../../../lib/local-computer-store.ts";
import { localResultSchema } from "../../../../lib/local-computer-contract.ts";

export const runtime = "nodejs";
export const maxDuration = 30;
const inputSchema = z.discriminatedUnion("operation", [
  z.object({operation: z.literal("poll"), roots: z.array(z.string().max(4096)).max(30),
    permissions: z.object({accessibility:z.boolean(),screenRecording:z.boolean()}).strict()}).strict(),
  z.object({operation:z.literal("complete"),jobId:z.string().uuid(),claimId:z.string().uuid(),result:localResultSchema}).strict(),
]);
export async function POST(request: Request) {
  if (!localWorkerAuthenticated(request)) return Response.json({error:"unauthorized"},{status:401});
  // Bound the streamed request even when Content-Length is absent or false.
  const reader=request.body?.getReader();
  if (!reader) return Response.json({error:"invalid_body"},{status:400});
  let size=0; const chunks:Uint8Array[]=[];
  try {
    while(true) { const {done,value}=await reader.read(); if(done)break; size+=value.length;
      if(size>4000000){await reader.cancel();return Response.json({error:"body_too_large"},{status:413});} chunks.push(value); }
    const input=inputSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if(input.operation==="poll") return Response.json({job:await pollLocalDevice(input.roots,input.permissions)},{headers:{"Cache-Control":"no-store"}});
    return Response.json({accepted:await completeLocalJob(input.jobId,input.claimId,input.result)},{headers:{"Cache-Control":"no-store"}});
  } catch { return Response.json({error:"local_worker_request_failed"},{status:400}); }
}
