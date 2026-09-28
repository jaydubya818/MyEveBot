import {ownerRuntimeFromAuth} from "../../lib/relay/owner/runtime.ts";
import {executionIdentityFromAuth,resolveExecution} from "../../lib/execution-auth.ts";
import {routineToolAllowed} from "../../lib/routine-capabilities.ts";
import * as browserTools from "@agent-browser/eve/tools";
import { defineDynamic,defineTool,type DynamicResolveContext,type DynamicToolEntry,type DynamicToolSet } from "eve/tools";
import { z } from "zod";

import { effectiveCapability } from "../../lib/agents.ts";
import { CAPABILITY_DEFINITIONS, BROWSER_TOOL_CAPABILITIES } from "../../lib/capability-registry.ts";
import { activeComputerAgentId } from "../../lib/computer-sessions.ts";
import { browserDomainsForUrl } from "../../lib/computer-types.ts";
import { executeBrowserAction } from "../lib/browser-action.ts";
import { provisionComputerSession } from "../lib/computer-context.ts";
import { resolveSessionAgent } from "../lib/session-settings.ts";

const BUILTIN_CAPABILITIES: Record<string, string> = {
  bash: "terminal.execute", glob: "files.read", grep: "files.read", read_file: "files.read",
  write_file: "files.write", web_fetch: "web.read", web_search: "web.search",
  connection_search: "integration.composio", load_skill: "skill.authored", workflow: "specialist.functional-state",
};


function policyMap(): Record<string, string> {
  const map = { ...BUILTIN_CAPABILITIES };
  for (const capability of CAPABILITY_DEFINITIONS) {
    // Federation owns a step-scoped resolver and repeats this capability check
    // at its Action Gateway boundary; avoid two dynamic resolvers for one name.
    if (capability.id === "federation.request") continue;
    if (capability.kind === "tool" && capability.source.reference?.startsWith("agent/tools/")) {
      map[capability.source.reference.slice("agent/tools/".length, -3)] = capability.id;
    }
  }
  for (const [tool, capability] of Object.entries(BROWSER_TOOL_CAPABILITIES)) map[`browser__${tool}`] = capability;
  return map;
}

const TOOL_POLICY = policyMap();

export function browserDomainsForToolInput(toolName: string, input: Record<string, unknown>): string[] {
  if (toolName === "browser__navigate" && (input.action ?? "goto") === "goto") {
    return browserDomainsForUrl(input.url);
  }
  if (toolName === "browser__read" && input.url !== undefined) return browserDomainsForUrl(input.url);
  return [];
}

async function resolvePolicy(ctx: DynamicResolveContext) {
  const ownerId = ctx.session.auth.current?.principalId;
  const agent = await resolveSessionAgent({
    ownerId,
    sessionId: ctx.session.id,
    auth: ctx.session.auth,
    primaryFallback: ctx.session.auth.current?.attributes.owner === "true",
  });
  if (!agent) return null;
  const activeAgentId = ownerId ? await activeComputerAgentId(ownerId, ctx.session.id) : null;
  const identity=executionIdentityFromAuth(ctx.session.auth);
  const routine=identity?await resolveExecution(identity):null;
  const ownerChannel=ownerRuntimeFromAuth(ctx.session.auth);
  const resolved: Record<string, DynamicToolEntry<any, any>> = {};
  for (const [toolName, capabilityId] of Object.entries(TOOL_POLICY)) {
    // Eve owns these connection/coordination names. A second resolver
    // cannot replace them: the runtime throws before reaching the model guard.
    // External Runs exclude them at the provider allowlist and reject any model
    // output naming them; their signed transport cannot invoke tools directly.
    if(ownerChannel&&["connection_search","workflow","ask_question"].includes(toolName))continue;
    const decision = ownerChannel && !["web_search","web_fetch","send_email"].includes(toolName)
      ? {allowed:false,reason:"External Telegram work cannot access private tools."} : routine && (routine.agentId!==agent.id || (!routine.configuration.manifest?.tools.includes(toolName) || !routineToolAllowed(toolName,capabilityId,routine.configuration.authority.allowedCapabilities)))
      ?{allowed:false,reason:"This tool is outside the reviewed Routine tool graph."}:effectiveCapability(agent, capabilityId);
    const browserName = toolName.startsWith("browser__") ? toolName.slice("browser__".length) as keyof typeof browserTools : null;
    if (decision.allowed && browserName) {
      const browserTool = browserTools[browserName] as unknown as DynamicToolEntry<any, any> & {
        description: string;
        inputSchema: unknown;
        execute(input: Record<string, unknown>, ctx: DynamicResolveContext): Promise<unknown> | unknown;
      };
      resolved[toolName] = defineTool({
        ...browserTool,
        description: `${browserTool.description} An isolated browser session starts automatically on the first URL-based call; do not tell the owner browser access is disabled merely because no session is active yet.`,
        async execute(input, toolCtx) {
          const domains=browserDomainsForToolInput(toolName,input);
          if(domains.length)await provisionComputerSession(toolCtx,{allowedDomains:domains});
          return executeBrowserAction(browserName!, input, toolCtx);
        },
      }) as unknown as DynamicToolEntry<any, any>;
      continue;
    }
    if (decision.allowed && !browserName) continue;
    const reason = decision.reason;
    resolved[toolName] = defineTool({
      description: `${toolName} is not authorized for ${agent.name} under its assigned capability policy.`,
      inputSchema: z.object({ request: z.unknown().optional() }).loose(),
      execute: async () => ({status:"denied",code:"capability_denied",capabilityId,message:reason ?? `Capability unavailable for ${agent.name}.`,canEscalate:false}),
    }) as unknown as DynamicToolEntry<any, any>;
  }
  return resolved satisfies DynamicToolSet;
}

export default defineDynamic({
  events: {
    "turn.started": async (_event, ctx) => resolvePolicy(ctx),
    "step.started": async (_event, ctx) => resolvePolicy(ctx),
  },
});
