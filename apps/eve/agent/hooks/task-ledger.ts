import { defineHook } from "eve/hooks";

import {
  assertTaskBudget,
  completeTaskSubagent,
  failTaskSubagent,
  recordTaskModelStep,
  registerTaskSubagent,
} from "../../lib/task-runs.ts";

function resultText(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "Specialist execution failed.";
  }
}

export default defineHook({
  events: {
    async "step.started"(_event, ctx) {
      await assertTaskBudget(ctx.session.id);
    },
    async "step.completed"(event, ctx) {
      await recordTaskModelStep(ctx.session.id, event.data.usage?.costUsd ?? 0);
    },
    async "subagent.called"(event, ctx) {
      await registerTaskSubagent({
        // Workflow dispatch exposes the authoritative parent on the event.
        parentSessionId: event.data.sessionId,
        childSessionId: event.data.childSessionId,
        callId: event.data.callId,
        name: event.data.name,
      });
    },
    async "subagent.completed"(event, ctx) {
      await completeTaskSubagent({
        parentSessionId: ctx.session.id,
        callId: event.data.callId,
        name: event.data.subagentName,
        summary: event.data.output,
      });
    },
    async "action.result"(event, ctx) {
      if (
        event.data.status !== "failed" ||
        event.data.result.kind !== "subagent-result"
      ) {
        return;
      }
      await failTaskSubagent({
        parentSessionId: ctx.session.id,
        name: event.data.result.subagentName,
        error: event.data.error?.message ?? resultText(event.data.result.output),
      });
    },
  },
});
