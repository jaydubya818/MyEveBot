import { defineTool } from "eve/tools";
import { z } from "zod";

import { memoryAccessForTool } from "../lib/memory-tool-context";
import { inspectOwnerKnowledge } from "../../lib/owner-knowledge";

export default defineTool({
  description: "Inspect one canonical Memory or Knowledge record, including its scope, source, provenance, status, and correction history. Private Memory outside this Agent's execution scope is never returned.",
  inputSchema: z.object({
    repository: z.enum(["memory", "knowledge"]),
    id: z.string().regex(/^(?:memory|knowledge)_[A-Za-z0-9_-]{1,240}$/),
  }),
  async execute({ repository, id }, ctx) {
    const executionScope = await memoryAccessForTool(ctx);
    return { item: await inspectOwnerKnowledge(executionScope.ownerId, repository, id, executionScope) };
  },
});
