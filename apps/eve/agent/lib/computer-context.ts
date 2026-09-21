import type { ToolContext } from "eve/tools";

import {
  assertComputerCapability,
  createComputerSession,
  getComputerSessionForRuntime,
  transitionComputerSession,
  updateComputerSessionAllowedDomains,
} from "../../lib/computer-sessions.ts";
import {
  normalizeAllowedDomains,
  PRIVATE_IPV4_CIDRS,
  type ComputerResourceLimits,
} from "../../lib/computer-types.ts";
import { resolveSessionAgent } from "./session-settings.ts";
import { ActionGateway,consumeActionAuthority } from "../../lib/action-gateway.ts";
import { prepareComputerRuntime } from "../../lib/computer-runtime.ts";
import { withPreparedComputer, bindPreparedComputer, ComputerSandboxAuthorityRequired } from "../../lib/computer-sandbox-backend.ts";
import { toolActionRequest } from "./action-context.ts";

export function computerOwnerId(ctx: Pick<ToolContext, "session">): string {
  const ownerId = ctx.session.auth.current?.principalId?.trim();
  if (!ownerId) throw new Error("An authenticated owner is required for computer work.");
  return ownerId;
}

export async function computerAgent(ctx: Pick<ToolContext, "session">) {
  const ownerId = computerOwnerId(ctx);
  return resolveSessionAgent({
    ownerId,
    sessionId: ctx.session.id,
    auth: ctx.session.auth,
    primaryFallback: ctx.session.auth.current?.attributes.owner === "true",
  });
}

export async function requireComputerCapability(ctx: ToolContext, capabilityId: string) {
  const ownerId = computerOwnerId(ctx);
  const agent = await computerAgent(ctx);
  if (!agent) throw new Error("The current runtime is not attributed to an Agent.");
  return assertComputerCapability({
    ownerId,
    runtimeSessionId: ctx.session.id,
    agentId: agent.id,
    capabilityId,
  });
}

export async function provisionComputerSession(
  ctx: ToolContext,
  input: {
    goalId?: string;
    taskId?: string;
    runId?: string;
    limits?: Partial<ComputerResourceLimits>;
    allowedDomains?: readonly string[];
  } = {},
) {
  const request=await toolActionRequest(ctx,{capabilityId:"computer.session.create",actionClass:"create",parameters:input as Record<string,unknown>});
  request.actionKey += ":provision";
  let provisioned:Awaited<ReturnType<typeof provisionAuthorizedComputerSession>>|undefined;
  await new ActionGateway().execute(request,{
    resolveTarget:async()=>({provider:"sandbox",account:request.ownerId,resource:ctx.session.id,environment:"isolated"}),
    async execute(parameters,authorized) {
      await consumeActionAuthority(authorized,parameters,"computer.session.create");
      const prepared = await prepareComputerRuntime(request.ownerId, ctx.abortSignal);
      // Preparation grants no execution authority: recheck revocation, budget,
      // deadlines and Agent revision immediately before session creation.
      provisioned=await withPreparedComputer(prepared, authorized, parameters, () => provisionAuthorizedComputerSession(ctx,{...parameters,runId:request.runId} as typeof input));return provisioned;
    },
    receipt:result=>({computerSessionId:result.session.id,sandboxId:result.session.sandboxId}),
    async verify(result) {
      const saved=await getComputerSessionForRuntime(request.ownerId,ctx.session.id);
      return {verified:!!saved && saved.id===result.session.id && saved.sandboxId===result.session.sandboxId && ["ready","running"].includes(saved.status),
        receipt:{computerSessionId:result.session.id,sandboxId:result.session.sandboxId}};
    },
  },ctx.abortSignal);
  if(provisioned)return provisioned;
  const session=await getComputerSessionForRuntime(request.ownerId,ctx.session.id);
  if(!session || !["ready","running"].includes(session.status))throw new Error("The prior computer action completed, but its session is no longer executable.");
  return {session,startedOnDemand:false};
}

/** Eve reopens handles across steps. Only the explicit no-authority error may
 * trigger a new Gateway provisioning action; arbitrary provider errors do not. */
export async function getComputerSandbox(ctx: ToolContext) {
  try { return await ctx.getSandbox(); }
  catch (error) {
    if (!(error instanceof ComputerSandboxAuthorityRequired)) throw error;
    await provisionComputerSession(ctx);
    return ctx.getSandbox();
  }
}

async function provisionAuthorizedComputerSession(
  ctx:ToolContext,
  input:{goalId?:string;taskId?:string;runId?:string;limits?:Partial<ComputerResourceLimits>;allowedDomains?:readonly string[]}={},
) {
  const ownerId = computerOwnerId(ctx);
  const agent = await computerAgent(ctx);
  if (!agent) throw new Error("The current runtime is not attributed to an Agent.");
  const before = await getComputerSessionForRuntime(ownerId, ctx.session.id);
  if (before?.status === "paused") {
    throw new Error("Computer access is paused for owner takeover. Resume it before continuing.");
  }
  const requestedDomains = normalizeAllowedDomains(input.allowedDomains);
  let session = await createComputerSession({
    ownerId,
    agentId: agent.id,
    runtimeSessionId: ctx.session.id,
    goalId: input.goalId,
    taskId: input.taskId,
    runId: input.runId,
    limits: input.limits,
    allowedDomains: requestedDomains,
  });
  try {
    if (session.status === "provisioning") await bindPreparedComputer(ownerId,session.id,input.runId!);
    const sandbox = await ctx.getSandbox();
    const currentDomains = Array.isArray(session.networkPolicy.allowedDomains)
      ? session.networkPolicy.allowedDomains.filter((value): value is string => typeof value === "string")
      : [];
    const allowedDomains = normalizeAllowedDomains([...currentDomains, ...requestedDomains]);
    await sandbox.setNetworkPolicy(allowedDomains.length === 0 ? "deny-all" : {
      allow: allowedDomains,
      subnets: { deny: [...PRIVATE_IPV4_CIDRS] },
    });
    session = await updateComputerSessionAllowedDomains({ ownerId, id: session.id, allowedDomains });
    if (session.status === "provisioning") {
      session = await transitionComputerSession({ ownerId, id: session.id, to: "ready", sandboxId: sandbox.id });
    }
    return { session, startedOnDemand: !before || !["ready", "running"].includes(before.status) };
  } catch (error) {
    if (session.status === "provisioning") {
      await transitionComputerSession({
        ownerId,
        id: session.id,
        to: "failed",
        failureCode: "session_provision_failed",
        failureSummary: "Computer session provisioning failed. Check runtime status before retrying.",
      });
    }
    const {recoverComputerResources}=await import("../../lib/computer-resource-recovery.ts");
    await recoverComputerResources(ownerId).catch(()=>{});
    throw error;
  }
}
