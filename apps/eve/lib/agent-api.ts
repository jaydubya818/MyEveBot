import {
  AGENT_NOTIFICATION_POLICIES,
  AGENT_REASONING,
  AGENT_RISK_CEILINGS,
  type AgentWriteInput,
} from "./agents.ts";
import { webPrincipal } from "./web-auth.ts";

export function requestOwnerId(request: Request): string {
  const principal = webPrincipal(request);
  if (!principal) throw new Error("Authenticated owner required.");
  return principal.id;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function parseAgentWriteInput(value: unknown): AgentWriteInput | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (typeof body.name !== "string" || typeof body.role !== "string" || typeof body.instructions !== "string") return null;
  const capabilityIds = Array.isArray(body.capabilityIds) && body.capabilityIds.every((id) => typeof id === "string") ? body.capabilityIds as string[] : [];
  const rawLimits = body.limits && typeof body.limits === "object" && !Array.isArray(body.limits) ? body.limits as Record<string, unknown> : {};
  const reasoning = AGENT_REASONING.includes(body.reasoningPreference as never) ? body.reasoningPreference as AgentWriteInput["reasoningPreference"] : undefined;
  const risk = AGENT_RISK_CEILINGS.includes(body.riskCeiling as never) ? body.riskCeiling as AgentWriteInput["riskCeiling"] : undefined;
  const notification = AGENT_NOTIFICATION_POLICIES.includes(body.notificationPolicy as never) ? body.notificationPolicy as AgentWriteInput["notificationPolicy"] : undefined;
  return {
    name: body.name,
    role: body.role,
    instructions: body.instructions,
    description: optionalString(body.description),
    preferredModel: body.preferredModel === null ? null : optionalString(body.preferredModel),
    reasoningPreference: reasoning,
    riskCeiling: risk,
    notificationPolicy: notification,
    capabilityIds,
    limits: {
      ...(typeof rawLimits.maxSteps === "number" ? { maxSteps: rawLimits.maxSteps } : {}),
      ...(typeof rawLimits.maxRuntimeSeconds === "number" ? { maxRuntimeSeconds: rawLimits.maxRuntimeSeconds } : {}),
      ...(typeof rawLimits.maxEstimatedCostUsd === "number" ? { maxEstimatedCostUsd: rawLimits.maxEstimatedCostUsd } : {}),
      ...(typeof rawLimits.maxRetries === "number" ? { maxRetries: rawLimits.maxRetries } : {}),
    },
  };
}
