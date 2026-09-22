import { ActionBlocked, ActionGateway, consumeActionAuthority, localAuthorityProvider } from "../action-gateway.ts";
import { effectiveCapability, getAgent } from "../agents.ts";
import { completeDelegatedTask, createDelegatedTask, transitionTask } from "../task-runs.ts";
import { submissionSchema, type Submission } from "./contracts.ts";
import { currentPeerPermission, bindPeerAction, PeerPermissionError } from "./peer-permissions.ts";
import { FederationStore } from "./store.ts";
import { decryptSecret, type Envelope } from "./transport.ts";

export function incomingSubmission(envelope: Envelope): Submission {
  return submissionSchema.parse({ target: envelope.target.address, capability: envelope.capability, resource: envelope.resource,
    idempotencyKey: envelope.idempotencyKey, expiresAt: envelope.expiresAt, payload: envelope.payload,
    ...(envelope.conversationId ? { conversationId: envelope.conversationId } : {}) });
}

export async function incomingPeerPermission(store: FederationStore, envelope: Envelope, revision?: number) {
  const connection = await store.connection();
  const agent = await getAgent(store.ownerId, connection.localAgentId, store.database);
  if (!agent || agent.status !== "active" || !effectiveCapability(agent, "federation.request").allowed ||
    envelope.target.ownerId !== connection.ownerId || envelope.target.agentId !== connection.agentId ||
    envelope.target.address !== connection.address || Date.parse(envelope.expiresAt) <= Date.now())
    throw new PeerPermissionError("PEER_LOCAL_AUTHORITY_DENIED", "Current local Agent authority does not allow this incoming request.");
  const capability = envelope.capability === "message.send" ? "message.receive" : envelope.capability === "artifact.share" ? "artifact.receive" : envelope.capability;
  const permission = await currentPeerPermission(store, connection, `relay://${envelope.caller.ownerId}/${envelope.caller.agentId}`, capability, envelope.resource, revision);
  if (permission.policy === "DENY") throw new PeerPermissionError(permission.code, "Current peer policy denies this incoming request.");
  const request = incomingSubmission(envelope);
  if (request.capability === "knowledge.query" && (!permission.scope || request.payload.requestedTypes.some(t => !permission.scope.recordTypes.includes(t)) ||
    (permission.scope.topics.length && (!request.payload.topics.length || request.payload.topics.some(t => !permission.scope.topics.includes(t))))))
    throw new PeerPermissionError("PEER_RESOURCE_SCOPE_DENIED", "Published Knowledge scope does not allow this request.");
  return { ...permission, agent, connection, request };
}

/** A reply exception belongs only to the exact outgoing request and participant pair. */
export async function correlatedReply(store: FederationStore, envelope: Envelope) {
  if (envelope.capability !== "message.send") return false;
  const request = incomingSubmission(envelope);
  if (request.capability !== "message.send" || !request.payload.replyTo || !envelope.conversationId) return false;
  const [parent] = await store.database.query(`SELECT envelope_encrypted FROM myeve_relay_requests WHERE owner_id=$1 AND request_id=$2
    AND direction='outgoing' AND capability='message.send' AND sender_owner_id=$3 AND sender_agent_id=$4
    AND conversation_id=$5 AND state IN ('accepted','completed')`,
  [store.ownerId, request.payload.replyTo, envelope.target.ownerId, envelope.target.agentId, envelope.conversationId]);
  if (!parent) return false;
  const original = submissionSchema.safeParse(decryptSecret(store.ownerId, parent.envelope_encrypted));
  return original.success && original.data.capability === "message.send" && original.data.target === `relay://${envelope.caller.ownerId}/${envelope.caller.agentId}` && original.data.conversationId === envelope.conversationId;
}

export async function executeIncomingPermission<T>(store: FederationStore, envelope: Envelope, effect: (revalidate: () => Promise<void>) => Promise<T>) {
  try {
    const initial = await incomingPeerPermission(store, envelope);
    const [stored] = await store.database.query("SELECT local_run_id FROM myeve_relay_requests WHERE owner_id=$1 AND request_id=$2", [store.ownerId, envelope.id]);
    let runId = stored?.local_run_id as string | undefined;
    if (!runId) {
      const run = await createDelegatedTask({ ownerId: store.ownerId, agentId: initial.agent.id, sessionId: `relay-session-${envelope.id}`,
        title: `Incoming ${envelope.capability}`, objective: "Process one exact authenticated peer request within its current scope.",
        expectedOutput: "A bounded protocol response", maxDurationSeconds: Math.min(300, initial.agent.limits.maxRuntimeSeconds),
        maxModelSteps: 1, maxEstimatedCostUsd: 0, maxWorkers: 1 });
      runId = run.id;
      await store.database.query("UPDATE myeve_relay_requests SET local_run_id=$3 WHERE owner_id=$1 AND request_id=$2", [store.ownerId, envelope.id, runId]);
    }
    const stableRunId = runId;
    await bindPeerAction(store, stableRunId, envelope.id, initial.row!, initial.request);
    const authority = { evaluate: async (action: Parameters<typeof localAuthorityProvider.evaluate>[0], target: Parameters<typeof localAuthorityProvider.evaluate>[1]) => {
      const current = await incomingPeerPermission(store, envelope, initial.row!.revision);
      await bindPeerAction(store, stableRunId, envelope.id, current.row!, current.request);
      const reply = await correlatedReply(store, envelope);
      return localAuthorityProvider.evaluate(action, target, {
        allowedCapabilities: ["federation.request"], maximumRisk: "low",
        allowedTargets: [{ capabilityId: "federation.request", provider: "relay", account: current.connection.agentId,
          resource: JSON.stringify([envelope.caller.ownerId, envelope.caller.agentId, envelope.capability, envelope.resource]) }],
        requiresApprovalFor: current.policy === "REQUIRE_APPROVAL" && !reply ? ["federation.request"] : [],
      });
    } };
    let result: T | undefined;
    const outcome = await new ActionGateway(store.database, authority).execute({ ownerId: store.ownerId, runId: stableRunId, actionKey: envelope.id,
      capabilityId: "federation.request", actionClass: "read", executor: { kind: "persistent-agent", agentId: initial.agent.id },
      trigger: { kind: "relay_request", id: envelope.id }, parameters: { request: initial.request, caller: envelope.caller } }, {
      resolveTarget: async () => ({ provider: "relay", account: initial.connection.agentId,
        resource: JSON.stringify([envelope.caller.ownerId, envelope.caller.agentId, envelope.capability, envelope.resource]) }),
      execute: async (parameters, authorized) => {
        await consumeActionAuthority(authorized, parameters, "federation.request");
        const revalidate = async () => {
          const current = await incomingPeerPermission(store, envelope, initial.row!.revision);
          await bindPeerAction(store, stableRunId, envelope.id, current.row!, current.request);
        };
        await revalidate();
        result = await effect(revalidate);
        return { completed: true };
      },
      verify: async () => ({ verified: true, receipt: { requestId: envelope.id } }),
    });
    if (result === undefined) throw new Error("Incoming response requires recovery.");
    const [run] = await store.database.query("SELECT status FROM task_runs WHERE owner_id=$1 AND id=$2", [store.ownerId, stableRunId]);
    if (run.status === "awaiting_approval") await transitionTask(store.ownerId, stableRunId, "running", "owner", "Exact incoming request approved");
    await completeDelegatedTask({ ownerId: store.ownerId, taskId: stableRunId,
      summary: "Authenticated peer request completed within its current permission scope.", evidenceSummary: `Request ${envelope.id}; Action ${outcome.actionId}.` });
    return { status: "COMPLETED" as const, result };
  } catch (error) {
    if (error instanceof ActionBlocked && error.status === "awaiting_approval") return { status: "REQUIRE_APPROVAL" as const };
    if (error instanceof PeerPermissionError || error instanceof ActionBlocked && error.status === "denied") return { status: "REJECTED" as const };
    throw error;
  }
}
