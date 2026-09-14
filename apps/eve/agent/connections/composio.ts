import { defineMcpClientConnection } from "eve/connections";

import { effectiveCapability } from "../../lib/agents.ts";
import { agentForSession } from "../lib/session-settings.ts";

// Composio Connect: one MCP server fronting 1000+ apps (Gmail, Google
// Calendar, Notion, Slack, GitHub, Linear, ...). It exposes meta-tools to
// discover app tools, authorize apps, and execute actions. When an app is
// not connected yet, its manage-connections tool returns an OAuth link the
// user opens in a browser; the resulting connection persists across sessions.
export default defineMcpClientConnection({
  url: "https://connect.composio.dev/mcp",
  description:
    "Composio: gateway to the user's connected apps (Gmail, Google Calendar, Notion, Slack, GitHub, Linear, and 1000+ more). Search for app tools, connect or authorize apps (returns an OAuth link to show the user), check connection status, and execute app actions like reading email, creating calendar events, or updating Notion pages.",
  headers: {
    "x-consumer-api-key": () => process.env.COMPOSIO_API_KEY!,
  },
  approval: async (ctx) => {
    const ownerId = ctx.session.auth.current?.principalId;
    if (!ownerId) return { type: "denied", reason: "Authenticated owner required." };
    const agent = await agentForSession(ctx.session.id, ownerId);
    if (!agent || agent.isPrimary) return { type: "approved", reason: "Primary Agent policy." };
    const decision = effectiveCapability(agent, "integration.composio");
    return decision.allowed
      ? { type: "approved", reason: `Assigned to ${agent.name}.` }
      : { type: "denied", reason: decision.reason };
  },
});
