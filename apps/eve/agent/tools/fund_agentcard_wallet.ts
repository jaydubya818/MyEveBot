import { Effect,Schema } from "effect";
import { defineTool } from "eve/tools";
import { denyUnqualifiedExecutor } from "../lib/unqualified-executor.ts";

import { toolSchema } from "../lib/effect/tool-schema";
import { ownerOnly } from "../lib/owner-gate";

const Input = Schema.Struct({
  amount_cents: Schema.Int.check(Schema.isGreaterThan(0)).annotate({
    description: "Exact wallet amount in USD cents, for example 2500 for $25.00.",
  }),
  payment_method: Schema.Literals(["apple_pay", "google_pay"]).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed("apple_pay" as const)),
  ),
});

export default defineTool({
  approval: ownerOnly,
  description:
    "Create a hosted Agentcard wallet-funding link as the fallback when card attachment is ineligible or unavailable. This does not charge by itself; send the returned URL to the owner, then create_card over Agentcard MCP after funding completes.",
  inputSchema: toolSchema(Input),
  async execute({ amount_cents, payment_method }, gatewayContext) {
    return denyUnqualifiedExecutor(gatewayContext, "tool.fund_agentcard_wallet");
  },
});
