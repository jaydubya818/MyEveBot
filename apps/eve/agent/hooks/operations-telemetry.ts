import { defineHook } from "eve/hooks";

import { recordOperationsEvent } from "../../lib/operations.ts";

function ownerId(ctx: { session: { id: string; auth: { current: { principalId?: string } | null } } }): string | null {
  return ctx.session.auth.current?.principalId?.trim() || process.env.MYEVE_OWNER_ID?.trim() || process.env.SOFIE_OWNER_ID?.trim() || null;
}

function failureText(data: { code?: unknown; message?: unknown }): { code: string; message: string } {
  return {
    code: typeof data.code === "string" ? data.code : "unknown_failure",
    message: typeof data.message === "string" ? data.message : "The runtime reported a failure.",
  };
}

export default defineHook({
  events: {
    async "turn.failed"(event, ctx) {
      const owner = ownerId(ctx);
      if (!owner) return;
      const failure = failureText(event.data);
      try {
        await recordOperationsEvent({ ownerId: owner, type: "TURN_FAILED", sourceType: "eve_session", sourceId: ctx.session.id, summary: failure.message, payload: { code: failure.code } });
        if (/limit|budget|cost|runtime|rate/i.test(`${failure.code} ${failure.message}`)) {
          await recordOperationsEvent({ ownerId: owner, type: "MODEL_LIMIT_HIT", sourceType: "eve_session", sourceId: ctx.session.id, summary: failure.message, payload: { code: failure.code } });
        }
      } catch (error) {
        console.error("operations_turn_telemetry_failed", error);
      }
    },
    async "session.failed"(event, ctx) {
      const owner = ownerId(ctx);
      if (!owner) return;
      const failure = failureText(event.data);
      try {
        await recordOperationsEvent({ ownerId: owner, type: "SESSION_FAILED", sourceType: "eve_session", sourceId: ctx.session.id, summary: failure.message, payload: { code: failure.code }, severity: "critical" });
      } catch (error) {
        console.error("operations_session_telemetry_failed", error);
      }
    },
    async "action.result"(event, ctx) {
      const owner = ownerId(ctx);
      const result = event.data.result;
      if (!owner || result.kind !== "tool-result" || event.data.status === "completed") return;
      if (!/(artifact|upload|record_computer_artifact)/i.test(result.toolName)) return;
      try {
        await recordOperationsEvent({
          ownerId: owner,
          type: "ARTIFACT_FAILURE",
          sourceType: "tool_call",
          sourceId: result.callId,
          summary: event.data.error?.message ?? `${result.toolName} failed.`,
          payload: { toolName: result.toolName, code: event.data.error?.code ?? null },
        });
      } catch (error) {
        console.error("operations_artifact_telemetry_failed", error);
      }
    },
  },
});
