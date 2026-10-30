import type { RelayTool, RelayTransport } from "./relay-tools.ts";
import type { RelayAction } from "./relay-grant.ts";

/**
 * MyEve client for Relay's private-preview-safe tool path: HTTPS `/mcp` with
 * `Authorization: Bearer rly_...` (initialize / tools/list / tools/call). Relay
 * reports capability denials as JSON-RPC errors with HTTP 200, so success is decided
 * by the JSON-RPC body, never by `response.ok` alone. It never targets `/api/v2/mcp`
 * or federation. The credential is read per call from the host and never appears in
 * errors. Disabled by default: no I/O happens unless `enabled` is true.
 */
export class RelayMcpError extends Error {
  constructor(readonly code: string) { super(code); }
}
export type RelayToolMap = Record<string, RelayAction["kind"]>;
export type RelayMcpConfig = {
  enabled: boolean; origin: string; credential: () => Promise<string>;
  /** Host-reviewed map from Relay tool name to the action kind it performs. Unmapped tools are invisible. */
  tools: RelayToolMap; fetcher?: typeof fetch; timeoutMs?: number; maxBytes?: number;
};

export class RelayMcpTransport implements RelayTransport {
  private initialized = false;
  private nextId = 1;
  constructor(private readonly config: RelayMcpConfig) {
    const url = new URL(config.origin);
    if (url.protocol !== "https:" || url.origin !== config.origin || url.username || url.password) throw new RelayMcpError("QDEV_RELAY_MCP_CONFIGURATION");
  }
  private async rpc(method: string, params?: Record<string, unknown>): Promise<any> {
    if (!this.config.enabled) throw new RelayMcpError("QDEV_RELAY_MCP_DISABLED");
    const id = this.nextId++;
    let response: Response;
    try {
      response = await (this.config.fetcher ?? fetch)(new URL("/mcp", this.config.origin), {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(this.config.timeoutMs ?? 15000),
        headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${await this.config.credential()}` },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }),
      });
    } catch { throw new RelayMcpError("QDEV_RELAY_UNAVAILABLE"); }
    if (response.status === 401) throw new RelayMcpError("QDEV_RELAY_CREDENTIAL");
    if (!response.ok) throw new RelayMcpError("QDEV_RELAY_UNAVAILABLE");
    const text = await response.text();
    if (text.length > (this.config.maxBytes ?? 262144)) throw new RelayMcpError("QDEV_RELAY_RESPONSE_TOO_LARGE");
    let body: any;
    try { body = JSON.parse(text); } catch { throw new RelayMcpError("QDEV_RELAY_INVALID_RESPONSE"); }
    // Fail closed: exact request id, exactly one of result/error, nothing else.
    const invalid = () => new RelayMcpError("QDEV_RELAY_INVALID_RESPONSE");
    if (!body || typeof body !== "object" || Array.isArray(body) || body.jsonrpc !== "2.0" || body.id !== id) throw invalid();
    const hasResult = Object.hasOwn(body, "result"), hasError = Object.hasOwn(body, "error");
    if (hasResult === hasError || Object.keys(body).some(k => !["jsonrpc", "id", "result", "error"].includes(k))) throw invalid();
    if (hasError) {
      if (!body.error || typeof body.error !== "object" || Array.isArray(body.error)) throw invalid();
      const raw = String(body.error.data?.code ?? body.error.code ?? "ERROR");
      throw new RelayMcpError("QDEV_RELAY_" + (/^[A-Z_]{1,40}$/.test(raw) ? raw : "ERROR"));
    }
    if (!body.result || typeof body.result !== "object" || Array.isArray(body.result)) throw invalid();
    return body.result;
  }
  private async ready() {
    if (this.initialized) return;
    const init = await this.rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "myeve-qdev", version: "1" } });
    if (typeof init.protocolVersion !== "string") throw new RelayMcpError("QDEV_RELAY_INVALID_RESPONSE");
    this.initialized = true;
  }
  async discover(): Promise<RelayTool[]> {
    await this.ready();
    const result = await this.rpc("tools/list");
    if (!Array.isArray(result?.tools)) throw new RelayMcpError("QDEV_RELAY_INVALID_RESPONSE");
    return result.tools.filter((t: any) => typeof t?.name === "string" && Object.hasOwn(this.config.tools, t.name))
      .map((t: any) => ({ name: t.name as string, kind: this.config.tools[t.name] }));
  }
  async execute(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!Object.hasOwn(this.config.tools, name)) throw new RelayMcpError("QDEV_RELAY_TOOL_UNMAPPED");
    await this.ready();
    const result = await this.rpc("tools/call", { name, arguments: args });
    if (result.isError === true) throw new RelayMcpError("QDEV_RELAY_TOOL_ERROR");
    if (!Array.isArray(result.content)) throw new RelayMcpError("QDEV_RELAY_INVALID_RESPONSE");
    return result.content;
  }
}
