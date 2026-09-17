import { defineHook } from "eve/hooks";

import { recordComputerActionRequested, recordComputerActionResult } from "../../lib/computer-sessions.ts";
import { agentForSession } from "../lib/session-settings.ts";
import { ensureComputerForBrowserAction } from "../lib/computer-provisioning.ts";

function ownerId(ctx: { session: { auth: { current: { principalId?: string } | null } } }): string | null {
  return ctx.session.auth.current?.principalId?.trim() || null;
}

export default defineHook({
  events: {
    async "actions.requested"(event, ctx) {
      const owner = ownerId(ctx);
      if (!owner) return;
      const agent = await agentForSession(ctx.session.id, owner);
      if (!agent) return;
      for (const action of event.data.actions) {
        if (action.kind !== "tool-call") continue;
        if (action.toolName.startsWith("browser__")) {
          await ensureComputerForBrowserAction({
            ctx,
            ownerId: owner,
            agent,
            toolName: action.toolName,
            toolInput: action.input,
          });
        }
        await recordComputerActionRequested({
          ownerId: owner, agentId: agent.id, runtimeSessionId: ctx.session.id, callId: action.callId,
          toolName: action.toolName, toolInput: action.input,
        });
      }
    },
    async "action.result"(event, ctx) {
      const owner = ownerId(ctx);
      const result = event.data.result;
      if (!owner || result.kind !== "tool-result") return;
      const agent = await agentForSession(ctx.session.id, owner);
      if (!agent) return;
      await recordComputerActionResult({
        ownerId: owner, agentId: agent.id, runtimeSessionId: ctx.session.id, callId: result.callId,
        toolName: result.toolName, status: event.data.status, output: result.output,
        errorCode: event.data.error?.code, errorMessage: event.data.error?.message,
      });
    },
  },
});
