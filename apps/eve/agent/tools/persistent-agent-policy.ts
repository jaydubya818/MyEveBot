import {executionIdentityFromAuth,resolveExecution} from "../../lib/execution-auth.ts";
import {routineToolAllowed} from "../../lib/routine-capabilities.ts";
import * as browserTools from "@agent-browser/eve/tools";
import { defineDynamic,defineTool,type DynamicResolveContext,type DynamicToolEntry,type DynamicToolSet } from "eve/tools";
import { z } from "zod";

import { effectiveCapability } from "../../lib/agents.ts";
import { CAPABILITY_DEFINITIONS } from "../../lib/capability-registry.ts";
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
const BROWSER_CAPABILITIES: Record<string, string> = {
  click: "browser.click", close: "browser.click", drag: "browser.click", hover: "browser.click",
  press_key: "browser.click", scroll: "browser.click", select_option: "browser.click", set_checked: "browser.click",
  fill: "browser.type", upload: "files.write", navigate: "browser.navigate",
  console: "browser.read", evaluate: "browser.click", find: "browser.read", get: "browser.read",
  network_requests: "browser.read", read: "browser.read", screenshot: "browser.read", snapshot: "browser.read",
  tabs: "browser.read", wait_for: "browser.read",
};

function policyMap(): Record<string, string> {
  const map = { ...BUILTIN_CAPABILITIES };
  for (const capability of CAPABILITY_DEFINITIONS) {
    if (capability.kind === "tool" && capability.source.reference?.startsWith("agent/tools/")) {
      map[capability.source.reference.slice("agent/tools/".length, -3)] = capability.id;
    }
  }
  for (const [tool, capability] of Object.entries(BROWSER_CAPABILITIES)) map[`browser__${tool}`] = capability;
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
  const resolved: Record<string, DynamicToolEntry<any, any>> = {};
  for (const [toolName, capabilityId] of Object.entries(TOOL_POLICY)) {
    const decision = routine && (routine.agentId!==agent.id || (!routine.configuration.manifest?.tools.includes(toolName) || !routineToolAllowed(toolName,capabilityId,routine.configuration.authority.allowedCapabilities)))
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
