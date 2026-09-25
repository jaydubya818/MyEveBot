import { defineTool } from "eve/tools";
import { ActionBlocked, ActionGateway } from "../../lib/action-gateway.ts";
import { toolActionRequest } from "../lib/action-context.ts";
import { ownerOnly } from "../lib/owner-gate.ts";
import { factoryInput, factoryAdapter } from "../lib/myfactory.ts";

export default defineTool({
  approval: ownerOnly, availableInSubagents: false, inputSchema: factoryInput,
  description: "When the owner requests MyFactory work, submit one signed WorkOrder request for the configured MyEve repository through Linear to the owner's local factory. Use a stable idempotencyKey for the request. This creates intake only; it cannot start coding, approve publication, merge, or deploy. Report awaiting_local_factory until get_factory_work_order returns a verified local receipt. A queued receipt means the WorkOrder arrived, not that coding finished. Use Foreman only when the owner specifically requests Foreman.",
  label: { start: () => "Send work to MyFactory" },
  async execute(input, ctx) {
    try {
      const action = await toolActionRequest(ctx, { capabilityId: "tool.create_factory_work_order", actionClass: "create", parameters: input });
      if (action.trigger.kind !== "owner_chat" || action.executor.kind !== "primary-agent") throw new ActionBlocked("denied", "factory_owner_chat_required");
      return await new ActionGateway().execute(action, factoryAdapter("create"), ctx.abortSignal);
    } catch (error) {
      return { status: error instanceof ActionBlocked ? error.status : "unavailable", message: "MyFactory handoff was not confirmed. Report this result; reuse the request key when checking, never invent a successful receipt." };
    }
  },
});
