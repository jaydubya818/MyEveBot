import { defineTool } from "eve/tools";
import { z } from "zod";
import { getComputerSession, getComputerSessionForRuntime } from "../../lib/computer-sessions.ts";
import { computerAgent, computerOwnerId } from "../lib/computer-context.ts";
import { toolActionRequest } from "../lib/action-context.ts";
import { ActionGateway, consumeActionAuthority } from "../../lib/action-gateway.ts";
import { ComputerResourceStore, computerResourceEnvironment, resourceBinding } from "../../lib/computer-resource-store.ts";
import { retireUnusedComputerTemplate } from "../../lib/computer-resource-recovery.ts";

export default defineTool({
  description: "Stop the current Agent computer using its existing capability and exact-action policy. Unavailable during owner control.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const ownerId=computerOwnerId(ctx);
    const current=await getComputerSessionForRuntime(ownerId,ctx.session.id);
    const agent=await computerAgent(ctx);
    if (!current || !agent || current.agentId!==agent.id || current.control.controller!=="AGENT") throw new Error("Agent Computer Stop is unavailable.");
    const row=await new ComputerResourceStore().current(ownerId,current.id,computerResourceEnvironment());
    if (!row) throw new Error("Computer ownership is unverified.");
    const request=await toolActionRequest(ctx,{capabilityId:"computer.session.stop",actionClass:"delete",parameters:{lifecycleId:row.id,generation:row.generation}});
    request.computer={sessionId:current.id,controlVersion:current.control.version};
    const gateway=new ActionGateway();
    await gateway.execute(request,{
      resolveTarget:async()=>({provider:"vercel",account:ownerId,resource:row.resource_name,environment:row.environment}),
      async execute(parameters,authority) {
        await consumeActionAuthority(authority,parameters,"computer.session.stop");
        return gateway.terminateOwnedComputer({binding:resourceBinding(row),initiator:"agent",controlVersion:current.control.version,agentAuthority:authority,agentParameters:parameters});
      },
      verify:async result=>({verified:result.verified,receipt:{lifecycleId:result.lifecycleId}}),
    },ctx.abortSignal);
    await retireUnusedComputerTemplate(ownerId);
    const session=await getComputerSession(ownerId,current.id);
    if (!session) throw new Error("Computer session was removed after cleanup.");
    return {session,browserClosed:true};
  },
  toModelOutput(output) {return {type:"json",value:{id:output.session.id,status:output.session.status,browserClosed:output.browserClosed}};},
});
