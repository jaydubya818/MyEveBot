import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";

import { createReminder, nextCronOccurrence } from "../lib/reminders-db.ts";

export default defineTool({
  description: "Create a named recurring routine from proven work. The routine stays within an explicit approval boundary and keeps its run history in Manage.",
  inputSchema: z.object({
    name: z.string().min(1).max(120), prompt: z.string().min(1).max(4000), cron: z.string().min(1).max(120), timezone: z.string().min(1).max(120),
    approvalBoundary: z.string().min(1).max(1000).describe("Actions the routine may perform without asking and the consequential actions that still require owner approval."),
    sourceOutcomeId: z.string().startsWith("outcome_").optional(),
  }),
  approval: always(),
  async execute(input) {
    const nextFireAt = nextCronOccurrence(input.cron, input.timezone);
    return createReminder({ prompt: input.prompt, cron: input.cron, timezone: input.timezone, nextFireAt, chatId: null, routineName: input.name, approvalBoundary: input.approvalBoundary, sourceOutcomeId: input.sourceOutcomeId });
  },
});
