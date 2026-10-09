import { defineTool } from "eve/tools";
import { z } from "zod";

import {
  getSkillEvalSummaries,
  getSkillUsageSummaries,
  latestSkillEvalRun,
  listSkillAssignments,
  skillOwnerId,
} from "../lib/skill-manager";
import { skillStore } from "../lib/skill-store";
import { installedSkills } from "../../lib/installed-skills";
import { personalSkillContentHash } from "../../lib/skill-content-hash";
import { skillEvalExecutionAvailable } from "../../lib/skill-eval-runner";
import { SKILL_AGENTS } from "../../lib/skill-manager-types";

export default defineTool({
  description:
    "Inspect available skills, their real agent assignments, observed use, and latest routing eval results.",
  inputSchema: z.object({
    query: z.string().max(120).optional().describe("Optional skill name or description filter"),
  }),
  async execute({ query }, ctx) {
    const ownerId = skillOwnerId(ctx.session.auth);
    let saved: Awaited<ReturnType<typeof skillStore.list>> = [];
    try {
      saved = await skillStore.list();
    } catch {
      // Project skills remain inspectable when personal-skill storage is offline.
    }
    const needle = query?.trim().toLocaleLowerCase() ?? "";
    const skills = [
      ...installedSkills.map((skill) => ({ ...skill, source: "project" as const })),
      ...saved.map((skill) => ({
        name: skill.name,
        description: skill.description,
        source: "personal" as const,
        userInvocable: true,
        contentHash: personalSkillContentHash(skill),
      })),
    ].filter(
      (skill) =>
        needle.length === 0 ||
        skill.name.toLocaleLowerCase().includes(needle) ||
        skill.description.toLocaleLowerCase().includes(needle),
    );
    const names = skills.map((skill) => skill.name);
    const [assignments, usage, evals, evalRun] = await Promise.all([
      listSkillAssignments(ownerId, names),
      getSkillUsageSummaries(ownerId),
      getSkillEvalSummaries(ownerId),
      latestSkillEvalRun(ownerId),
    ]);
    return {
      agents: SKILL_AGENTS,
      skills,
      assignments,
      usage,
      evals,
      evalRun,
      evalExecutionStatus: skillEvalExecutionAvailable() ? "ready" : "ci_only",
    };
  },
});
