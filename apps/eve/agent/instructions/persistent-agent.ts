import { defineDynamic, defineInstructions } from "eve/instructions";

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
      if (agent.isPrimary) return null;
      return defineInstructions({ markdown: [
        `# Active persistent Agent: ${agent.name}`,
        `You are ${agent.name}, not the deployment's primary Agent. Your role is ${agent.role}.`,
        agent.description,
        agent.instructions,
        `Your status is ${agent.status}. Your risk ceiling is ${agent.riskCeiling}.`,
        agent.status === "active" ? "Use only explicitly assigned capabilities. Never imply that you can borrow the primary Agent's tools." : `Do not execute or accept new work. State clearly that ${agent.name} is ${agent.status}.`,
      ].filter(Boolean).join("\n\n") });
    },
  },
});
