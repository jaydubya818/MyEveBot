import {selectedEngineeringWorkEnabled} from "../../lib/engineering/alpha-selected-work.ts";
import { engineeringWorkEnabled } from "../../lib/engineering/deployment-mode.ts";
import { BusinessScopes } from "../../lib/business-scopes.ts";
import { OWNER_RUNTIME_HEADER,verifyOwnerRuntime,resolveOwnerRuntime,assertOwnerRuntimeRoute } from "../../lib/relay/owner/runtime.ts";
import { ForbiddenError, type AuthFn, localDev, vercelOidc } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";

import { getAgent } from "../../lib/agents.ts";
import { BUILTIN_ROLE_CATALOG } from "../../lib/builtin-role-catalog.ts";
import { authenticateWebPrincipal } from "../../lib/web-auth.ts";
import { capabilityPrincipal } from "../../lib/capability-control/runtime.ts";
import { EXECUTION_HEADER,verifyExecution,resolveExecution } from "../../lib/execution-auth.ts";
import { ROUTINE_EXECUTION_READY } from "../../lib/routine-review.ts";
import { ENGINEERING_WORK_ID_HEADER,ENGINEERING_WORK_ID_PATTERN } from "../lib/engineering-work-binding.ts";
import { replaySessionId, retainedSessionOwner, retainedWorkSessionRead } from "../lib/retained-work-session.ts";
import { assertRetainedSummaryMessage, readRetainedWorkSummary, type RetainedSummaryBinding } from "../lib/retained-work-summary.ts";

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
    const principal = await authenticateWebPrincipal(request);
    if (principal === null) return null;
    const agentHeader = request.headers.get("x-myeve-agent-id");
    const requestedAgentId = agentHeader?.trim();
    const roleHeader = request.headers.get("x-myeve-role-id");
    const requestedRoleId = roleHeader?.trim();
    const requestedThreadId = request.headers.get("x-myeve-thread-id")?.trim();
    const replayId = replaySessionId(request);
    if (replayId) {
      const owned = await retainedSessionOwner(replayId, principal.id, requestedThreadId);
      // Eve retries stream transport 5xx with its bounded reconnect policy.
      // Never authorize a pending session or turn this create/bind race into 403.
      if (owned === null) throw new Error('Session ownership binding is not available yet.');
      if (!owned) throw new ForbiddenError({ code: "invalid_session_owner", message: "This conversation is not available in this workspace." });
    }
    const workHeader = request.headers.get(ENGINEERING_WORK_ID_HEADER);
    const requestedWorkId = workHeader?.trim();
    if(process.env.MYEVE_PARTNER_OWNER_ID && requestedWorkId && await new BusinessScopes(principal.id).hasSharedWork(principal.id,requestedWorkId))
      throw new ForbiddenError({code:"shared_work_context_required",message:"Open Our business to ask Sofie with explicitly shared Work context. A private conversation cannot inherit this shared Work."});
    const workIntent = request.headers.get("x-myeve-engineering-intent");
    let retainedSummary: RetainedSummaryBinding | undefined;
    if (workIntent !== null && (!requestedWorkId || !["observe", "continue"].includes(workIntent)))
      throw new ForbiddenError({code:"invalid_engineering_intent",message:"Select Work and a valid access mode."});
    if (workHeader !== null && (
      !requestedWorkId ||
      !ENGINEERING_WORK_ID_PATTERN.test(requestedWorkId) ||
      !requestedThreadId || requestedThreadId.length > 100 || requestedRoleId
    )) throw new ForbiddenError({ code: "invalid_engineering_work_binding", message: "Engineering Work requires a valid selection in a direct web chat." });
    if (workHeader !== null) {
      let allowed = false;
      try {
        // Exact retained owner/Work/thread/session binding permits only GET replay.
        // POST and every control route still require the existing execution gate.
        allowed = !!replayId && await retainedWorkSessionRead(request, principal.id, requestedThreadId!, requestedWorkId!);
        // During a first turn the server-owned session can precede the model
        // ledger. Existing live selection authority remains valid in that case.
        if (!allowed) allowed = selectedEngineeringWorkEnabled(requestedWorkId, engineeringWorkEnabled());
      } catch { /* Missing authority or unavailable storage fails closed. */ }
      if (!allowed && request.method === 'POST' && workIntent === 'observe') {
        const session = /^\/eve\/v1\/session\/([^/]+)$/.exec(new URL(request.url).pathname)?.[1];
        if (session) {
          try {
            await assertRetainedSummaryMessage(request,requestedThreadId!);
            retainedSummary = (await readRetainedWorkSummary({ownerId:principal.id,threadId:requestedThreadId!,sessionId:session,workId:requestedWorkId!})).binding;
            allowed = true;
          } catch { /* Observation never falls back to a provider or execution. */ }
        }
      }
      if (!allowed) throw new ForbiddenError({ code: "invalid_engineering_work_binding", message: "This Work conversation is not available for the requested operation." });
    }
    if (agentHeader !== null && (!requestedAgentId || requestedAgentId.length > 100)) {
      throw new ForbiddenError({ code: "invalid_agent_binding", message: "Agent binding is invalid." });
    }
    let primaryAgent = !requestedAgentId;
    if (requestedAgentId) {
      const agent = await getAgent(principal.id, requestedAgentId);
      if (!agent) throw new ForbiddenError({ code: "invalid_agent_binding", message: "Agent does not belong to the current owner." });
      primaryAgent = agent.isPrimary;
      if (agent.status !== "active") throw new ForbiddenError({ code: "inactive_agent_binding", message: `${agent.name} is ${agent.status} and cannot execute new work.` });
      if (requestedWorkId && !agent.isPrimary) throw new ForbiddenError({ code: "invalid_engineering_work_binding", message: "Engineering Work requires the primary Agent." });
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
    // Local-development owner fallback never authorizes capability management.
    // The marker is minted from this request, never accepted from caller headers.
    let signedCapabilityOwner = false;
    if (process.env.MYEVE_CAPABILITY_CONTROL_ENABLED === "true" && primaryAgent && !requestedRoleId && !requestedWorkId) {
      try { signedCapabilityOwner = await capabilityPrincipal(request) === principal.id; }
      catch { /* Ordinary channel behavior is preserved; capability tools deny. */ }
    }
    return {
      attributes: {
        owner: "true",
        ...(signedCapabilityOwner ? { myeveCapabilityOwner: "signed-session" } : {}),
        ...(requestedAgentId ? { myeveAgentId: requestedAgentId } : {}),
        ...(requestedRoleId ? { myeveRoleId: requestedRoleId } : {}),
        ...(requestedThreadId && requestedThreadId.length <= 100 ? { webThreadId: requestedThreadId } : {}),
        ...(retainedSummary ? { myeveRetainedSummary: JSON.stringify(retainedSummary) } : requestedWorkId ? { myeveEngineeringWorkId: requestedWorkId, myeveEngineeringIntent: workIntent ?? "observe" } : {}),
      },
      authenticator: "myeve-web-session",
      issuer: "myeve",
      principalId: principal.id,
      principalType: "user",
      subject: principal.id,
    };
  };
}

export function ownerChannelSession():AuthFn<Request>{
 return async request=>{
  const token=request.headers.get(OWNER_RUNTIME_HEADER);if(!token)return null;
  try{const claim=verifyOwnerRuntime(token);const binding=await resolveOwnerRuntime(claim);assertOwnerRuntimeRoute(request,claim,binding);
   return {authenticator:"myeve-owner-channel",issuer:"myeve",principalId:claim.ownerId,principalType:"user",subject:claim.ownerId,
    attributes:{owner:"true",myeveAgentId:claim.agentId,webThreadId:claim.runId,ownerChannelOwner:claim.ownerId,ownerChannelRun:claim.runId,ownerChannelDispatch:claim.dispatchId,ownerChannelExpiry:String(claim.expiresAt),ownerChannelPurpose:claim.purpose}};
  }catch{throw new ForbiddenError({code:"invalid_owner_channel_claim",message:"Owner channel execution authority unavailable."});}
 };
}
export const eveAuth = [
  ownerChannelSession(),
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
