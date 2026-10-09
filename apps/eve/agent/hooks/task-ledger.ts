import { denyExternalAlphaPaidPath } from "../../lib/external-alpha/paid-paths.ts";
import { ownerRuntimeFromAuth,resolveOwnerRuntime } from "../../lib/relay/owner/runtime.ts";
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
    async "actions.requested"(_event,ctx){
      if(ctx.session.auth.current?.attributes.myeveRetainedSummary!==undefined)throw new Error('Retained summaries cannot request actions.');
    },
    async "compaction.requested"(_event,ctx){
      denyExternalAlphaPaidPath("context-compaction");
      if(ctx.session.auth.current?.attributes.myeveRetainedSummary!==undefined)throw new Error('Retained evidence summaries cannot call an auxiliary model.');
      if(ownerRuntimeFromAuth(ctx.session.auth))throw new Error("External request cannot start an unreserved compaction call.");
    },
    async "step.started"(_event, ctx) {
      if(ctx.session.auth.current?.attributes.myeveRetainedSummary!==undefined)return;
      const ownerRuntime=ownerRuntimeFromAuth(ctx.session.auth);
      if(ownerRuntime)await resolveOwnerRuntime(ownerRuntime);
      await assertTaskBudget(ctx.session.id);
    },
    async "step.completed"(event, ctx) {
      if(ctx.session.auth.current?.attributes.myeveRetainedSummary!==undefined)return; // No model operation or execution-budget mutation.
      const ownerRuntime=ownerRuntimeFromAuth(ctx.session.auth);
      if(ownerRuntime)return; // Provider boundary durably settles usage exactly once.
      await recordTaskModelStep(ctx.session.id, event.data.usage?.costUsd ?? 0);
    },
    async "subagent.called"(event, ctx) {
      if(ctx.session.auth.current?.attributes.myeveRetainedSummary!==undefined)throw new Error('Retained summaries cannot delegate.');
      await registerTaskSubagent({
        // Workflow dispatch exposes the authoritative parent on the event.
        parentSessionId: event.data.sessionId,
        childSessionId: event.data.childSessionId,
        callId: event.data.callId,
        name: event.data.name,
      });
    },
    async "subagent.completed"(event, ctx) {
      if(ctx.session.auth.current?.attributes.myeveRetainedSummary!==undefined)throw new Error('Retained summaries cannot delegate.');
      await completeTaskSubagent({
        parentSessionId: ctx.session.id,
        callId: event.data.callId,
        name: event.data.subagentName,
        summary: event.data.output,
      });
    },
    async "action.result"(event, ctx) {
      if(ctx.session.auth.current?.attributes.myeveRetainedSummary!==undefined)throw new Error('Retained summaries cannot execute actions.');
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
