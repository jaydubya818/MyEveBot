import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { denyUnqualifiedExecutor } from "../lib/unqualified-executor.ts";

export default defineTool({
  description:
    "Delete one long-term memory by its id. Use when the user asks you to forget something or a saved fact is no longer true. Find the id with search_memory or list_memories first.",
  inputSchema: z.object({
    memoryId: z.string().min(1).describe("The id of the memory to delete, from search_memory or list_memories"),
  }),
  approval: always(),
  async execute({ memoryId }, ctx) {
    return denyUnqualifiedExecutor(ctx, "tool.forget");
  },
});
