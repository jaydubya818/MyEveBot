import { defineTool } from "eve/tools";
import { z } from "zod";

import {
  CAPABILITY_KINDS,
  findCapabilities,
  getAvailableCapabilities,
  getCapabilities,
  getCapabilitiesForObjective,
} from "../../lib/capability-registry.ts";
import { agentName } from "../lib/owner.ts";

const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;

export default defineTool({
  description:
    `Discover what ${agentName()} can currently use for an objective. Returns availability, permissions, risk, approval requirements, and configuration gaps without exposing secrets.`,
  inputSchema: z.object({
    objective: z.string().min(1).max(500).optional(),
    query: z.string().min(1).max(120).optional(),
    kind: z.enum(CAPABILITY_KINDS).optional(),
    maxRisk: z.enum(RISK_LEVELS).optional(),
    permission: z.string().min(1).max(120).optional(),
    includeUnavailable: z.boolean().default(false),
  }),
  execute({ objective, query, kind, maxRisk, permission, includeUnavailable }) {
    const filters = { kind, maxRisk, permission };
    const capabilities = objective
      ? getCapabilitiesForObjective(objective)
      : query
        ? findCapabilities(query, includeUnavailable ? filters : { ...filters, availability: "available" })
        : includeUnavailable
          ? getCapabilities(filters)
          : getAvailableCapabilities(filters);

    return {
      capabilities: capabilities.map((capability) => ({
        id: capability.id,
        name: capability.name,
        kind: capability.kind,
        description: capability.description,
        availability: capability.availability,
        permissions: capability.permissions,
        risk: capability.risk,
        approvalMode: capability.approvalPolicy.mode,
        dependencies: capability.dependencies,
        estimatedCost: capability.estimatedCost,
      })),
    };
  },
});
