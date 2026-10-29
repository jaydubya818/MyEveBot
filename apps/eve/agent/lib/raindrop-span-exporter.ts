import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import type { SpanExporter } from "eve/instrumentation/otel";
import { RAINDROP_API_URL, mergeRaindropProvenance, raindropDeploymentProvenance, raindropExplicitProvenanceKeys } from "./raindrop-client";

type ReadableSpan = Parameters<OTLPTraceExporter["export"]>[0][number];

// Preserve the former destination's admitted instrumentation scopes. Switching
// exporters must not silently expand which application spans leave the process.
const scopes = new Set([
  "ai", "@traceloop/node-server-sdk", "traceloop.tracer",
  ...["openai", "langchain", "chroma", "chromadb", "anthropic", "llamaindex",
    "vertexai", "bedrock", "cohere", "pinecone", "qdrant", "together"]
    .map(name => `@traceloop/instrumentation-${name}`),
]);

function content(value: unknown): string {
  try { return JSON.stringify(value) ?? String(value); }
  catch { return "[unserializable]"; }
}

function copySpan(span: ReadableSpan, attributes: ReadableSpan["attributes"], name: string): ReadableSpan {
  return { name, attributes, spanContext: () => span.spanContext(),
    kind: span.kind, parentSpanContext: span.parentSpanContext,
    startTime: span.startTime, endTime: span.endTime, duration: span.duration,
    status: span.status, ended: span.ended, resource: span.resource,
    instrumentationScope: span.instrumentationScope, events: span.events, links: span.links,
    droppedAttributesCount: span.droppedAttributesCount,
    droppedEventsCount: span.droppedEventsCount, droppedLinksCount: span.droppedLinksCount };
}

function normalize(span: ReadableSpan, provenance: Readonly<Record<string, string | boolean>>, explicitDefaults: ReadonlySet<string>): ReadableSpan {
  const name = span.name === "ai.generateText.doGenerate" ? "ai.generateText.generate"
    : span.name === "ai.streamText.doStream" ? "ai.streamText.stream" : undefined;
  if (name === undefined && Object.keys(provenance).length === 0) return span;
  const attributes = mergeRaindropProvenance(span.attributes, provenance, true, explicitDefaults);
  if (name === undefined) return copySpan(span, attributes, span.name);
  if ("ai.response.text" in attributes) {
    const text = attributes["ai.response.text"];
    if (typeof text === "string") attributes["gen_ai.completion.0.content"] = text;
    attributes["gen_ai.completion.0.role"] = "assistant";
    delete attributes["ai.response.text"];
  }
  if ("ai.prompt.messages" in attributes) {
    try {
      const messages: unknown = JSON.parse(String(attributes["ai.prompt.messages"]));
      if (Array.isArray(messages)) messages.forEach((message: unknown, index) => {
        if (message === null || typeof message !== "object") return;
        const value = "content" in message ? message.content : undefined;
        attributes[`gen_ai.prompt.${index}.content`] = typeof value === "string" ? value : content(value);
        if ("role" in message && typeof message.role === "string") attributes[`gen_ai.prompt.${index}.role`] = message.role;
      });
      delete attributes["ai.prompt.messages"];
    } catch { /* Preserve malformed prompt metadata, as before. */ }
  }
  for (const [from, to] of [["ai.usage.promptTokens", "gen_ai.usage.prompt_tokens"],
    ["ai.usage.completionTokens", "gen_ai.usage.completion_tokens"]] as const) {
    if (from in attributes) { attributes[to] = Number(attributes[from]); delete attributes[from]; }
  }
  const input = attributes["gen_ai.usage.prompt_tokens"], output = attributes["gen_ai.usage.completion_tokens"];
  if (input !== undefined && output !== undefined) attributes["llm.usage.total_tokens"] = Number(input) + Number(output);
  if ("ai.model.provider" in attributes) {
    const provider = String(attributes["ai.model.provider"]);
    attributes["gen_ai.system"] = provider.startsWith("openai") ? "OpenAI" : provider;
    delete attributes["ai.model.provider"];
  }
  // Forward the full public ReadableSpan structure, including resources,
  // scopes, exceptions, links and trace state. Never mutate another sink's span.
  return copySpan(span, attributes, name);
}

/** Standard public OTLP transport; Eve remains the only tracing provider. */
export class RaindropSpanExporter implements SpanExporter {
  private readonly exporter: OTLPTraceExporter;
  private readonly provenance = raindropDeploymentProvenance();
  private readonly explicitProvenanceKeys = raindropExplicitProvenanceKeys();
  constructor(writeKey: string, endpoint = RAINDROP_API_URL, timeoutMillis = 10_000) {
    this.exporter = new OTLPTraceExporter({
      url: new URL("traces", endpoint).href,
      headers: { Authorization: `Bearer ${writeKey}` }, timeoutMillis,
    });
  }
  export(spans: readonly unknown[], callback: Parameters<SpanExporter["export"]>[1]): void {
    let selected: ReadableSpan[];
    try {
      // Eve supplies public OTel ReadableSpans. Unknown/nonadmitted scopes are
      // excluded before normalization or transport, matching the old processor.
      selected = spans.filter((span): span is ReadableSpan => {
        if (span === null || typeof span !== "object" || !("instrumentationScope" in span)) return false;
        const scope = span.instrumentationScope;
        return scope !== null && typeof scope === "object" && "name" in scope
          && typeof scope.name === "string" && scopes.has(scope.name);
      }).map(span => normalize(span, this.provenance, this.explicitProvenanceKeys));
    } catch {
      callback({ code: 1, error: new Error("Raindrop span preparation failed") }); return;
    }
    if (selected.length === 0) { callback({ code: 0 }); return; }
    this.exporter.export(selected, callback);
  }
  forceFlush(): Promise<void> { return this.exporter.forceFlush(); }
  shutdown(): Promise<void> { return this.exporter.shutdown(); }
}
