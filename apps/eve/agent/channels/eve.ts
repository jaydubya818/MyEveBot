import { ForbiddenError, type AuthFn, localDev, vercelOidc } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";

import { getAgent } from "../../lib/agents.ts";
import { BUILTIN_ROLE_CATALOG } from "../../lib/builtin-role-catalog.ts";
import { webPrincipal } from "../../lib/web-auth.ts";
import { EXECUTION_HEADER,verifyExecution,resolveExecution } from "../../lib/execution-auth.ts";
import { ROUTINE_EXECUTION_READY } from "../../lib/routine-review.ts";

export function routineSession():AuthFn<Request> {
  return async request=>{
    const token=request.headers.get(EXECUTION_HEADER);if(!token)return null;
    try {
      if(!ROUTINE_EXECUTION_READY)throw new Error("Routine adapters are not qualified.");
      const claim=await resolveExecution(verifyExecution(token));
      return {authenticator:"myeve-routine",issuer:"myeve",principalId:claim.ownerId,principalType:"user",subject:claim.ownerId,
        attributes:{owner:"true",myeveAgentId:claim.agentId,executionOwner:claim.ownerId,executionOccurrence:claim.occurrenceId,
          executionVersion:String(claim.version),executionWorker:claim.workerId}};
    } catch {throw new ForbiddenError({code:"invalid_execution_claim",message:"Execution authority is unavailable or expired."});}
  };
}

export function ownerSession(): AuthFn<Request> {
  return async (request) => {
    const principal = webPrincipal(request);
    if (principal === null) return null;
    const agentHeader = request.headers.get("x-myeve-agent-id");
    const requestedAgentId = agentHeader?.trim();
    const roleHeader = request.headers.get("x-myeve-role-id");
    const requestedRoleId = roleHeader?.trim();
    const requestedThreadId = request.headers.get("x-myeve-thread-id")?.trim();
    if (agentHeader !== null && (!requestedAgentId || requestedAgentId.length > 100)) {
      throw new ForbiddenError({ code: "invalid_agent_binding", message: "Agent binding is invalid." });
    }
    if (requestedAgentId) {
      const agent = await getAgent(principal.id, requestedAgentId);
      if (!agent) throw new ForbiddenError({ code: "invalid_agent_binding", message: "Agent does not belong to the current owner." });
      if (agent.status !== "active") throw new ForbiddenError({ code: "inactive_agent_binding", message: `${agent.name} is ${agent.status} and cannot execute new work.` });
    }
    if (roleHeader !== null && (!requestedRoleId || requestedRoleId.length > 100)) {
      throw new ForbiddenError({ code: "invalid_role_binding", message: "Role binding is invalid." });
    }
    if (requestedRoleId) {
      const role = BUILTIN_ROLE_CATALOG.roles.find((candidate) => candidate.id === requestedRoleId);
      if (!role || role.executionMode !== "on-demand") {
        throw new ForbiddenError({ code: "invalid_role_binding", message: "Role is not available for on-demand use." });
      }
    }
    if (requestedAgentId && requestedRoleId) {
      throw new ForbiddenError({ code: "conflicting_executor_binding", message: "Choose either a persistent Agent or an on-demand Role." });
    }
    return {
      attributes: {
        owner: "true",
        ...(requestedAgentId ? { myeveAgentId: requestedAgentId } : {}),
        ...(requestedRoleId ? { myeveRoleId: requestedRoleId } : {}),
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
  routineSession(),
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
