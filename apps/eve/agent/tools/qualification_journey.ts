import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { checkCapabilityAvailability } from "../../lib/capability-registry.ts";
import { ensureQualificationHost } from "../../lib/qualification/host-bootstrap.ts";
import { qualificationRoot, QualificationRootRefused } from "../../lib/qualification/root.ts";
import { ownerModelStepKey } from "../../lib/relay/owner/model.ts";
import { authorizeHostedTesterTurn, qdevRequestOwner } from "../../lib/qualification/ingress.ts";

/**
 * Owner-authenticated entrypoint to the qdev journey. A frozen installation takes NO parameters: the plan, project,
 * ports and ledger credentials are host configuration. An owner-local private-beta installation takes exactly the owner-confirmed request text and
 * the plan digest the owner confirmed; the root re-derives the plan from the host template and refuses any digest mismatch. It is discoverable only to the authenticated human
 * owner (not a guest, delegated role or subagent) while the qualification host is enabled, and every
 * execution rechecks that. Spend authority remains solely the qdev ledger gate.
 */
const owner = (ctx: { session: { auth: { current?: any }; parent?: unknown } }) => {
  const ownerId = qdevRequestOwner(ctx.session);
  return ownerId ? { ownerId, kind: "human" as const } : null;
};
export default defineDynamic({
  events: {
    "step.started": async (event, ctx) => {
      if (checkCapabilityAvailability("tool.qualification_journey")?.status !== "available" || !owner(ctx as never)) return null;
      const ownerId = owner(ctx as never)!.ownerId;
      return defineTool({
        availableInSubagents: false,
        description: "Run the ledger-gated journey for the authenticated owner: Sofie plan, coding, Factory build, verification and delivery. Frozen installations take no parameters; owner-local installations take only the owner-confirmed request and its plan digest. Reports an unclaimed presentation and never grants readiness or authority.",
        inputSchema: z.union([z.object({}).strict(),
          z.object({ request: z.string().min(1).max(4000), planSha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()]),
        async execute(input, toolCtx) {
          const principal = owner(toolCtx as never);
          if (checkCapabilityAvailability("tool.qualification_journey")?.status !== "available" || !principal || principal.ownerId !== ownerId || toolCtx.session.id !== ctx.session.id)
            throw new QualificationRootRefused("QDEV_ROOT_PRINCIPAL");
          await authorizeHostedTesterTurn(principal.ownerId, toolCtx.session.id, ownerModelStepKey(event));
          ensureQualificationHost();
          return qualificationRoot().run(principal, input);
        },
      });
    },
  },
});
