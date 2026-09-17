import type { AgentView } from "../../lib/agents.ts";
import {
  createComputerSession,
  getComputerSessionForRuntime,
  transitionComputerSession,
  updateComputerAllowedDomains,
} from "../../lib/computer-sessions.ts";
import { browserDomainsForUrl, normalizeAllowedDomains, PRIVATE_IPV4_CIDRS } from "../../lib/computer-types.ts";

interface SandboxLike {
  id: string;
  setNetworkPolicy(policy: "deny-all" | { allow: string[]; subnets: { deny: string[] } }): Promise<unknown>;
}

export interface ComputerProvisionContext {
  session: { id: string };
  getSandbox(): Promise<SandboxLike>;
}

export async function ensureComputerForBrowserAction(input: {
  ctx: ComputerProvisionContext;
  ownerId: string;
  agent: AgentView;
  toolName: string;
  toolInput: Record<string, unknown>;
}) {
  const requestedDomains = input.toolName === "browser__navigate"
    ? browserDomainsForUrl(input.toolInput.url)
    : [];
  let session = await getComputerSessionForRuntime(input.ownerId, input.ctx.session.id);
  if (session?.status === "paused") {
    throw new Error("Computer session is paused for owner takeover. Resume it before using browser tools.");
  }
  if (session && session.agentId !== input.agent.id) {
    throw new Error("This computer session belongs to another Agent.");
  }
  if (!session || !["provisioning", "ready", "running"].includes(session.status)) {
    session = await createComputerSession({
      ownerId: input.ownerId,
      agentId: input.agent.id,
      runtimeSessionId: input.ctx.session.id,
      allowedDomains: requestedDomains,
    });
  } else if (requestedDomains.length > 0) {
    session = await updateComputerAllowedDomains(input.ownerId, session.id, requestedDomains);
  }
  const allowedDomains = normalizeAllowedDomains(
    Array.isArray(session.networkPolicy.allowedDomains)
      ? session.networkPolicy.allowedDomains.filter((value): value is string => typeof value === "string")
      : [],
  );
  try {
    const sandbox = await input.ctx.getSandbox();
    await sandbox.setNetworkPolicy(allowedDomains.length === 0 ? "deny-all" : {
      allow: allowedDomains,
      subnets: { deny: [...PRIVATE_IPV4_CIDRS] },
    });
    if (session.status === "provisioning") {
      session = await transitionComputerSession({ ownerId: input.ownerId, id: session.id, to: "ready", sandboxId: sandbox.id });
    }
    return session;
  } catch (error) {
    if (session.status === "provisioning") {
      await transitionComputerSession({
        ownerId: input.ownerId,
        id: session.id,
        to: "failed",
        failureCode: "session_provision_failed",
        failureSummary: error instanceof Error ? error.message : "Computer session provisioning failed.",
      });
    }
    throw error;
  }
}
