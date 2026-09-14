import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";

import { setSkillAssignment, skillOwnerId } from "../lib/skill-manager";
import { skillStore } from "../lib/skill-store";
import { installedSkills } from "../../lib/installed-skills";
import { isSkillAgentId } from "../../lib/skill-manager-types";

export default defineTool({
  description:
    "Assign an available skill to one QA specialist. The specialist receives it in new delegated sessions.",
  inputSchema: z.object({
    skillName: z.string().min(1).max(80).describe("Available skill name"),
    agentId: z.string().min(1).max(80).describe("QA specialist id shown by inspect_skills"),
  }),
  approval: always(),
  async execute({ skillName, agentId }, ctx) {
    if (!isSkillAgentId(agentId) || agentId === "sofie") {
      throw new Error("Choose one of the managed QA specialists shown by inspect_skills.");
    }
    let exists = installedSkills.some((skill) => skill.name === skillName);
    if (!exists) {
      try {
        exists = (await skillStore.list()).some((skill) => skill.name === skillName);
      } catch {
        // The validation error below is accurate when personal storage is unavailable.
      }
    }
    if (!exists) throw new Error(`Skill '${skillName}' is not available.`);
    await setSkillAssignment({
      ownerId: skillOwnerId(ctx.session.auth),
      agentId,
      skillName,
      enabled: true,
      assignedBy: "agent",
    });
    return { agentId, skillName, assigned: true, appliesTo: "new specialist sessions" };
  },
});
