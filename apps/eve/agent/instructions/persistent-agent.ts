import { defineDynamic } from "eve/instructions";

import { BUILTIN_ROLE_CATALOG } from "../../lib/builtin-role-catalog.ts";
import { bindExecutorRun, sessionAgent } from "../lib/session-settings.ts";

export default defineDynamic({
  events: {
    "turn.started": async (_event, ctx) => {
      const ownerId = ctx.session.auth.current?.principalId;
      const agent = await sessionAgent(ownerId, ctx.session.auth.current?.attributes.myeveAgentId, ctx.session.auth.current?.attributes.owner === "true");
      if (!agent || !ownerId) return null;
      const authenticatedThreadId = ctx.session.auth.current?.attributes.webThreadId;
      const threadId = typeof authenticatedThreadId === "string" ? authenticatedThreadId : null;
      const authenticatedRoleId = ctx.session.auth.current?.attributes.myeveRoleId;
      const role = typeof authenticatedRoleId === "string"
        ? BUILTIN_ROLE_CATALOG.roles.find((candidate) => candidate.id === authenticatedRoleId)
        : undefined;
      if (authenticatedRoleId && role?.executionMode !== "on-demand") throw new Error("This Role is not available for on-demand use.");
      if (authenticatedRoleId && ctx.session.auth.current?.attributes.myeveAgentId) throw new Error("Choose either a persistent Agent or an on-demand Role.");
      await bindExecutorRun(ctx.session.id, String(ctx.messages.length), ownerId, agent, threadId, role
        ? { kind: "on-demand-role", roleId: role.id }
        : { kind: agent.isPrimary ? "primary-agent" : "persistent-agent" });
      if (agent.status !== "active") throw new Error(`${agent.name} is ${agent.status} and cannot execute new work.`);
      return null;
    },
  },
});
