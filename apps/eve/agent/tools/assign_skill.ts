import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { denyUnqualifiedExecutor } from "../lib/unqualified-executor.ts";


export default defineTool({
  description:
    "Assign an available skill to one QA specialist. The specialist receives it in new delegated sessions.",
  inputSchema: z.object({
    skillName: z.string().min(1).max(80).describe("Available skill name"),
    agentId: z.string().min(1).max(80).describe("QA specialist id shown by inspect_skills"),
  }),
  approval: always(),
  async execute({ skillName, agentId }, ctx) {
    return denyUnqualifiedExecutor(ctx, "tool.assign_skill");
  },
});
