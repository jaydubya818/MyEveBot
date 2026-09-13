import { defineDynamic } from "eve/instructions";

import { bindAgentRun, sessionAgent } from "../lib/session-settings.ts";

export default defineDynamic({
  events: {
    "turn.started": async (_event, ctx) => {
      const ownerId = ctx.session.auth.current?.principalId;
      const agent = await sessionAgent(ownerId, ctx.session.auth.current?.attributes.myeveAgentId, ctx.session.auth.current?.attributes.owner === "true");
      if (!agent || !ownerId) return null;
      const authenticatedThreadId = ctx.session.auth.current?.attributes.webThreadId;
      const threadId = typeof authenticatedThreadId === "string" ? authenticatedThreadId : null;
      await bindAgentRun(ctx.session.id, String(ctx.messages.length), ownerId, agent, threadId);
      if (agent.status !== "active") throw new Error(`${agent.name} is ${agent.status} and cannot execute new work.`);
      return null;
    },
  },
});
