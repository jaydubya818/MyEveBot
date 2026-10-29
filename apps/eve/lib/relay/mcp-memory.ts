import { createHash } from "node:crypto";
import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import type { ToolContext } from "eve/tools";
import { z } from "zod";
import { toolActionRequest } from "../../agent/lib/action-context.ts";
import { getAgent } from "../agents.ts";
import { ActionBlocked, ActionGateway, consumeActionAuthority, consumeRelayMemoryAuthority, type ActionAdapter, type ActionRequest, type AuthorizedAction } from "../action-gateway.ts";
import { canonicalActionValue } from "../approvals.ts";
import { denyExternalAlphaPaidPath } from "../external-alpha/paid-paths.ts";
import { qualificationFetch } from "../qualification/client.ts";
import { relayOrigin } from "./client.ts";
import { FederationStore } from "./store.ts";

// Dormant authored operations only. These capabilities are deliberately NOT
// registered/granted, and no tool, connection or route exposes this module.
const READ_CAPABILITY = "relay.memory.read";
const WRITE_CAPABILITY = "relay.memory.write";
const TOTAL_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 3_000;
const MAX_RESPONSE_BYTES = 256 * 1024;
const identifier = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
const operationSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("add"), content: z.string().trim().min(1).max(8000) }).strict(),
  z.object({ operation: z.literal("get"), id: identifier }).strict(),
  z.object({ operation: z.literal("list"), limit: z.number().int().min(1).max(20) }).strict(),
]);
type MemoryOperation = z.infer<typeof operationSchema>;
type MemoryResult = Awaited<ReturnType<MCPClient["callTool"]>>;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(canonicalActionValue(value))).digest("hex");
const capability = (operation: MemoryOperation) => operation.operation === "add" ? WRITE_CAPABILITY : READ_CAPABILITY;
const unavailable = () => new ActionBlocked("denied", "relay_memory_unavailable");

/** Canonical server-side ToolContext only; identity never comes from arguments. */
export async function relayMemoryRequest(ctx: Pick<ToolContext, "session" | "callId">, input: unknown): Promise<ActionRequest> {
  denyExternalAlphaPaidPath("relay-mcp-memory");
  const operation = operationSchema.parse(input);
  const principal = ctx?.session?.auth.current;
  if (principal?.authenticator !== "myeve-web-session" || principal.issuer !== "myeve") throw unavailable();
  return toolActionRequest(ctx, { capabilityId: capability(operation), actionClass: operation.operation === "add" ? "write" : "read", parameters: operation });
}

async function binding(action: ActionRequest) {
  const origin = relayOrigin();
  // Unlike the legacy federation development transport, this operation has no
  // HTTP exception. Local qualification uses TLS and a child-process test CA.
  if (new URL(origin).protocol !== "https:") throw unavailable();
  const connection = await new FederationStore(action.ownerId).connection();
  const agent = await getAgent(action.ownerId, action.executor.agentId);
  if (!agent || agent.status !== "active" || connection.localOwnerId !== action.ownerId || connection.localAgentId !== agent.id ||
      connection.issuer !== origin || connection.address !== `relay://${connection.ownerId}/${connection.agentId}` ||
      !connection.ownerId || !connection.agentId || !connection.keyId || !connection.keyVersion || !connection.publicKey ||
      !connection.credential || /[\r\n]/.test(connection.credential)) throw unavailable();
  // No owner session/cookie or remote instructions are retained in this binding.
  const identity = { origin, localOwnerId: action.ownerId, localAgentId: agent.id, agentRevision: agent.updatedAt,
    ownerId: connection.ownerId, agentId: connection.agentId, address: connection.address,
    keyId: connection.keyId, keyVersion: connection.keyVersion, publicKey: connection.publicKey,
    credentialHash: hash(connection.credential) };
  return { origin, credential: connection.credential, digest: hash(identity), account: JSON.stringify([connection.ownerId, connection.agentId]) };
}

/** Public SDK transport, scoped to one Action. JSON responses are intentionally
 * required for these selected Relay operations; SSE-only peers fail closed. */
async function callMemory(initial: Awaited<ReturnType<typeof binding>>, operation: MemoryOperation, authority: AuthorizedAction,
  revalidate: () => Promise<void>): Promise<MemoryResult> {
  const endpoint = `${initial.origin}/mcp`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOTAL_TIMEOUT_MS);
  const signal = authority.signal ? AbortSignal.any([controller.signal, authority.signal]) : controller.signal;
  const seenRequests = new Set<string>();
  let client: MCPClient | undefined;
  const abortable = <T>(promise: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const abort = () => reject(unavailable());
    if (signal.aborted) { void promise.catch(() => {}); reject(unavailable()); return; }
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
  try {
    const pendingClient = createMCPClient({ maxRetries: 0, clientName: "myeve-relay-memory", transport: {
      type: "http", url: endpoint, redirect: "error", terminateSessionOnClose: false,
      fetch: async (input, init) => {
        if (String(input) !== endpoint || !init || !["GET", "POST"].includes(init.method ?? "")) throw unavailable();
        // The SDK's optional inbound SSE reader is unnecessary for this bounded
        // JSON operation. A local 405 prevents background reconnect traffic.
        if (init.method === "GET") return new Response(null, { status: 405 });
        const message = JSON.parse(String(init.body));
        const allowed = ["initialize", "notifications/initialized", "tools/list", "tools/call"];
        if (!allowed.includes(message.method) || seenRequests.has(message.method)) throw unavailable();
        seenRequests.add(message.method);
        if (message.method === "tools/call" && message.params?.name !== `relay_memory_${operation.operation}`) throw unavailable();
        await abortable(revalidate());
        signal.throwIfAborted();
        const headers = new Headers();
        const proposed = new Headers(init.headers);
        for (const name of ["content-type", "accept", "mcp-protocol-version", "mcp-session-id"]) {
          const value = proposed.get(name); if (value) headers.set(name, value);
        }
        headers.set("authorization", `Bearer ${initial.credential}`);
        const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS), ...(init.signal ? [init.signal] : [])]);
        const response = await qualificationFetch(endpoint, { method: "POST", body: init.body, headers,
          credentials: "omit", redirect: "error", signal: requestSignal });
        if (message.id !== undefined && response.status === 202) { await response.body?.cancel(); throw unavailable(); }
        if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw unavailable(); }
        const declared = response.headers.get("content-length");
        if ((declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) ||
            (response.body && !response.headers.get("content-type")?.includes("application/json"))) {
          await response.body?.cancel(); throw unavailable();
        }
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        const reader = response.body?.getReader();
        try {
          if (reader) for (;;) {
            const next = await reader.read(); if (next.done) break;
            bytes += next.value.byteLength;
            if (bytes > MAX_RESPONSE_BYTES) { await reader.cancel(); throw unavailable(); }
            chunks.push(next.value);
          }
        } finally { reader?.releaseLock(); }
        const body = Buffer.concat(chunks);
        if (message.id !== undefined) {
          // The SDK cannot cancel an unresolved initialize request. A JSON-only
          // peer must answer this exact request, rather than acknowledge it with
          // 202 or return an unrelated id that leaves initialization pending.
          const reply = JSON.parse(body.toString());
          if (reply.jsonrpc !== "2.0" || reply.id !== message.id || !("result" in reply || "error" in reply)) throw unavailable();
        }
        return new Response([204, 205, 304].includes(response.status) ? null : body, { status: response.status, headers: response.headers });
      },
    } });
    void pendingClient.then(late => { if (signal.aborted) void late.close().catch(() => {}); }, () => {});
    client = await abortable(pendingClient);
    if (client.serverInfo.name !== "relay") throw unavailable();
    const discovered = await abortable(client.listTools({ options: { signal, timeout: REQUEST_TIMEOUT_MS, maxTotalTimeout: REQUEST_TIMEOUT_MS } }));
    const toolName = `relay_memory_${operation.operation}`;
    if (!discovered.tools.some(tool => tool.name === toolName)) throw unavailable();
    await abortable(revalidate());
    const args = operation.operation === "add" ? { content: operation.content, type: "FACT", scope: "AGENT_PRIVATE" } :
      operation.operation === "get" ? { id: operation.id } : { limit: operation.limit };
    const result = await abortable(client.callTool({ name: toolName, arguments: args,
      options: { signal, timeout: REQUEST_TIMEOUT_MS, maxTotalTimeout: REQUEST_TIMEOUT_MS } }));
    if (result.isError === true) throw unavailable();
    return result;
  } catch { throw new Error("Relay memory result is unavailable; verify before retrying."); }
  finally {
    controller.abort(); clearTimeout(timer);
    await client?.close().catch(() => {});
  }
}

/** Adapter effects still require the gateway's private one-use durable handles.
 * A fabricated Action/AuthorizedAction cannot authorize a transport call. */
export function relayMemoryAdapter(action: ActionRequest): ActionAdapter<MemoryResult> {
  denyExternalAlphaPaidPath("relay-mcp-memory");
  const operation = operationSchema.parse(action.parameters);
  if (action.capabilityId !== capability(operation) || action.actionClass !== (operation.operation === "add" ? "write" : "read")) throw unavailable();
  let initial: Awaited<ReturnType<typeof binding>> | undefined;
  const current = async () => {
    const fresh = await binding(action);
    if (!initial || fresh.digest !== initial.digest) throw unavailable();
  };
  const receipt = (result: MemoryResult) => ({ operation: operation.operation, status: "completed", resultHash: hash(result) });
  return {
    resolveTarget: async () => {
      initial = await binding(action);
      return { provider: "relay-mcp", account: initial.account, resource: `${operation.operation}:${initial.digest}`, environment: "HTTPS" };
    },
    execute: async (parameters, authority) => {
      denyExternalAlphaPaidPath("relay-mcp-memory");
      await consumeActionAuthority(authority, parameters, capability(operation));
      if (!initial || hash(parameters) !== hash(operation)) throw unavailable();
      const revalidateAuthority = await consumeRelayMemoryAuthority(authority, parameters);
      const revalidate = async () => { await revalidateAuthority(); await current(); };
      await revalidate();
      return callMemory(initial, operation, authority, revalidate);
    },
    receipt,
    verify: async result => ({ verified: result.isError !== true, receipt: receipt(result) }),
  };
}

/** Future qualified caller entry point. Default canonical capability evaluation
 * denies the unregistered capability. No registry/Agent/alpha authority is added. */
export async function executeRelayMemory(ctx: Pick<ToolContext, "session" | "callId" | "abortSignal">, input: unknown) {
  denyExternalAlphaPaidPath("relay-mcp-memory");
  const action = await relayMemoryRequest(ctx, input);
  const adapter = relayMemoryAdapter(action);
  let result: MemoryResult | null = null;
  const outcome = await new ActionGateway().execute(action, { ...adapter, execute: async (parameters, authority) => {
    result = await adapter.execute(parameters, authority); return result;
  } }, ctx.abortSignal);
  // Completed Action replays never resend; private content is not stored in the
  // receipt. A null result explicitly means no fresh result was obtained.
  return { ...outcome, result };
}
