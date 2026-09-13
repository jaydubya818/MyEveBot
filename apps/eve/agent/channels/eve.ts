import { ForbiddenError, type AuthFn, localDev, vercelOidc } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";

import { getAgent } from "../../lib/agents.ts";
import { webPrincipal } from "../../lib/web-auth.ts";

export function ownerSession(): AuthFn<Request> {
  return async (request) => {
    const principal = webPrincipal(request);
    if (principal === null) return null;
    const agentHeader = request.headers.get("x-myeve-agent-id");
    const requestedAgentId = agentHeader?.trim();
    const requestedThreadId = request.headers.get("x-myeve-thread-id")?.trim();
    if (agentHeader !== null && (!requestedAgentId || requestedAgentId.length > 100)) {
      throw new ForbiddenError({ code: "invalid_agent_binding", message: "Agent binding is invalid." });
    }
    if (requestedAgentId) {
      const agent = await getAgent(principal.id, requestedAgentId);
      if (!agent) throw new ForbiddenError({ code: "invalid_agent_binding", message: "Agent does not belong to the current owner." });
      if (agent.status !== "active") throw new ForbiddenError({ code: "inactive_agent_binding", message: `${agent.name} is ${agent.status} and cannot execute new work.` });
    }
    return {
      attributes: {
        owner: "true",
        ...(requestedAgentId ? { myeveAgentId: requestedAgentId } : {}),
        ...(requestedThreadId && requestedThreadId.length <= 100 ? { webThreadId: requestedThreadId } : {}),
      },
      authenticator: "myeve-web-session",
      issuer: "myeve",
      principalId: principal.id,
      principalType: "user",
      subject: principal.id,
    };
  };
}

export const eveAuth = [
  // The browser session is the personal owner's primary route boundary.
  ownerSession(),
  // Lets the eve TUI and your Vercel deployments reach the deployed agent.
  vercelOidc(),
  // Open on localhost for `eve dev` and the REPL. Production requests arrive
  // on the deployment host and therefore do not match this strategy.
  localDev(),
] satisfies readonly AuthFn<Request>[];

export default eveChannel({
  auth: eveAuth,
});
