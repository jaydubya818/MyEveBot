import { defineTool } from "eve/tools";
import { z } from "zod";
import { denyUnqualifiedExecutor } from "../lib/unqualified-executor.ts";

import { agentName,ownerName } from "../lib/owner";
import { ownerOnly } from "../lib/owner-gate";

export default defineTool({
  approval: ownerOnly,
  description: `Disconnect ${agentName()}'s custom email domain: the domain is removed from AgentMail and the address goes back to agentmail.to. Mail already received on the custom address stays stored but stops being the active inbox, and new mail sent to that address will bounce once its DNS records are removed. Confirm with ${ownerName()} before calling this.`,
  inputSchema: z.object({}),
  async execute(_input, gatewayContext) {
    return denyUnqualifiedExecutor(gatewayContext, "tool.remove_email_domain");
  },
});
