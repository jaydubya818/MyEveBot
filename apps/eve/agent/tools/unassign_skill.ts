import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";

import { setSkillAssignment, skillOwnerId } from "../lib/skill-manager";
import { isSkillAgentId } from "../../lib/skill-manager-types";

export default defineTool({
  description:
    "Remove a skill from one QA specialist. Existing sessions keep their current context; new sessions use the updated assignment.",
  inputSchema: z.object({
    skillName: z.string().min(1).max(80).describe("Assigned skill name"),
    agentId: z.string().min(1).max(80).describe("QA specialist id shown by inspect_skills"),
  }),
  approval: always(),
  async execute({ skillName, agentId }, ctx) {
    if (!isSkillAgentId(agentId) || agentId === "sofie") {
      throw new Error("Choose one of the managed QA specialists shown by inspect_skills.");
    }
    await setSkillAssignment({
      ownerId: skillOwnerId(ctx.session.auth),
      agentId,
      skillName,
      enabled: false,
      assignedBy: "agent",
    });
    return { agentId, skillName, assigned: false, appliesTo: "new specialist sessions" };
  },
});
