import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { denyUnqualifiedExecutor } from "../lib/unqualified-executor.ts";


export default defineTool({
  description:
    "Remove a skill from one QA specialist. Existing sessions keep their current context; new sessions use the updated assignment.",
  inputSchema: z.object({
    skillName: z.string().min(1).max(80).describe("Assigned skill name"),
    agentId: z.string().min(1).max(80).describe("QA specialist id shown by inspect_skills"),
  }),
  approval: always(),
  async execute({ skillName, agentId }, ctx) {
    return denyUnqualifiedExecutor(ctx, "tool.unassign_skill");
  },
});
