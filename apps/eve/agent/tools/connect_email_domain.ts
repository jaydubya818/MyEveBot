import { defineTool } from "eve/tools";
import { z } from "zod";
import { denyUnqualifiedExecutor } from "../lib/unqualified-executor.ts";

import { agentName,ownerName } from "../lib/owner";
import { ownerOnly } from "../lib/owner-gate";

export default defineTool({
  approval: ownerOnly,
  description: `Put ${agentName()}'s email address on a custom domain ${ownerName()} owns (e.g. sofie@example.com instead of @agentmail.to). Registers the domain with AgentMail and returns the DNS records ${ownerName()} must add at his registrar. Nothing changes until the domain verifies: check_email_domain reports progress, and the address moves over automatically once it is verified. Requires a domain he actually controls, and a paid AgentMail plan.`,
  inputSchema: z.object({
    domain: z
      .string()
      .min(4)
      .max(253)
      .describe('The domain to connect, e.g. "example.com" (no scheme, no mailbox name).'),
  }),
  async execute({ domain }, gatewayContext) {
    return denyUnqualifiedExecutor(gatewayContext, "tool.connect_email_domain");
  },
});
