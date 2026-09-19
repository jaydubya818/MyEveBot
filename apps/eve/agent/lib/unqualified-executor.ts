import type { ToolContext,Approval } from "eve/tools";
import { ActionBlocked,ActionGateway } from "../../lib/action-gateway.ts";
import { toolActionRequest } from "./action-context.ts";

/** Explicit fail-closed disposition for operations without a concrete adapter. */
export async function denyUnqualifiedExecutor(ctx:ToolContext,capabilityId:string,parameters:Record<string,unknown>={}):Promise<never> {
  const request=await toolActionRequest(ctx,{capabilityId,actionClass:"execute",parameters});
  await new ActionGateway(undefined,{evaluate:async()=>({decision:"DENY",source:"executor-qualification",reason:"This write path has not yet been qualified for autonomous execution.",reasonCode:"unqualified_executor"})}).execute(request,{
    resolveTarget:async()=>({provider:"blocked",account:request.ownerId,resource:capabilityId}),
    execute:async()=>{throw new Error("Unreachable executor");},
    verify:async()=>({verified:false,receipt:{}}),
  });
  throw new ActionBlocked("denied","unqualified_executor");
}

export function denyUnqualifiedConnection(capabilityId:string):Approval {
  return async ctx=>{
    try {await denyUnqualifiedExecutor(ctx as unknown as ToolContext,capabilityId,{tool:ctx.toolName});}
    catch {/* Gateway writes the denial when authenticated run context exists. */}
    return {type:"denied",reason:"This operation has no qualified account/target adapter. It cannot execute through a connection-wide approval."};
  };
}
