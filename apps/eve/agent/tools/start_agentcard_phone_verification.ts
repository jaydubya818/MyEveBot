import { Schema } from "effect";
import { defineTool } from "eve/tools";
import { denyUnqualifiedExecutor } from "../lib/unqualified-executor.ts";

import { toolSchema } from "../lib/effect/tool-schema";
import { guestDenial } from "../lib/owner-gate";

const Input = Schema.Struct({
  phone_number: Schema.optionalKey(
    Schema.String.check(
      Schema.isPattern(/^\+[1-9]\d{7,14}$/),
      Schema.isMaxLength(16),
    ).annotate({
      description:
        "The owner's E.164 phone number, only when Agentcard has no phone on file. Omit to use the verified phone already on file.",
    }),
  ),
});

export default defineTool({
  approval: (context) => guestDenial(context) ?? "user-approval",
  description:
    "Send the connected owner a one-time phone verification code when card attachment reports phone_number is missing. The owner must provide the number; never invent one. Follow with verify_agentcard_phone when they read the code back.",
  inputSchema: toolSchema(Input),
  async execute({ phone_number }, gatewayContext) {
    return denyUnqualifiedExecutor(gatewayContext, "tool.start_agentcard_phone_verification");
  },
});
