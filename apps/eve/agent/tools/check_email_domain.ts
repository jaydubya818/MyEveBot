import { defineTool } from "eve/tools";
import { z } from "zod";
import { denyUnqualifiedExecutor } from "../lib/unqualified-executor.ts";

import { agentName } from "../lib/owner";
import { ownerOnly } from "../lib/owner-gate";

export default defineTool({
  approval: ownerOnly,
  description: `Where ${agentName()}'s custom email domain stands: verification status, which DNS records are still missing or wrong, and the current address. The moment the domain verifies, this switches the address onto it. Also the tool to reach for when a connected domain seems stuck - it re-kicks AgentMail's verification when that is what's needed.`,
  inputSchema: z.object({}),
  async execute(_input, gatewayContext) {
    return denyUnqualifiedExecutor(gatewayContext, "tool.check_email_domain");
  },
});
