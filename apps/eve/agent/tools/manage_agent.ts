import { defineTool } from "eve/tools";
import { z } from "zod";
import { denyUnqualifiedExecutor } from "../lib/unqualified-executor.ts";


const reasoning = z.enum(["default", "none", "minimal", "low", "medium", "high", "xhigh"]);
const risk = z.enum(["low", "medium", "high"]);
const notification = z.enum(["silent", "activity", "digest", "push_on_block"]);
const configuration = z.object({
  name: z.string().min(1).max(80), role: z.string().min(1).max(120),
  description: z.string().max(2000).default(""), instructions: z.string().min(1).max(20000),
  preferredModel: z.string().nullable().optional(), reasoningPreference: reasoning.default("default"),
  riskCeiling: risk.default("low"), notificationPolicy: notification.default("activity"),
  capabilityIds: z.array(z.string()).default([]),
  limits: z.object({ maxSteps: z.number().int(), maxRuntimeSeconds: z.number().int(), maxEstimatedCostUsd: z.number(), maxRetries: z.number().int() }).optional(),
});

export default defineTool({
  description: "Create, update, pause, resume, archive, or duplicate an owner-scoped persistent Agent. Roles never grant capabilities; capability ids must be explicit. Do not grant sensitive capabilities unless the owner asked for them.",
  // Keep an object at the JSON Schema root. Some Anthropic routes reject a
  // discriminated union's top-level `oneOf` even though it is valid JSON
  // Schema, before the model has a chance to call the tool.
  inputSchema: z.object({
    action: z.enum(["create", "update", "pause", "resume", "archive", "duplicate"]),
    agentId: z.string().optional(),
    configuration: configuration.optional(),
    name: z.string().max(80).optional(),
  }),
  approval: (ctx) => ctx.toolInput?.action === "archive"
    ? "user-approval"
    : { type: "approved", reason: "Bounded owner-scoped Agent management." },
  async execute(input, ctx) {
    return denyUnqualifiedExecutor(ctx, "tool.manage_agent");
  },
});
