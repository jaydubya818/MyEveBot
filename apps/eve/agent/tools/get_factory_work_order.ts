import { defineTool } from "eve/tools";
import { z } from "zod";
import { ActionGateway } from "../../lib/action-gateway.ts";
import { toolActionRequest } from "../lib/action-context.ts";
import { ownerOnly } from "../lib/owner-gate.ts";
import { factoryAdapter } from "../lib/myfactory.ts";

export default defineTool({
  approval: ownerOnly, availableInSubagents: false,
  inputSchema: z.object({ requestId: z.string().uuid() }).strict(),
  description: "Read a MyFactory handoff by request ID. Verify the local host's signed receipt and return its actual WorkOrder ID, state, and link. No receipt means awaiting local intake. Queued means received, not executed. This never creates a new request.",
  async execute(input, ctx) {
    const action = await toolActionRequest(ctx, { capabilityId: "tool.get_factory_work_order", actionClass: "read", parameters: input });
    return new ActionGateway().execute(action, factoryAdapter("read"), ctx.abortSignal);
  },
});
