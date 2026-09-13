import { defineEval } from "eve/evals";

import { installedSkills } from "../../lib/installed-skills";
import { SKILL_EVAL_MESSAGE_PREFIX } from "../../lib/skill-manager-types";

export default installedSkills.map((skill) =>
  defineEval({
    description: `Sofie can discover and load the ${skill.name} skill.`,
    tags: ["skills", "routing"],
    metadata: {
      skill: skill.name,
      contentHash: skill.contentHash,
      sourcePath: skill.sourcePath,
    },
    async test(t) {
      await t.send(
        `${SKILL_EVAL_MESSAGE_PREFIX} Load your "${skill.name}" skill. Briefly state when it applies, but do not perform its workflow.`,
      );
      t.succeeded();
      t.loadedSkill(skill.name);
      t.noFailedActions();
    },
  }),
);
