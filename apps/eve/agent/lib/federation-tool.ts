import type { DynamicResolveContext, ToolContext } from "eve/tools";
import { z } from "zod";
import { ActionBlocked, ActionGateway, consumeActionAuthority, consumeProviderAuthority, type ActionAdapter } from "../../lib/action-gateway.ts";
import { effectiveCapability } from "../../lib/agents.ts";
import { getCapability } from "../../lib/capability-registry.ts";
import { RelayClient, relayOrigin } from "../../lib/relay/client.ts";
import { submissionSchema } from "../../lib/relay/contracts.ts";
import { sendExternal, getExternalResult } from "../../lib/relay/inbox.ts";
import { FederationStore } from "../../lib/relay/store.ts";
import { resolveSessionAgent } from "./session-settings.ts";
import { toolActionRequest } from "./action-context.ts";

export const federationToolInput = z.object({
  operation: z.enum(["discover", "request", "status"]),
  request: submissionSchema.optional(),
  requestId: z.string().min(1).max(255).optional(),
}).strict().superRefine((input, ctx) => {
  if ((input.operation === "request") !== Boolean(input.request)
    || (input.operation === "status") !== Boolean(input.requestId)) {
    ctx.addIssue({code: "custom", message: "request requires only a canonical request; status requires only requestId; discover takes neither."});
  }
});
type Input = z.infer<typeof federationToolInput>;
const CAPABILITY = "federation.request";

async function binding(ctx: Pick<DynamicResolveContext, "session">) {
  relayOrigin(); // Exact true feature gate and canonical origin validation.
  const caller = ctx.session.auth.current;
  if (!caller || caller.principalType !== "user" || caller.attributes.owner !== "true"
    || caller.attributes.role === "guest" || caller.attributes.myeveRoleId
    || getCapability(CAPABILITY)?.availability.status !== "available") throw new ActionBlocked("denied", "federation_unavailable");
  const agent = await resolveSessionAgent({ownerId: caller.principalId, sessionId: ctx.session.id,
    auth: ctx.session.auth, primaryFallback: true});
  if (!agent || !effectiveCapability(agent, CAPABILITY).allowed) throw new ActionBlocked("denied", "federation_capability");
  const store = new FederationStore(caller.principalId);
  const connection = await store.connection();
  if (connection.localOwnerId !== caller.principalId || connection.localAgentId !== agent.id) {
    throw new ActionBlocked("denied", "federation_identity");
  }
  return {agent, store, connection};
}

export async function federationToolAvailable(ctx: Pick<DynamicResolveContext, "session">): Promise<boolean> {
  try { await binding(ctx); return true; } catch { return false; }
}

/** One governed adapter; every transport operation uses the existing Federation service. */
export async function executeFederationTool(value: Input, ctx: ToolContext) {
  try {
    const input = federationToolInput.parse(value);
    const initial = await binding(ctx);
    const action = await toolActionRequest(ctx, {capabilityId: CAPABILITY,
      actionClass: input.operation !== "request" || input.request?.capability === "knowledge.query" ? "read"
        : input.request?.capability === "work.request" ? "execute" : "send",
      parameters: input});
    if (action.executor.agentId !== initial.agent.id || action.trigger.kind !== "owner_chat"
      || !["primary-agent", "persistent-agent"].includes(action.executor.kind)) throw new ActionBlocked("denied", "federation_identity");
    // Content remains in canonical encrypted Federation storage, never Action receipts.
    let response: Record<string, unknown> | undefined;
    const adapter: ActionAdapter<Record<string, unknown>> = {
      async resolveTarget() {
        const fresh = await binding(ctx);
        let resource = "discovery";
        if (input.operation === "request") resource = JSON.stringify([input.request!.target, input.request!.capability, input.request!.resource]);
        if (input.operation === "status") {
          const [row] = await fresh.store.database.query(
            "SELECT request_id FROM myeve_relay_requests WHERE owner_id=$1 AND request_id=$2 AND direction='outgoing' AND sender_agent_id=$3 AND sender_owner_id=$4",
            [fresh.store.ownerId, input.requestId, fresh.connection.agentId, fresh.connection.ownerId]);
          if (!row) throw new ActionBlocked("denied", "federation_request_owner");
          resource = input.requestId!;
        }
        return {provider: "relay", account: fresh.connection.agentId, resource, environment: relayOrigin()};
      },
      async execute(parameters, authority) {
        await consumeActionAuthority(authority, parameters, CAPABILITY);
        const fresh = await binding(ctx);
        if (fresh.agent.id !== authority.executor.agentId || fresh.connection.agentId !== authority.target.account
          || relayOrigin() !== authority.target.environment) throw new ActionBlocked("denied", "federation_identity_changed");
        await consumeProviderAuthority(authority, parameters, CAPABILITY);
        if (input.operation === "request") response = await sendExternal(fresh.store, input.request);
        else if (input.operation === "status") response = await getExternalResult(fresh.store, input.requestId!);
        else {
          const discovery = await new RelayClient(fresh.connection.credential).command({operation: "discover", input: {}});
          response = {...discovery, currentTime: new Date().toISOString()};
        }
        return response!;
      },
      receipt(result) { return {operation: input.operation, requestId: result.requestId ?? null, status: result.status ?? "discovered"}; },
      async verify(result) {
        // Recheck the local Agent before releasing a response to the model.
        const fresh = await binding(ctx);
        if (fresh.agent.id !== initial.agent.id || fresh.connection.agentId !== initial.connection.agentId) {
          throw new ActionBlocked("denied", "federation_identity_changed");
        }
        return {verified: true, receipt: {operation: input.operation, requestId: result.requestId ?? null, status: result.status ?? "discovered"}};
      },
    };
    const evidence = await new ActionGateway().execute(action, adapter, ctx.abortSignal);
    return { ...evidence, response: response ?? {status: "already_executed", message: "Use status to reauthorize retrieval of the request result."} };
  } catch (error) {
    // Never surface transport errors, credentials, or raw provider payloads.
    return {status: error instanceof ActionBlocked ? error.status : "denied", code: "federation_unavailable_or_denied", canEscalate: false};
  }
}
