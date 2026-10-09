// Local qualification transport only. No network requests can reach a model provider.
import { appendFileSync } from "node:fs";
const originalFetch = globalThis.fetch;
const usage = {
  inputTokens: { total: 12, noCache: 12, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  if (process.env.JEV_QA_NETWORK_LOG)
    appendFileSync(
      process.env.JEV_QA_NETWORK_LOG,
      `${url.hostname} ${url.pathname}\n`,
    );
  if (headers.has("neon-connection-string")) {
    if (
      !process.env.DATABASE_URL ||
      headers.get("neon-connection-string") !== process.env.DATABASE_URL ||
      !process.env.DATABASE_URL.includes("@jev-db.local:")
    )
      throw new Error("Non-qualification database forbidden");
    return originalFetch(
      `http://127.0.0.1:${process.env.JEV_QA_PROXY_PORT ?? 55450}/sql`,
      { ...init, headers },
    );
  }
  if (url.hostname === "ai-gateway.vercel.sh") {
    if (url.pathname.endsWith("/evaluation-model"))
      throw new Error("Live Jev forbidden during Stage 1");
    if (url.pathname.endsWith("/config"))
      return Response.json({
        models: [
          {
            id: "anthropic/claude-sonnet-5",
            name: "Local qualification model",
            modelType: "language",
            specification: {
              specificationVersion: "v4",
              provider: "gateway",
              modelId: "anthropic/claude-sonnet-5",
            },
            pricing: { input: "0", output: "0" },
          },
        ],
      });
    if (url.pathname.endsWith("/language-model")) {
      if (headers.get("ai-language-model-streaming") === "true") {
        const parts = [
          { type: "stream-start", warnings: [] },
          {
            type: "response-metadata",
            id: "fixture-response",
            modelId: "anthropic/claude-sonnet-5",
            timestamp: new Date().toISOString(),
          },
          { type: "text-start", id: "text-1" },
          {
            type: "text-delta",
            id: "text-1",
            delta:
              "Local qualification response. No external model was called.",
          },
          { type: "text-end", id: "text-1" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: "stop" },
            usage,
          },
        ];
        return new Response(
          parts.map((part) => `data: ${JSON.stringify(part)}\n\n`).join(""),
          { headers: { "content-type": "text/event-stream" } },
        );
      }
      return Response.json({
        content: [
          {
            type: "text",
            text: "Local qualification response. No external model was called.",
          },
        ],
        finishReason: { unified: "stop", raw: "stop" },
        usage,
        warnings: [],
      });
    }
    throw new Error("Unsupported qualification Gateway request");
  }
  if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    return originalFetch(input, init);
  throw new Error(
    `External network disabled during local qualification: ${url.hostname}`,
  );
};
