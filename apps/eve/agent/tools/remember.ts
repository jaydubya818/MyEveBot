import { defineTool } from "eve/tools";
import { z } from "zod";
import { ownerName } from "../lib/owner";
import { denyUnqualifiedExecutor } from "../lib/unqualified-executor.ts";

export default defineTool({
  description: `Save one durable memory in an authorized owner, current Agent, current Goal, or current Task scope. Owner memory is not automatically shared with every Agent. Phrase it plainly, e.g. '${ownerName()} prefers metric units'. Never save secrets, passwords, tokens, payment details, or temporary run output.`,
  inputSchema: z.object({
    memory: z.string().min(1).max(4000).describe("The fact to remember, phrased plainly and entity-centric"),
    scope: z.enum(["owner", "agent", "goal", "task"]).default("owner")
      .describe("owner for broadly reusable personal context; agent for this Agent only; goal/task only for the current authorized execution"),
    scopeId: z.string().max(200).optional().describe("Required for goal or task scope. It must match the current execution."),
    permanent: z
      .boolean()
      .default(false)
      .describe("True for stable traits that rarely change (name, city, family, profession); false for recent or evolving context"),
  }),
  async execute({ memory, permanent, scope, scopeId }, ctx) {
    return denyUnqualifiedExecutor(ctx, "tool.remember");
  },
});
