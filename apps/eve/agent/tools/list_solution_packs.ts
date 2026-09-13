import { defineTool } from "eve/tools";
import { z } from "zod";

import { BUILTIN_SOLUTION_PACK_CATALOG } from "../../lib/builtin-solution-packs.ts";

export default defineTool({
  description: "List curated Solution Packs that compose existing Role Packs and platform primitives for a concrete outcome. Recommendations never grant capabilities or create persistent Agents.",
  inputSchema: z.object({
    solutionPackId: z.string().min(1).max(100).optional(),
  }),
  execute({ solutionPackId }) {
    return {
      packs: BUILTIN_SOLUTION_PACK_CATALOG.packs.filter((pack) => !solutionPackId || pack.id === solutionPackId),
      authorityNotice: "Solution Pack recommendations do not grant capabilities, create persistent Agents, or authorize execution.",
    };
  },
});
