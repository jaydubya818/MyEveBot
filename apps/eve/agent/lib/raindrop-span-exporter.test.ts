import { createTraceState } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import { RaindropSpanExporter } from "./raindrop-span-exporter";

const baseline = JSON.parse(readFileSync(new URL("../../test/fixtures/raindrop-legacy-span-wire.json", import.meta.url), "utf8")) as {
  generic: { body: string }; transformed: { body: string };
};
afterEach(() => vi.unstubAllEnvs());
function span() {
  const context = { traceId: "11111111111111111111111111111111", spanId: "2222222222222222",
    traceFlags: 1, traceState: createTraceState("fixture=preserved") };
  return {
    name: "synthetic-model-call", kind: 2, spanContext: () => context,
    parentSpanContext: { traceId: context.traceId, spanId: "3333333333333333", traceFlags: 1 },
    startTime: [1792771200, 123000000], endTime: [1792771201, 456000000],
    duration: [1, 333000000], ended: true, status: { code: 2, message: "Synthetic failure" },
    attributes: { "raindrop.event_id": "synthetic-event", "raindrop.convo_id": "synthetic-conversation",
      "synthetic.boolean": true, "synthetic.count": 7 },
    events: [{ name: "exception", time: [1792771201, 0], attributes: { "exception.message": "Synthetic failure" }, droppedAttributesCount: 1 }],
    links: [{ context: { traceId: "44444444444444444444444444444444", spanId: "5555555555555555", traceFlags: 1 },
      attributes: { "eve.link.type": "agent.dispatch" }, droppedAttributesCount: 2 }],
    resource: resourceFromAttributes({ "service.name": "synthetic-eve", "synthetic.resource": "preserved" }),
    instrumentationScope: { name: "ai", version: "7-fixture", schemaUrl: "https://example.invalid/schema" },
    droppedAttributesCount: 3, droppedEventsCount: 4, droppedLinksCount: 5,
  };
}
async function withCollector(run: (fixture: {
  exporter: RaindropSpanExporter; requests: Buffer[];
  respond: (status: number | "hang") => void;
}) => Promise<void>, timeoutMillis = 30_000): Promise<void> {
  const requests: Buffer[] = [];
  let response: number | "hang" = 200;
  const server = createServer(async (req, res) => {
    expect(req.method).toBe("POST"); expect(req.url).toBe("/v1/traces");
    expect(req.headers.authorization).toBe("Bearer synthetic-public-wire-only");
    expect(req.headers["content-type"]).toBe("application/x-protobuf");
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    requests.push(Buffer.concat(chunks));
    if (response === "hang") return;
    res.writeHead(response, { "content-type": "application/x-protobuf" }); res.end();
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Missing owned collector address");
  const exporter = new RaindropSpanExporter("synthetic-public-wire-only", `http://127.0.0.1:${address.port}/v1/`, timeoutMillis);
  try { await run({ exporter, requests, respond: status => { response = status; } }); }
  finally {
    await exporter.shutdown(); server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}
async function exported(exporter: RaindropSpanExporter, spans: readonly unknown[]) {
  return new Promise<{ code: number; error?: Error }>(resolve => exporter.export(spans, resolve));
}

it("preserves the legacy public processor's complete synthetic OTLP bytes, including exception, links, kind, resource and scope", async () => {
  await withCollector(async ({ exporter, requests }) => {
    expect((await exported(exporter, [span()])).code).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.toString("base64")).toBe(baseline.generic.body);
  });
});

it("retains the legacy AI attribute/name mapping without mutating another destination's span", async () => {
  await withCollector(async ({ exporter, requests }) => {
    const original = { ...span(), name: "ai.generateText.doGenerate", attributes: {
      ...span().attributes, "ai.response.text": "Synthetic output",
      "ai.prompt.messages": JSON.stringify([{ role: "user", content: "Synthetic input" }]),
      "ai.usage.promptTokens": 12, "ai.usage.completionTokens": 8, "ai.model.provider": "openai.chat",
    } };
    const attributes = { ...original.attributes };
    Object.freeze(original); Object.freeze(original.attributes);
    expect((await exported(exporter, [original])).code).toBe(0);
    expect(requests[0]!.toString("base64")).toBe(baseline.transformed.body);
    expect(original.name).toBe("ai.generateText.doGenerate");
    expect(original.attributes).toEqual(attributes);
  });
});

it("keeps nonadmitted instrumentation scopes out of this destination", async () => {
  await withCollector(async ({ exporter, requests }) => {
    expect((await exported(exporter, [{ ...span(), instrumentationScope: { name: "synthetic-unregistered-scope" } }])).code).toBe(0);
    expect(requests).toHaveLength(0);
  });
});

it("preserves server deployment provenance and existing explicit span metadata without changing other sinks", async () => {
  const deploymentSha = "a".repeat(40), explicitSha = "b".repeat(40);
  vi.stubEnv("VERCEL", "1"); vi.stubEnv("VERCEL_GIT_COMMIT_SHA", deploymentSha);
  await withCollector(async ({ exporter, requests }) => {
    const original = span();
    expect((await exported(exporter, [original])).code).toBe(0);
    expect(requests[0]?.includes(Buffer.from("raindrop.app.commit_sha"))).toBe(true);
    expect(requests[0]?.includes(Buffer.from(deploymentSha))).toBe(true);
    expect(original.attributes).not.toHaveProperty("raindrop.app.commit_sha");
    const explicit = { ...span(), attributes: { ...span().attributes, "raindrop.app.commit_sha": explicitSha } };
    expect((await exported(exporter, [explicit])).code).toBe(0);
    expect(requests[1]?.includes(Buffer.from(explicitSha))).toBe(true);
    expect(requests[1]?.includes(Buffer.from(deploymentSha))).toBe(false);
  });
});

it("reports an actual rejected HTTP export through the public callback", async () => {
  await withCollector(async ({ exporter, requests, respond }) => {
    respond(500);
    expect((await exported(exporter, [span()])).code).toBe(1);
    expect(requests).toHaveLength(1);
  });
});

it("bounds an actual hung collector request and reports failure", async () => {
  await withCollector(async ({ exporter, respond }) => {
    respond("hang");
    expect((await exported(exporter, [span()])).code).toBe(1);
  }, 200);
});
