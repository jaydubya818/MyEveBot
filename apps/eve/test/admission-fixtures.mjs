import { RoutineAdmission } from "../lib/routine-admission.ts";
import { getCapability } from "../lib/capability-registry.ts";
import { getAgent, effectiveCapability } from "../lib/agents.ts";
import { ActionGateway as Gateway } from "../lib/action-gateway.ts";
// Local deterministic dependencies. Never imported by application code.
export function admissionFixture(database, overrides = {}) {
  return new RoutineAdmission(database, {
    agent: (owner, id) => getAgent(owner, id, database),
    capability: (id) => {
      const c = getCapability(id, {
        DATABASE_URL: "fixture",
        AGENTMAIL_API_KEY: "fixture",
      });
      return c
        ? { ...c, availability: { status: "available", configured: true } }
        : undefined;
    },
    permission: (agent, id) =>
      effectiveCapability(agent, id, { checkAvailability: false }).allowed,
    availability: async () => ({ status: "AVAILABLE" }),
    executionEnabled: () => true,
    ...overrides,
  });
}
export class ActionGateway extends Gateway {
  constructor(database, authority, approvals) {
    super(database, authority, approvals, () => true);
  }
}
