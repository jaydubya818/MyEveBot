import { trace } from "@opentelemetry/api";
import { BraintrustExporter } from "@braintrust/otel";
import { registerOTel } from "@vercel/otel";
import { defineInstrumentation } from "eve/instrumentation";
import { createHash } from "node:crypto";
import { Raindrop } from "raindrop-ai";

import { shouldRecordTelemetryIo } from "../lib/telemetry-privacy";

export const RAINDROP_EVENT_NAME = "sofie_agent_turn";
export const RECORD_IO = shouldRecordTelemetryIo();

const RAINDROP_NAMESPACE = Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex");
const raindropWriteKey = process.env.RAINDROP_WRITE_KEY?.trim() ?? "";

// Eve owns the OpenTelemetry provider. Raindrop contributes a processor to
// that provider, while the turn hook owns canonical begin/finish events.
export const raindrop =
  raindropWriteKey === ""
    ? null
    : new Raindrop({
        writeKey: raindropWriteKey,
        useExternalOtel: true,
        redactPii: true,
        disabled: process.env.NODE_ENV === "test",
      });

/** Stable UUIDv5 so hooks can resume the same event across durable invocations. */
export function raindropEventId(sessionId: string, turnId: string): string {
  const bytes = createHash("sha1")
    .update(RAINDROP_NAMESPACE)
    .update(`sofie:${sessionId}:${turnId}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

interface SessionAuth {
  readonly current: { readonly principalId: string } | null;
  readonly initiator: { readonly principalId: string } | null;
}

export function raindropUserId(sessionId: string, auth: SessionAuth): string {
  return (auth.current ?? auth.initiator)?.principalId ?? `session:${sessionId}`;
}

export function resolveBraintrustParent(
  agentName: string,
  configuredParent: string | undefined,
  projectId: string | undefined,
): string {
  if (configuredParent) return configuredParent;
  if (projectId) return `project_id:${projectId}`;
  return `project_name:${agentName}`;
}

// Single-user agent: traces carry the owner's real messages. Braintrust export
// is opt-in through its API key; the Marketplace integration provides both the
// key and destination project id. Without a direct exporter, production still
// registers Vercel's collector so a project-scoped Trace Drain can forward
// platform spans. OTEL_RECORD_IO=false keeps span structure (timings, tokens,
// tool names) while dropping message bodies.
const USE_VERCEL_PRODUCTION_COLLECTOR =
  process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production";

export default defineInstrumentation({
  tracePolicy: () => ({ emit: true, recordInputs: RECORD_IO, recordOutputs: RECORD_IO }),
  setup: ({ agentName }) => {
    const braintrustKey = process.env.BRAINTRUST_API_KEY ?? "";
    const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "";
    if (
      braintrustKey === "" &&
      otlpEndpoint === "" &&
      !USE_VERCEL_PRODUCTION_COLLECTOR &&
      raindrop === null
    ) {
      return;
    }

    // "auto" preserves Vercel's collector and explicit OTLP export. Avoid it
    // for Raindrop-only local development, where it would probe localhost:4318.
    const useAutomaticSpanProcessors =
      USE_VERCEL_PRODUCTION_COLLECTOR || braintrustKey !== "" || otlpEndpoint !== "";

    registerOTel({
      serviceName: agentName,
      ...(raindrop !== null
        ? {
            spanProcessors: [
              ...(useAutomaticSpanProcessors ? (["auto"] as const) : []),
              raindrop.createSpanProcessor(),
            ],
          }
        : {}),
      ...(braintrustKey !== ""
        ? {
            traceExporter: new BraintrustExporter({
              parent: resolveBraintrustParent(
                agentName,
                process.env.BRAINTRUST_PARENT,
                process.env.BRAINTRUST_PROJECT_ID,
              ),
              filterAISpans: true,
            }),
          }
        : {}),
    });
  },
  events: {
    "model.call.started"(event) {
      if (!raindrop) return;
      trace.getActiveSpan()?.setAttributes({
        "raindrop.event_id": raindropEventId(event.scope.sessionId, event.scope.turnId),
        "raindrop.convo_id": event.scope.sessionId,
        "raindrop.event_name": RAINDROP_EVENT_NAME,
      });
    },
  },
});
