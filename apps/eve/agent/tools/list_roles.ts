import { defineTool } from "eve/tools";
import { z } from "zod";

import { BUILTIN_ROLE_CATALOG } from "../../lib/builtin-role-catalog.ts";

export default defineTool({
  description: "List every reusable Role Pack with exact tool-computed counts. With no filters, returns a compact complete inventory. Pass packId or roleId for full Role definitions, responsibilities, boundaries, recommended capabilities, lifecycle stages, and execution mode. Role recommendations do not grant capabilities.",
  inputSchema: z.object({
    packId: z.string().min(1).max(100).optional(),
    roleId: z.string().min(1).max(100).optional(),
  }),
  execute({ packId, roleId }) {
    const matchingPacks = BUILTIN_ROLE_CATALOG.packs
      .filter((pack) => !packId || pack.id === packId)
      .map((pack) => ({
        ...pack,
        roles: pack.roles.filter(({ role }) => !roleId || role.id === roleId),
      }))
      .filter((pack) => pack.roles.length > 0);
    const uniqueRoleCount = new Set(
      matchingPacks.flatMap((pack) => pack.roles.map(({ role }) => role.id)),
    ).size;

    if (!packId && !roleId) {
      return {
        mode: "inventory" as const,
        packCount: matchingPacks.length,
        uniqueRoleCount,
        packs: matchingPacks.map((pack) => ({
          id: pack.id,
          name: pack.name,
          description: pack.description,
          domain: pack.domain ?? null,
          catalogVisibility: pack.catalogVisibility ?? "visible",
          roleCount: pack.roles.length,
          roles: pack.roles.map(({ role, lifecycleStages = [] }) => ({
            id: role.id,
            name: role.name,
            category: role.category,
            executionMode: role.executionMode,
            lifecycleStages,
          })),
        })),
      };
    }

    return {
      mode: "detail" as const,
      packCount: matchingPacks.length,
      uniqueRoleCount,
      packs: matchingPacks.map((pack) => ({
        ...pack,
        roleCount: pack.roles.length,
      })),
    };
  },
});
