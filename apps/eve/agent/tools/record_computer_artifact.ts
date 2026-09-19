import { denyUnqualifiedExecutor } from "../lib/unqualified-executor.ts";

import { defineTool } from "eve/tools";
import { z } from "zod";


const TEXT_CONTENT = /^(?:text\/|application\/(?:json|xml))/i;

export default defineTool({
  description: "Persist a meaningful screenshot, download, report, log, or file from the current computer session as private evidence. Do not upload secrets, credentials, cookies, or hidden chain-of-thought.",
  inputSchema: z.object({
    path: z.string().min(1),
    kind: z.enum(["screenshot", "download", "report", "file", "log", "json"]),
    contentType: z.string().min(1).max(160),
    actionId: z.string().startsWith("computer_action_").optional(),
  }),
  async execute(input, ctx) {
    return denyUnqualifiedExecutor(ctx, "tool.record_computer_artifact");
  },
});
