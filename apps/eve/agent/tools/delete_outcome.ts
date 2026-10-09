import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { deleteOutcome } from "../../lib/outcomes.ts";
import { taskOwnerFromAuth } from "../../lib/task-runs.ts";

export default defineTool({
  description: "Permanently delete one owner-scoped result and revoke its evidence links. Use only when the owner explicitly asks to delete it.",
  inputSchema: z.object({ outcomeId: z.string().startsWith("outcome_") }),
  approval: always(),
  async execute({ outcomeId }, ctx) { await deleteOutcome(taskOwnerFromAuth(ctx.session.auth), outcomeId); return { deleted: true, outcomeId }; },
});
