import { defineTool } from "eve/tools";
import { denyUnqualifiedExecutor } from "../lib/unqualified-executor.ts";

import { EmptyToolInput,toolSchema } from "../lib/effect/tool-schema";
import { ownerOnly } from "../lib/owner-gate";

export default defineTool({
  approval: ownerOnly,
  description:
    "Start the backend-only Agentcard attach flow for the connected owner. Returns the secure hosted card-entry link to send to the owner, or says the card is already attached. Never ask for or accept card details in chat. If prerequisites are missing, use the dedicated Agentcard consent or phone-verification tools, then retry.",
  inputSchema: toolSchema(EmptyToolInput),
  async execute(_input, gatewayContext) {
    return denyUnqualifiedExecutor(gatewayContext, "tool.attach_own_card");
  },
});
