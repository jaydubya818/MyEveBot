import { defineTool } from "eve/tools";
import { z } from "zod";

import { BUILTIN_SOLUTION_PACK_CATALOG } from "../../lib/builtin-solution-packs.ts";

export default defineTool({
  description: "List built-in Solution Packs and inspect their domains, reusable Roles, Goal Templates, workflows, artifacts, metrics, and approval boundaries. Solution Packs recommend work; discovery does not create Agents, grant capabilities, or execute actions.",
  inputSchema: z.object({
    packId: z.string().min(1).max(100).optional(),
  }),
  execute({ packId }) {
    return {
      packs: BUILTIN_SOLUTION_PACK_CATALOG.packs.filter((pack) => !packId || pack.id === packId),
      authorityNotice: "Relay and explicit owner approval remain authoritative. Discovery does not activate accounts, schedule work, route tasks, publish, move money, hire or fire, or modify production systems.",
    };
  },
});
