import { Schema } from "effect";
import { defineTool } from "eve/tools";
import { denyUnqualifiedExecutor } from "../lib/unqualified-executor.ts";

import {
AGENTCARD_TERMS_VERSION
} from "../lib/effect/agentcard";
import { toolSchema } from "../lib/effect/tool-schema";
import { guestDenial } from "../lib/owner-gate";

const Input = Schema.Struct({
  code: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(12)).annotate({
    description: "The one-time code the owner read back from the connect email.",
  }),
});

export default defineTool({
  // The owner's approval is the explicit authorization recorded with
  // Agentcard after the code verifies. Guest turns remain denied in code.
  approval: (context) => guestDenial(context) ?? "user-approval",
  description:
    `Finish connecting the owner's Agentcard with the one-time code. Approval explicitly authorizes Sofie to access the account, accepts the applicable Agentcard and issuer terms (${AGENTCARD_TERMS_VERSION}), and acknowledges that Crossmint may process payments under its Privacy Policy: https://www.crossmint.com/legal/privacy-policy`,
  inputSchema: toolSchema(Input),
  async execute({ code }, gatewayContext) {
    return denyUnqualifiedExecutor(gatewayContext, "tool.verify_card_code");
  },
});
