import { defineTool } from "eve/tools";
import { z } from "zod";
import { always } from "eve/tools/approval";
import { executionIdentityFromAuth } from "../../lib/execution-auth.ts";
import { createAgent, duplicateAgent, getAgent, transitionAgent, updateAgentProfile } from "../../lib/agents.ts";


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
  description: "Create, edit, pause, resume, archive, or copy a persistent agent after direct owner approval. New agents and copies have no capability grants. Editing preserves existing capability, risk and execution limits. Use the owner agent settings to review any permission expansion. An agent identity is not an environment or a harness.",
  availableInSubagents: false,
  // Keep an object at the JSON Schema root. Some Anthropic routes reject a
  // discriminated union's top-level `oneOf` even though it is valid JSON
  // Schema, before the model has a chance to call the tool.
  inputSchema: z.object({
    action: z.enum(["create", "update", "pause", "resume", "archive", "duplicate"]),
    agentId: z.string().optional(),
    configuration: configuration.optional(),
    name: z.string().max(80).optional(),
  }),
  approval: always(),
  async execute(input, ctx) {
    const caller=ctx.session.auth.current;
    if(!caller || caller.principalType!=="user" || caller.attributes.owner!=="true" || caller.attributes.role==="guest" || caller.attributes.myeveRoleId || ctx.session.parent || executionIdentityFromAuth(ctx.session.auth)) throw new Error("Agent management requires the direct authenticated owner.");
    const owner=caller.principalId, actor={type:"owner" as const,id:owner};
    if(input.configuration?.capabilityIds.length) throw new Error("Review capability grants in owner agent settings. This tool cannot grant permissions.");
    if(input.action==='create') {
      if(input.agentId || !input.configuration) throw new Error("New agent configuration required.");
      if(input.configuration.riskCeiling!=='low' || input.configuration.limits) throw new Error("New agents use conservative default limits. Review changes in owner settings.");
      return createAgent(owner,{...input.configuration,capabilityIds:[]},actor);
    }
    if(!input.agentId) throw new Error("Choose an existing agent.");
    const current=await getAgent(owner,input.agentId);if(!current)throw new Error("Agent not found.");
    if(input.action==='update') {
      if(!input.configuration)throw new Error("Updated profile required.");
      if(input.configuration.limits || input.configuration.riskCeiling!==current.riskCeiling)throw new Error("This tool preserves existing risk and execution limits. Review changes in owner settings.");
      return updateAgentProfile(owner,current.id,input.configuration,actor);
    }
    if(input.configuration)throw new Error("Profile changes require the update action.");
    if(input.action==='duplicate')return duplicateAgent(owner,current.id,input.name,actor);
    return transitionAgent(owner,current.id,input.action==='pause'?'paused':input.action==='resume'?'active':'archived',actor);
  },
});
