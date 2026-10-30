import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { checkCapabilityAvailability } from "../../lib/capability-registry.ts";
import { ensureQualificationHost } from "../../lib/qualification/host-bootstrap.ts";
import { qualificationRoot, QualificationRootRefused } from "../../lib/qualification/root.ts";
import { qdevRequestOwner } from "../../lib/qualification/ingress.ts";

/**
 * Owner-authenticated entrypoint to the qdev journey. It takes NO model parameters: the plan, project,
 * ports and ledger credentials are host configuration. It is discoverable only to the authenticated human
 * owner (not a guest, delegated role or subagent) while the qualification host is enabled, and every
 * execution rechecks that. Spend authority remains solely the qdev ledger gate.
 */
const owner = (ctx: { session: { auth: { current?: any }; parent?: unknown } }) => {
  const ownerId = qdevRequestOwner(ctx.session);
  return ownerId ? { ownerId, kind: "human" as const } : null;
};
export default defineDynamic({
  events: {
    "step.started": async (_event, ctx) => {
      if (checkCapabilityAvailability("tool.qualification_journey")?.status !== "available" || !owner(ctx as never)) return null;
      const ownerId = owner(ctx as never)!.ownerId;
      return defineTool({
        availableInSubagents: false,
        description: "Run the approved, ledger-gated qualification journey for the authenticated owner: Sofie plan, coding, Factory build, independent verification and delivery. Takes no parameters; reports an unclaimed presentation and never grants readiness or authority.",
        inputSchema: z.object({}).strict(),
        async execute(_input, toolCtx) {
          const principal = owner(toolCtx as never);
          if (checkCapabilityAvailability("tool.qualification_journey")?.status !== "available" || !principal || principal.ownerId !== ownerId)
            throw new QualificationRootRefused("QDEV_ROOT_PRINCIPAL");
          ensureQualificationHost();
          return qualificationRoot().run(principal);
        },
      });
    },
  },
});
