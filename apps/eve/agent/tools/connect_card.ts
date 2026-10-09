import { defineTool } from "eve/tools";
import { denyUnqualifiedExecutor } from "../lib/unqualified-executor.ts";

import { EmptyToolInput,toolSchema } from "../lib/effect/tool-schema";
import { ownerOnly } from "../lib/owner-gate";

// No inputs on purpose: the code goes to the one env-pinned owner contact,
// never an address selected by the model.

export default defineTool({
  approval: ownerOnly,
  description:
    "Send a one-time Agentcard connection code to the owner's backend-configured email or phone. Use when Agentcard is not connected, or to reconnect after the grant expires. Follow up with verify_card_code once the owner reads the code back.",
  inputSchema: toolSchema(EmptyToolInput),
  async execute(_input, gatewayContext) {
    return denyUnqualifiedExecutor(gatewayContext, "tool.connect_card");
  },
});
