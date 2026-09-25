import { defineTool } from "eve/tools";
import { z } from "zod";
import { getKnowledge } from "../../lib/knowledge.ts";
import { taskOwnerFromAuth } from "../../lib/task-runs.ts";

export default defineTool({
  description: "Inspect one structured Knowledge record, including its evidence, sources and earlier/newer version IDs. Follow version IDs with this tool to inspect history.",
  inputSchema: z.object({ id: z.string().min(1) }),
  async execute({ id }, ctx) {
    const record = await getKnowledge(taskOwnerFromAuth(ctx.session.auth), id);
    if (!record) throw new Error("Knowledge record not found.");
    return record;
  },
});
