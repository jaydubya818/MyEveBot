import type { ApprovalContext, DynamicResolveContext, ToolContext } from "eve/tools";
import { z } from "zod";
import { ActionBlocked, ActionGateway, consumeActionAuthority, consumeProviderAuthority, localAuthorityProvider, type ActionAdapter } from "../../lib/action-gateway.ts";
import { approvalBinding, approvalRequestId, canonicalActionValue, decideApproval } from "../../lib/approvals.ts";
import { effectiveCapability } from "../../lib/agents.ts";
import { getCapability } from "../../lib/capability-registry.ts";
import { RelayClient, RelayOperationError, relayOrigin } from "../../lib/relay/client.ts";
import { submissionSchema } from "../../lib/relay/contracts.ts";
import { sendExternal, getExternalResult } from "../../lib/relay/inbox.ts";
import { FederationStore } from "../../lib/relay/store.ts";
import { bindPeerAction, effectivePeerPermission, peerReadModel, PeerPermissionError, requireEffectivePermission, resolvePeerMessageResource } from "../../lib/relay/peer-permissions.ts";
import { resolveSessionAgent } from "./session-settings.ts";
import { toolActionRequest } from "./action-context.ts";

// The transport contract remains unchanged. Only the authored message input may
// omit the resource; canonicalization fills it before any Action is prepared.
const toolSubmissionSchema = z.discriminatedUnion("capability", [
  submissionSchema.options[0],
  submissionSchema.options[1].extend({ resource: z.string().min(1).max(255).optional() }),
  submissionSchema.options[2], submissionSchema.options[3],
]);
export const federationToolInput = z.object({
  operation: z.enum(["discover", "permissions", "request", "status"]),
  request: toolSubmissionSchema.optional(),
  requestId: z.string().min(1).max(255).optional(),
}).strict().superRefine((input, ctx) => {
  if ((input.operation === "request") !== Boolean(input.request)
    || (input.operation === "status") !== Boolean(input.requestId)) {
    ctx.addIssue({code: "custom", message: "request requires only a canonical request; status requires only requestId; discover takes neither."});
  }
});
export type Input = z.infer<typeof federationToolInput>;
const CAPABILITY = "federation.request";

async function canonicalInput(input: Input, store: FederationStore, connection: Awaited<ReturnType<FederationStore["connection"]>>) {
  if (!input.request) return { ...input, request: undefined };
  const request = input.request.capability === "message.send"
    ? { ...input.request, resource: await resolvePeerMessageResource(store, connection, input.request.target, input.request.resource) }
    : input.request;
  return { ...input, request: submissionSchema.parse(request) };
}

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
export async function executeFederationTool(value: Input, ctx: Pick<ToolContext, "session" | "callId"> & Partial<Pick<ToolContext, "abortSignal">>, prepareOnly = false) {
  let relayFailure: RelayOperationError | undefined;
  let peerFailure: PeerPermissionError | undefined;
  const relayOperation = async <T>(operation: () => Promise<T>): Promise<T> => {
    try { return await operation(); } catch (error) {
      if (error instanceof RelayOperationError) relayFailure = error;
      if (error instanceof PeerPermissionError) peerFailure = error;
      throw error;
    }
  };
  try {
    const initial = await binding(ctx);
    const input = await canonicalInput(federationToolInput.parse(value), initial.store, initial.connection);
    const action = await toolActionRequest(ctx, {capabilityId: CAPABILITY,
      actionClass: input.operation !== "request" || input.request?.capability === "knowledge.query" ? "read"
        : input.request?.capability === "work.request" ? "execute" : "send",
      parameters: input});
    if (action.executor.agentId !== initial.agent.id || action.trigger.kind !== "owner_chat"
      || !["primary-agent", "persistent-agent"].includes(action.executor.kind)) throw new ActionBlocked("denied", "federation_identity");
    let effective: Awaited<ReturnType<typeof effectivePeerPermission>> | undefined;
    if (input.operation === "request") {
      effective = requireEffectivePermission(await effectivePeerPermission(initial.store, initial.connection, input.request!));
      await bindPeerAction(initial.store, action.runId, action.actionKey, effective.row!, input.request!);
    }
    const authority = { evaluate: async (...args: Parameters<typeof localAuthorityProvider.evaluate>) => {
      try {
      const local = await localAuthorityProvider.evaluate(...args);
      if (local.decision === "DENY" || input.operation !== "request") return local;
      const fresh = await binding(ctx);
      effective = requireEffectivePermission(await effectivePeerPermission(fresh.store, fresh.connection, input.request!, effective!.row!.revision));
      await bindPeerAction(fresh.store, action.runId, action.actionKey, effective.row!, input.request!);
      return effective.effective === "REQUIRE_APPROVAL" ? { ...local, decision: "REQUIRE_APPROVAL" as const } : local;
      } catch (error) { if (error instanceof PeerPermissionError) peerFailure = error; throw error; }
    } };
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
        if (input.operation === "request") {
          const current = requireEffectivePermission(await effectivePeerPermission(fresh.store, fresh.connection, input.request!, effective!.row!.revision));
          await bindPeerAction(fresh.store, action.runId, action.actionKey, current.row!, input.request!);
          response = await relayOperation(() => sendExternal(fresh.store, input.request, { runId: action.runId, actionKey: action.actionKey, revision: current.row!.revision }));
        }
        else if (input.operation === "status") response = await relayOperation(() => getExternalResult(fresh.store, input.requestId!));
        else if (input.operation === "permissions") {
          response = { ...await peerReadModel(fresh.store, fresh.agent.id), currentTime: new Date().toISOString() };
        } else {
          const discovery = await relayOperation(() => new RelayClient(fresh.connection.credential).command({operation: "discover", input: {}}));
          response = {...discovery, ...await peerReadModel(fresh.store, fresh.agent.id), currentTime: new Date().toISOString()};
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
    const evidence = prepareOnly ? await new ActionGateway(initial.store.database, authority).prepare(action, adapter)
      : await new ActionGateway(initial.store.database, authority).execute(action, adapter, ctx.abortSignal);
    return { ...evidence,
      ...(!prepareOnly && input.operation === "request" && response ? {
        execution: { phase: "submitted", approvalPending: false,
          message: "This exact Action has executed and was submitted to Relay. Owner approval is no longer pending. Relay AUTHORIZED is admission status, not another approval request. Use status with the returned requestId now to retrieve delivery and the actual peer response; do not resubmit or ask for another approval." },
      } : {}),
      response: response ?? {status: "already_executed", message: "Use status to reauthorize retrieval of the request result."} };
  } catch (error) {
    // Preserve safe lifecycle causes rather than attributing them to Relay.
    if(error instanceof ActionBlocked && error.actionId.startsWith("RUN_")) {
      return {status:"denied",code:error.actionId,canEscalate:false,
        message:"The execution context is expired or unavailable. Nothing was sent. New work needs a fresh context and exact Action approval; do not retry the old Action."};
    }
    const permissionError = error instanceof PeerPermissionError ? error : peerFailure;
    if (permissionError) return { status: "denied", code: permissionError.code, canEscalate: false, message: permissionError.message };
    // Never surface transport errors, credentials, or raw provider payloads.
    if (error instanceof ActionBlocked && error.status === "awaiting_approval") {
      return {status: "awaiting_approval", code: "exact_action_approval_required", actionId: error.actionId,
        canEscalate: true, message: "Waiting for the owner's decision on this exact Action. Do not recreate or resubmit it."};
    }
    if (relayFailure && [401, 403].includes(relayFailure.status)) {
      return {status: error instanceof ActionBlocked ? error.status : "denied", code: "federation_authority_denied",
        httpStatus: relayFailure.status, canEscalate: false,
        message: "Relay denied current peer/capability/resource authority. Owner approval cannot renew or expand it. Do not retry automatically."};
    }
    return {status: error instanceof ActionBlocked ? error.status : "denied", code: "federation_unavailable_or_denied", canEscalate: false};
  }
}

/** Native Eve approval retains the original tool call in its durable input batch. */
export async function prepareFederationApproval(ctx: ApprovalContext<Input>) {
  const parsed = federationToolInput.safeParse(ctx.toolInput);
  if (!parsed.success) return "denied" as const;
  if (parsed.data.operation !== "request") return "not-applicable" as const;
  if (Date.parse(parsed.data.request!.expiresAt) <= Date.now()) return "denied" as const;
  if (parsed.data.request?.capability === "knowledge.query") {
    const {store, connection} = await binding(ctx);
    const current = await effectivePeerPermission(store, connection, parsed.data.request);
    if (current.effective === "DENY") return "denied" as const;
    if (current.effective === "ALLOW") return "not-applicable" as const;
  }
  const result = await executeFederationTool(parsed.data, ctx, true);
  if ("code" in result && (result.code?.startsWith("RUN_") || result.code?.startsWith("PEER_MESSAGE_"))) return {type:"denied" as const,reason:JSON.stringify(result)};
  if (!("actionId" in result) || !("status" in result) || result.status !== "awaiting_approval") return "denied" as const;
  const {store} = await binding(ctx);
  // A second model call cannot acquire a different call's pending approval. Nor
  // can a stale native confirmation approve a replacement approval generation.
  const rows = await store.database.query(`SELECT a.id,(p.expires_at>clock_timestamp()) AS approval_live FROM action_requests a
    JOIN task_approval_decisions p ON p.id=a.approval_id JOIN task_runs r ON r.id=a.run_id AND r.owner_id=a.owner_id
    WHERE a.owner_id=$1 AND a.id=$2 AND a.action_key=$3 AND a.approval_generation=0 AND a.attempt_count=0
      AND a.status='awaiting_approval' AND p.status='pending'
      AND r.status IN ('running','awaiting_approval') AND (r.deadline_at IS NULL OR r.deadline_at>now())`,
    [store.ownerId, result.actionId, `tool:${ctx.callId}`]);
  if(rows.length===1 && rows[0]?.approval_live===false)return {type:"denied" as const,
    reason:JSON.stringify({code:"ACTION_APPROVAL_EXPIRED",message:"The exact Action approval expired. Nothing was sent; new work requires a fresh Action approval."})};
  return rows.length === 1 ? "user-approval" as const : "denied" as const;
}

/** Read framework-generated structured decisions, never conversational prose or approvedTools. */
export function federationApprovalResponses(messages: DynamicResolveContext["messages"]) {
  const requests = new Map<string, {callId: string; input: Input}>();
  const decisions: Array<{callId: string; input: Input; approved: boolean}> = [];
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue;
    if (message.role === "assistant") {
      for (const part of message.content) {
        if (part.type !== "tool-approval-request" || part.isAutomatic === true) continue;
        const embedded = z.object({toolCall: z.object({toolCallId: z.string(), toolName: z.string(), input: z.unknown()})}).safeParse(part);
        const call = embedded.success ? embedded.data.toolCall : message.content.find(candidate => candidate.type === "tool-call" && candidate.toolCallId === part.toolCallId);
        if (!call || !("input" in call) || !("toolName" in call) || call.toolName !== "federation_request") continue;
        const parsed = federationToolInput.safeParse(call.input);
        if (parsed.success) requests.set(part.approvalId, {callId: call.toolCallId, input: parsed.data});
      }
    } else if (message.role === "tool") {
      for (const part of message.content) {
        if (part.type !== "tool-approval-response") continue;
        const request = requests.get(part.approvalId);
        if (request) { decisions.push({...request, approved: part.approved}); requests.delete(part.approvalId); }
      }
    }
  }
  return decisions;
}

/** Bridge the owner's native exact-call decision to canonical Action authority.
 * step.started runs after Eve resolves the durable input batch, before SDK tool
 * continuation. User messages cannot supply assistant/tool protocol parts.
 */
export async function resolveFederationApprovals(ctx: DynamicResolveContext) {
  const responses = federationApprovalResponses(ctx.messages);
  const resolved: string[] = [];
  if (!responses.length) return resolved;
  const {agent, store, connection} = await binding(ctx);
  for (const response of responses) {
    let input: Awaited<ReturnType<typeof canonicalInput>>;
    try { input = await canonicalInput(response.input, store, connection); }
    catch (error) { if (error instanceof PeerPermissionError) continue; throw error; }
    if (input.operation !== "request") continue;
    if (Date.parse(input.request!.expiresAt) <= Date.now()) continue;
    const rows = await store.database.query(`SELECT a.*,p.id AS pending_approval_id,p.status AS approval_status FROM action_requests a
      JOIN task_approval_decisions p ON p.id=a.approval_id AND p.owner_id=a.owner_id AND p.binding_hash=a.parameter_hash AND p.task_id=a.run_id
        AND p.capability_id=a.capability_id AND p.action_class=a.action_class
      JOIN task_run_sessions s ON s.task_id=a.run_id JOIN task_runs r ON r.id=a.run_id AND r.owner_id=a.owner_id
      WHERE a.owner_id=$1 AND s.session_id=$2 AND s.is_current AND a.action_key=$3 AND a.capability_id='federation.request'
        AND a.status='awaiting_approval' AND a.approval_generation=0 AND a.attempt_count=0
        AND p.status IN ('pending','approved','denied') AND p.expires_at>now() AND p.agent_id=$4
        AND r.status IN ('running','awaiting_approval') AND (r.deadline_at IS NULL OR r.deadline_at>now())`,
      [store.ownerId, ctx.session.id, `tool:${response.callId}`, agent.id]);
    if (rows.length !== 1) continue;
    const row = rows[0]!;
    if (row.pending_approval_id !== approvalRequestId({ownerId: store.ownerId, taskId: String(row.run_id), requestKey: `${row.id}:0:0`})) continue;
    const target = {provider: "relay", account: connection.agentId,
      resource: JSON.stringify([input.request!.target, input.request!.capability, input.request!.resource]), environment: relayOrigin()};
    const executor = {kind: agent.isPrimary ? "primary-agent" : "persistent-agent", agentId: agent.id};
    const trigger = {kind: "owner_chat", id: ctx.session.id};
    const actionClass = input.request!.capability === "knowledge.query" ? "read" : input.request!.capability === "work.request" ? "execute" : "send";
    const hash = approvalBinding({taskId: String(row.run_id), capabilityId: CAPABILITY, resource: JSON.stringify(canonicalActionValue(target)),
      action: actionClass, parameters: {payload: input, target, executor, trigger, computer: null}});
    if (hash !== row.parameter_hash || row.action_class !== actionClass) continue;
    if (row.approval_status === "pending") {
      await decideApproval({ownerId: store.ownerId, id: String(row.pending_approval_id), bindingHash: hash,
        decision: response.approved ? "approved" : "denied", decidedBy: store.ownerId});
    }
    if (response.approved && row.approval_status !== "denied") resolved.push(response.callId);
  }
  return resolved;
}
