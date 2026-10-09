import { defineTool } from "eve/tools";
import { z } from "zod";

import { BUILTIN_SOLUTION_PACK_CATALOG } from "../../lib/builtin-solution-packs.ts";

export default defineTool({
  description: "List every built-in Solution Pack with exact tool-computed counts. With no packId, returns a compact complete inventory. Pass packId to inspect its domains, reusable Roles, Goal Templates, workflows, artifacts, metrics, and approval boundaries. Solution Packs recommend work; discovery does not create Agents, grant capabilities, or execute actions.",
  inputSchema: z.object({
    packId: z.string().min(1).max(100).optional(),
  }),
  execute({ packId }) {
    const matchingPacks = BUILTIN_SOLUTION_PACK_CATALOG.packs.filter(
      (pack) => !packId || pack.id === packId,
    );
    const authorityNotice = "Relay and explicit owner approval remain authoritative. Discovery does not activate accounts, schedule work, route tasks, publish, move money, hire or fire, or modify production systems.";

    if (!packId) {
      return {
        mode: "inventory" as const,
        packCount: matchingPacks.length,
        packs: matchingPacks.map((pack) => ({
          id: pack.id,
          name: pack.name,
          description: pack.description,
          purpose: pack.purpose,
          rolePackIds: pack.rolePackIds,
          roleCount: pack.roles.length,
          domainCount: pack.domains.length,
          goalTemplateCount: pack.goalTemplates.length,
          workflowTemplateCount: pack.workflowTemplates.length,
          artifactDefinitionCount: pack.artifactDefinitions.length,
          metricDefinitionCount: pack.metricDefinitions.length,
          enabledByDefault: pack.enabledByDefault,
        })),
        authorityNotice,
      };
    }

    return {
      mode: "detail" as const,
      packCount: matchingPacks.length,
      packs: matchingPacks.map((pack) => ({
        ...pack,
        roleCount: pack.roles.length,
        domainCount: pack.domains.length,
        goalTemplateCount: pack.goalTemplates.length,
        workflowTemplateCount: pack.workflowTemplates.length,
        artifactDefinitionCount: pack.artifactDefinitions.length,
        metricDefinitionCount: pack.metricDefinitions.length,
      })),
      authorityNotice,
    };
  },
});
