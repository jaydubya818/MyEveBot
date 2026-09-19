import { experimental_upgradeWebSocket } from "@vercel/functions";

import { orgoForProfile } from "@/agent/lib/orgo";
import { ensureBrowserProfile } from "@/lib/browser-profiles";
import { getAgent } from "@/lib/agents";
import { apiError } from "@/lib/api-errors";
import { computerApiFailure } from "@/lib/computer-api-errors";
import { pipeVncSocket } from "@/lib/vnc-relay";
import { requireWebAuth, webPrincipal } from "@/lib/web-auth";

// Same-origin relay between the browser's VNC client and Orgo's websockify
// endpoint. Orgo only admits browser origins it knows about; a WebSocket
// opened from one of our pages is cut off right after the upgrade with 4001
// "Origin not allowed". Dialing Orgo from the server sidesteps that — a
// server-side WebSocket sends no Origin header — so the page connects here
// and the bytes are piped through (see lib/vnc-relay.ts).
//
// Upgrades only work on the Vercel runtime (`experimental_upgradeWebSocket`);
// under `next dev` this route answers 501, and the panel never uses it there
// because dev state hands out the sidecar relay (lib/dev-vnc-relay.ts).
//
// This socket is full control of the desktop, exactly like the connection
// details GET /api/computer hands out; it is gated by the same web auth.

export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  const denied = requireWebAuth(request);
  if (denied) return denied;

  // Resolve the upstream before upgrading, so a desktop with nothing to
  // connect to is an HTTP error instead of a socket that opens and drops.
  let upstreamUrl: string;
  try {
    const agentId = new URL(request.url).searchParams.get("agentId");
    if (!agentId) return apiError(request, 400, "computer_agent_required", "Choose an Agent.");
    const ownerId = webPrincipal(request)!.id;
    const agent = await getAgent(ownerId, agentId);
    if (!agent) return apiError(request, 404, "computer_agent_not_found", "Agent not found.");
    const profile = await ensureBrowserProfile(ownerId, agent);
    const { connection } = await orgoForProfile({ slug: profile.agentSlug, isPrimary: profile.agentIsPrimary, generation: profile.generation }).live();
    if (connection === null) {
      return apiError(request, 409, "computer_connection_unavailable", "The desktop is not ready for a live connection.");
    }
    upstreamUrl = connection.websocketUrl;
  } catch (error) {
    return computerApiFailure(request, error, { context: "Computer WebSocket upstream resolution failed", code: "computer_connection_unavailable", message: "The desktop connection is temporarily unavailable." });
  }

  try {
    return await experimental_upgradeWebSocket((client) => pipeVncSocket(client, upstreamUrl));
  } catch (error) {
    return computerApiFailure(request, error, { context: "Computer WebSocket upgrade failed", status: 501, code: "computer_websocket_unavailable", message: "Live desktop connections are unavailable in this runtime." });
  }
}
