import { z } from "zod";
import { engineeringPrincipal } from "./api.ts";
import { boundedJson } from "../relay/client.ts";
import { WorkError } from "./types.ts";
import { engineeringRuntime, intakeIssue } from "./runtime.ts";
import { ExecutionStore } from "./execution-store.ts";
import { WorkStore } from "./store.ts";
const commandSchema=z.discriminatedUnion("operation",[
  z.object({operation:z.literal("approve"),revision:z.number().int().positive(),candidate:z.string().regex(/^[a-f0-9]{40}$/),boundedUpdates:z.boolean()}).strict(),
  z.object({operation:z.literal("decline"),revision:z.number().int().positive(),candidate:z.string().regex(/^[a-f0-9]{40}$/)}).strict(),
  z.object({operation:z.literal("continue"),revision:z.number().int().positive()}).strict(),
  z.object({operation:z.literal("reconcile_custody"),revision:z.number().int().positive(),runId:z.string().uuid()}).strict(),
]);
export async function handleExecutionRequest(request:Request,id?:string) {
  const headers={"cache-control":"no-store"};
  try {
    const principal=engineeringPrincipal(request),value=await boundedJson(new Response(request.body),32000);
    if(!id)return Response.json(await intakeIssue(principal,value),{headers});
    z.string().uuid().parse(id);const input=commandSchema.parse(value);
    // Recording an owner's decision needs no GitHub credential; publication still revalidates at its own boundary.
    const state=input.operation==="approve"
      ? await new ExecutionStore(new WorkStore(principal)).approve(id,input.revision,input.candidate,input.boundedUpdates)
      : input.operation==="decline"
        ? await new ExecutionStore(new WorkStore(principal)).decline(id,input.revision,input.candidate)
        : input.operation==="continue"
          ? await (await engineeringRuntime(principal)).worker.continue(id,input.revision)
          : await (await engineeringRuntime(principal)).worker.reconcileCustody(id,input.revision,input.runId);
    return Response.json({execution:state},{headers});
  } catch(error) {
    if(error instanceof WorkError)return Response.json({error:error.message,code:error.code},{status:error.status,headers});
    if(error instanceof z.ZodError)return Response.json({error:"Check the current candidate, revision and required fields."},{status:400,headers});
    return Response.json({error:"Execution could not proceed. Reload durable Work state before retrying."},{status:503,headers});
  }
}
