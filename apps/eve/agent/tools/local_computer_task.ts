import { defineDynamic, defineTool } from "eve/tools";
import { localReadOperation, localResultSchema, localTaskSchema, localTaskInputSchema } from "../../lib/local-computer-contract.ts";
import { localPairing } from "../../lib/local-computer-store.ts";
import { executeLocalTool, prepareLocalApproval, resolveLocalApprovals } from "../lib/local-computer-tool.ts";
import { isGuestResolve } from "../lib/owner-gate.ts";

export default defineDynamic({events:{
  "step.started":async(_event,ctx)=>{
    if(isGuestResolve(ctx) || !localPairing())return null;
    const approved=await resolveLocalApprovals(ctx);
    return defineTool({
      description:"Operate the owner's paired Mac. Start with status, then roots/list_files/find_files/read_text for local file discovery and reading. Every shell command, file write, screenshot, click, type, key, or scroll creates an exact-action approval in chat before execution. Submit the concrete operation to show that approval; do not repeatedly ask for permission in prose. Never use sandbox read_file for Mac paths. For queued/running jobs call status with job_id set to the returned jobId; never resubmit a change. Completed means the operation returned; inspect output/screenshot to verify the requested outcome. Unknown means execution may have happened: inspect before any retry. Each GUI action needs its own approval; broad task consent is not a blanket grant.",
      inputSchema:localTaskInputSchema,
      approval:approvalCtx=>approved.includes(approvalCtx.callId)?"approved":prepareLocalApproval(approvalCtx),
      async execute(value,toolCtx){
        const input=localTaskSchema.parse(value);
        if(!localReadOperation(input) && !approved.includes(toolCtx.callId))return {status:"denied",message:"This exact action has no valid approval continuation. Nothing was queued."};
        return executeLocalTool(input,toolCtx);
      },
      toModelOutput(output){
        const result="result" in output?localResultSchema.safeParse(output.result):null;
        if(result?.success && result.data.image)return {type:"content",value:[
          {type:"text",text:JSON.stringify({...output,result:{...result.data,image:undefined}})},
          {type:"file",data:{type:"data",data:result.data.image},mediaType:"image/png"},
        ]};
        return {type:"json",value:output};
      },
    });
  },
}});
