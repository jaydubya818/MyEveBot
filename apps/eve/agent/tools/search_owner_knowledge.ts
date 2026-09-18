import { defineTool } from "eve/tools";
import { z } from "zod";

import { memoryAccessForTool } from "../lib/memory-tool-context";
import { OWNER_KNOWLEDGE_TYPES, searchOwnerKnowledge } from "../../lib/owner-knowledge";

export default defineTool({
  description: "Search the current owner's canonical Memory and Knowledge records while preserving type, scope, status, and provenance metadata. Private Memory outside this Agent's execution scope is never returned.",
  inputSchema: z.object({
    query: z.string().max(200).optional(),
    type: z.enum(OWNER_KNOWLEDGE_TYPES).optional(),
    status: z.string().max(40).optional(),
    source: z.string().max(80).optional(),
    goalId: z.string().max(250).optional(),
    review: z.enum(["needs_review", "contradictions", "stale", "recent", "corrected"]).optional(),
    page: z.number().int().min(1).max(20).default(1),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  async execute(input, ctx) {
    const executionScope = await memoryAccessForTool(ctx);
    return searchOwnerKnowledge(executionScope.ownerId, { ...input, executionScope });
  },
});
