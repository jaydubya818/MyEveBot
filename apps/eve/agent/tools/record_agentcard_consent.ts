import { defineTool } from "eve/tools";
import { denyUnqualifiedExecutor } from "../lib/unqualified-executor.ts";

import {
AGENTCARD_TERMS_VERSION
} from "../lib/effect/agentcard";
import { EmptyToolInput,toolSchema } from "../lib/effect/tool-schema";
import { guestDenial } from "../lib/owner-gate";

export default defineTool({
  approval: (context) => guestDenial(context) ?? "user-approval",
  description: `Record the connected owner's Agentcard consent when attach_own_card reports consent is missing. Approval authorizes Sofie to act through Agentcard, accepts the Agentcard/card-issuer terms (${AGENTCARD_TERMS_VERSION}), and acknowledges that Crossmint may process payments under its Privacy Policy: https://www.crossmint.com/legal/privacy-policy`,
  inputSchema: toolSchema(EmptyToolInput),
  async execute(_input, gatewayContext) {
    return denyUnqualifiedExecutor(gatewayContext, "tool.record_agentcard_consent");
  },
});
