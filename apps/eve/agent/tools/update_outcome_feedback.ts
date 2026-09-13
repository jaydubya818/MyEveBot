import { defineTool } from "eve/tools";
import { z } from "zod";

import { updateOutcomeFeedback } from "../../lib/outcomes.ts";
import { taskOwnerFromAuth } from "../../lib/task-runs.ts";

export default defineTool({
  description:
    "Update explicit owner feedback for an existing outcome. Call only after the owner directly states the feedback value.",
  inputSchema: z.object({
    outcomeId: z.string().startsWith("outcome_"),
    ownerFeedback: z.enum(["helpful", "neutral", "unhelpful", "unknown"]),
  }),
  async execute({ outcomeId, ownerFeedback }, ctx) {
    return updateOutcomeFeedback(
      taskOwnerFromAuth(ctx.session.auth),
      outcomeId,
      ownerFeedback,
    );
  },
});
