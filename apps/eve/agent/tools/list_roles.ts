import { defineTool } from "eve/tools";
import { z } from "zod";

import { BUILTIN_ROLE_CATALOG } from "../../lib/builtin-role-catalog.ts";

export default defineTool({
  description: "List reusable Role Packs and Role definitions, including responsibilities, boundaries, recommended capabilities, lifecycle stages, and execution mode. Role recommendations do not grant capabilities.",
  inputSchema: z.object({
    packId: z.string().min(1).max(100).optional(),
    roleId: z.string().min(1).max(100).optional(),
  }),
  execute({ packId, roleId }) {
    const packs = BUILTIN_ROLE_CATALOG.packs
      .filter((pack) => !packId || pack.id === packId)
      .map((pack) => ({
        ...pack,
        roles: pack.roles.filter(({ role }) => !roleId || role.id === roleId),
      }))
      .filter((pack) => pack.roles.length > 0);
    return { packs };
  },
});
