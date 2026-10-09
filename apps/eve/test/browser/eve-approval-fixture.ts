import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
// Copied into only the isolated validation agent; no external effects.
export default defineTool({
  description: "Confirm the migration test probe.",
  inputSchema: z.object({}),
  approval: always(),
  execute: async () => ({ confirmed: true }),
});
