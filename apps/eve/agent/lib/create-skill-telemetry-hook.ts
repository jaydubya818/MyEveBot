import { defineHook } from "eve/hooks";

import {
  SKILL_EVAL_MESSAGE_PREFIX,
  type SkillAgentId,
} from "../../lib/skill-manager-types";
import {
  completeSkillUsage,
  recordSkillStepUsage,
  recordSkillUsage,
  skillOwnerId,
} from "./skill-manager";

interface PendingSkillLoad {
  name: string;
  stepIndex: number;
}

const pendingSkillLoads = new Map<string, PendingSkillLoad>();
const excludedTurns = new Set<string>();

function turnKey(sessionId: string, turnId: string): string {
  return `${sessionId}:${turnId}`;
}

function pendingKey(sessionId: string, turnId: string, callId: string): string {
  return `${sessionId}:${turnId}:${callId}`;
}

function clearPendingTurn(sessionId: string, turnId: string): void {
  const prefix = `${sessionId}:${turnId}:`;
  for (const key of pendingSkillLoads.keys()) {
    if (key.startsWith(prefix)) pendingSkillLoads.delete(key);
  }
}

export function createSkillTelemetryHook(agentId: SkillAgentId) {
  return defineHook({
    events: {
      "message.received"(event, ctx) {
        if (event.data.message.startsWith(SKILL_EVAL_MESSAGE_PREFIX)) {
          excludedTurns.add(turnKey(ctx.session.id, event.data.turnId));
        }
      },
      "actions.requested"(event, ctx) {
        if (excludedTurns.has(turnKey(ctx.session.id, event.data.turnId))) return;
        for (const action of event.data.actions) {
          const isSkillLoad =
            action.kind === "load-skill" ||
            (action.kind === "tool-call" && action.toolName === "load_skill");
          const name = action.input.skill;
          if (!isSkillLoad || typeof name !== "string") continue;
          pendingSkillLoads.set(
            pendingKey(ctx.session.id, event.data.turnId, action.callId),
            { name, stepIndex: event.data.stepIndex },
          );
        }
      },
      async "action.result"(event, ctx) {
        if (excludedTurns.has(turnKey(ctx.session.id, event.data.turnId))) return;
        const result = event.data.result;
        const key = pendingKey(ctx.session.id, event.data.turnId, result.callId);
        const pending = pendingSkillLoads.get(key);
        pendingSkillLoads.delete(key);
        const nativeName = result.kind === "load-skill-result" ? result.name : undefined;
        const skillName = nativeName ?? pending?.name;
        if (event.data.status !== "completed" || skillName === undefined) return;
        try {
          await recordSkillUsage({
            ownerId: skillOwnerId(ctx.session.auth),
            skillName,
            agentId,
            sessionId: ctx.session.id,
            turnId: event.data.turnId,
            stepIndex: pending?.stepIndex ?? event.data.stepIndex,
          });
        } catch (error) {
          console.warn(`${agentId} skill load telemetry could not be recorded.`, error);
        }
      },
      async "step.completed"(event, ctx) {
        if (excludedTurns.has(turnKey(ctx.session.id, event.data.turnId))) return;
        try {
          await recordSkillStepUsage({
            sessionId: ctx.session.id,
            turnId: event.data.turnId,
            stepIndex: event.data.stepIndex,
            inputTokens: event.data.usage?.inputTokens,
            outputTokens: event.data.usage?.outputTokens,
            cacheReadTokens: event.data.usage?.cacheReadTokens,
            cacheWriteTokens: event.data.usage?.cacheWriteTokens,
            costUsd: event.data.usage?.costUsd,
          });
        } catch (error) {
          console.warn(`${agentId} skill cost telemetry could not be recorded.`, error);
        }
      },
      async "turn.completed"(event, ctx) {
        const excluded = excludedTurns.delete(turnKey(ctx.session.id, event.data.turnId));
        clearPendingTurn(ctx.session.id, event.data.turnId);
        if (excluded) return;
        try {
          await completeSkillUsage({
            sessionId: ctx.session.id,
            turnId: event.data.turnId,
            outcome: "succeeded",
          });
        } catch (error) {
          console.warn(`${agentId} skill outcome telemetry could not be recorded.`, error);
        }
      },
      async "turn.failed"(event, ctx) {
        const excluded = excludedTurns.delete(turnKey(ctx.session.id, event.data.turnId));
        clearPendingTurn(ctx.session.id, event.data.turnId);
        if (excluded) return;
        try {
          await completeSkillUsage({
            sessionId: ctx.session.id,
            turnId: event.data.turnId,
            outcome: "failed",
          });
        } catch (error) {
          console.warn(`${agentId} skill failure telemetry could not be recorded.`, error);
        }
      },
      async "turn.cancelled"(event, ctx) {
        const excluded = excludedTurns.delete(turnKey(ctx.session.id, event.data.turnId));
        clearPendingTurn(ctx.session.id, event.data.turnId);
        if (excluded) return;
        try {
          await completeSkillUsage({
            sessionId: ctx.session.id,
            turnId: event.data.turnId,
            outcome: "cancelled",
          });
        } catch (error) {
          console.warn(`${agentId} skill cancellation telemetry could not be recorded.`, error);
        }
      },
    },
  });
}
