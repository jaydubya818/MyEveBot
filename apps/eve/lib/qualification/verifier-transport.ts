import { createServer, type IncomingMessage, type Server } from "node:http";

/**
 * Minimal Node transport for the verifier handler. Unlike the static server's adapter it forwards bounded POST bodies into the Request.
 *  - Binds ONLY exact IPv4 loopback (the host is not configurable); public exposure (TLS, domain, tunnel, tester access) is a separate protected owner action.
 *  - The request body is read at most `maxBodyBytes` (declared or streamed); anything larger is refused with 413 and the connection is destroyed.
 *  - The request URL is a fixed loopback origin plus the request path, so a Host header or absolute-form target cannot redirect routing.
 *  - A client that disconnects mid-request never cancels the handler: the single durable evaluation continues and its result is read later.
 *  - close() stops accepting (new requests get 503), then waits for EVERY in-flight handler call, including those of already-disconnected clients,
 *    before it force-closes sockets. Connections are never dropped while an evaluation they started is still running.
 */
export class VerifierTransportRefused extends Error { constructor(readonly code: string) { super(code); } }
export type VerifierListening = { origin: string; close(): Promise<void> };

const HOST = "127.0.0.1";
const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);

async function readBounded(req: IncomingMessage, max: number): Promise<Buffer | null> {
  const declared = req.headers["content-length"];
  if (declared !== undefined && (!/^\d{1,9}$/.test(declared) || Number(declared) > max)) return null;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > max) return null;
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

export async function listenVerifierLoopback(handler: (request: Request) => Promise<Response>, options: { port: number; maxBodyBytes: number }): Promise<VerifierListening> {
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) throw new VerifierTransportRefused("QDEV_VERIFIER_PORT");
  if (!Number.isInteger(options.maxBodyBytes) || options.maxBodyBytes < 1 || options.maxBodyBytes > 1_048_576) throw new VerifierTransportRefused("QDEV_VERIFIER_BODY_LIMIT");
  const active = new Set<Promise<void>>();
  let closing = false;
  const server: Server = createServer((req, res) => {
    const task = serve(req, res).finally(() => active.delete(task));
    active.add(task);
  });
  async function serve(req: IncomingMessage, res: import("node:http").ServerResponse): Promise<void> {
    const finish = (status: number, body = "") => { if (!res.headersSent) res.writeHead(status, { "cache-control": "no-store", ...(body ? { "content-type": "application/json" } : {}) }); res.end(body); };
    try {
      if (closing) return finish(503, '{"error":"QDEV_VERIFIER_SHUTTING_DOWN"}');
      const path = req.url ?? "/";
      if (!path.startsWith("/") || path.startsWith("//")) return finish(400, '{"error":"QDEV_VERIFIER_REQUEST"}');
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) if (typeof value === "string") headers.set(name, value);
      let body: Buffer | null = null;
      if (BODY_METHODS.has(req.method ?? "")) {
        body = await readBounded(req, options.maxBodyBytes);
        if (!body) { finish(413, '{"error":"QDEV_VERIFIER_REQUEST_TOO_LARGE"}'); req.destroy(); return; }
      }
      const response = await handler(new Request("http://" + HOST + path, { method: req.method, headers, ...(body ? { body: new Uint8Array(body) } : {}) }));
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 65_536) return finish(502, '{"error":"QDEV_VERIFIER_RESPONSE"}');
      if (!res.headersSent) res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(bytes);
    } catch { finish(500, '{"error":"QDEV_VERIFIER_UNAVAILABLE"}'); }
  }
  server.headersTimeout = 10_000; server.requestTimeout = 10_000; server.keepAliveTimeout = 5_000; server.maxHeadersCount = 50; server.maxConnections = 16;
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(options.port, HOST, () => resolve()); });
  const address = server.address() as { port: number };
  const close = async () => {
    closing = true;
    const stopped = new Promise<void>(resolve => server.close(() => resolve()));
    server.closeIdleConnections?.();
    while (active.size) await Promise.allSettled([...active]);
    server.closeAllConnections?.();
    await stopped;
  };
  return { origin: `http://${HOST}:${address.port}`, close };
}
