import { defineEval } from "eve/evals";

import { installedSkills } from "../../lib/installed-skills";
import { SKILL_EVAL_MESSAGE_PREFIX } from "../../lib/skill-manager-types";

export default installedSkills.map((skill) =>
  defineEval({
    description:
      skill.routingPrompts.length > 0
        ? `Sofie routes ${skill.routingPrompts.length} natural-language cases to the ${skill.name} skill.`
        : `Sofie can discover and load the ${skill.name} skill.`,
    tags: ["skills", "routing"],
    metadata: {
      skill: skill.name,
      contentHash: skill.contentHash,
      sourcePath: skill.sourcePath,
    },
    async test(t) {
      const prompts =
        skill.routingPrompts.length > 0
          ? skill.routingPrompts
          : [`Load your "${skill.name}" skill. Briefly state when it applies.`];
      for (const [index, prompt] of prompts.entries()) {
        const session = index === 0 ? t : t.newSession();
        await session.send(
          `${SKILL_EVAL_MESSAGE_PREFIX} This is a routing-only check. Identify and load the single best project skill for the following user request, then briefly state the workflow without performing it: ${prompt}`,
        );
        session.succeeded();
        session.loadedSkill(skill.name, { count: 1 });
        session.maxToolCalls(1);
        session.noFailedActions();
      }
    },
  }),
);
