import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";

import {
  getSkillEvalSummaries,
  skillOwnerId,
} from "../lib/skill-manager";
import {
  changedInstalledSkillNames,
  localSkillEvalTarget,
  startSkillEvalRun,
} from "../../lib/skill-eval-runner";

export default defineTool({
  description:
    "Start real routing evals for changed or explicitly named project skills and return the durable run record.",
  inputSchema: z.object({
    mode: z.enum(["changed", "manual"]),
    skillNames: z.array(z.string().min(1).max(80)).max(62).optional(),
  }),
  approval: always(),
  async execute({ mode, skillNames = [] }, ctx) {
    const ownerId = skillOwnerId(ctx.session.auth);
    const selected =
      mode === "changed"
        ? changedInstalledSkillNames(await getSkillEvalSummaries(ownerId))
        : skillNames;
    if (selected.length === 0) {
      return { started: false, reason: "No changed project skills need evaluation." };
    }

    const result = await startSkillEvalRun({
      ownerId,
      mode,
      skillNames: selected,
      targetUrl: localSkillEvalTarget(),
    });
    void result.completion;
    return { started: true, run: result.run };
  },
});
