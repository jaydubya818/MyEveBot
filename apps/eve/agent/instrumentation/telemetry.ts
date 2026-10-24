import { trace } from "@opentelemetry/api";
import { defineInstrumentation } from "eve/instrumentation";
import { createHash } from "node:crypto";
import { RaindropTurnClient } from "../lib/raindrop-client";
import { RaindropSpanExporter } from "../lib/raindrop-span-exporter";

import { shouldRecordTelemetryIo } from "../lib/telemetry-privacy";

export const RAINDROP_EVENT_NAME = "sofie_agent_turn";
export const RECORD_IO = shouldRecordTelemetryIo();

const RAINDROP_NAMESPACE = Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex");
const raindropWriteKey = process.env.RAINDROP_WRITE_KEY?.trim() ?? "";

const raindropEnabled = raindropWriteKey !== "" && process.env.NODE_ENV !== "test";
// No SDK, automatic AI events, Workshop probe or second provider. The durable
// hook owns manual events; the standard exporter only contributes a sink.
export const raindrop =
  raindropEnabled ? new RaindropTurnClient(raindropWriteKey) : null;
export const raindropTraceExporter =
  raindropEnabled ? new RaindropSpanExporter(raindropWriteKey) : null;

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

// Lifecycle events enrich the spans owned by Eve's single tracing provider.
export default defineInstrumentation({
  tracePolicy: () => ({ emit: true, recordInputs: RECORD_IO, recordOutputs: RECORD_IO }),
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
