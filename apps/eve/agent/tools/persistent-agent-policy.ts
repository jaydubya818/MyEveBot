import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";

import { CAPABILITY_DEFINITIONS } from "../../lib/capability-registry.ts";
import { effectiveCapability } from "../../lib/agents.ts";
import { sessionAgent } from "../lib/session-settings.ts";

const BUILTIN_CAPABILITIES: Record<string, string> = {
  bash: "computer.browser", glob: "files.read", grep: "files.read", read_file: "files.read",
  write_file: "files.write", web_fetch: "web.read", web_search: "web.search",
  connection_search: "integration.composio", load_skill: "skill.authored", workflow: "specialist.functional-state",
};
const BROWSER_TOOLS = ["click","close","console","drag","evaluate","fill","find","get","hover","navigate","network_requests","press_key","read","screenshot","scroll","select_option","set_checked","snapshot","tabs","upload","wait_for"];

function policyMap(): Record<string, string> {
  const map = { ...BUILTIN_CAPABILITIES };
  for (const capability of CAPABILITY_DEFINITIONS) {
    if (capability.kind === "tool" && capability.source.reference?.startsWith("agent/tools/")) {
      map[capability.source.reference.slice("agent/tools/".length, -3)] = capability.id;
    }
  }
  for (const tool of BROWSER_TOOLS) map[`browser__${tool}`] = "computer.browser";
  return map;
}

const TOOL_POLICY = policyMap();

export default defineDynamic({
  events: {
    "turn.started": async (_event, ctx) => {
      const agent = await sessionAgent(ctx.session.auth.current?.principalId, ctx.session.auth.current?.attributes.myeveAgentId, ctx.session.auth.current?.attributes.owner === "true");
      if (!agent || agent.isPrimary) return null;
      return Object.fromEntries(Object.entries(TOOL_POLICY).flatMap(([toolName, capabilityId]) => {
        const decision = effectiveCapability(agent, capabilityId);
        if (decision.allowed) return [];
        return [[toolName, defineTool({
          description: `${toolName} is unavailable to ${agent.name} under its assigned capability policy.`,
          inputSchema: z.object({ request: z.unknown().optional() }).loose(),
          execute: async () => { throw new Error(decision.reason ?? `Capability unavailable for ${agent.name}.`); },
        })]];
      }));
    },
  },
});
