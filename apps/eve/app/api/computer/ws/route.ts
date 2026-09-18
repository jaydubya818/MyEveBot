import { experimental_upgradeWebSocket } from "@vercel/functions";

import { orgoForProfile } from "@/agent/lib/orgo";
import { ensureBrowserProfile } from "@/lib/browser-profiles";
import { getAgent } from "@/lib/agents";
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
    if (!agentId) return new Response("Agent is required.", { status: 400 });
    const ownerId = webPrincipal(request)!.id;
    const agent = await getAgent(ownerId, agentId);
    if (!agent) return new Response("Agent not found.", { status: 404 });
    const profile = await ensureBrowserProfile(ownerId, agent);
    const { connection } = await orgoForProfile({ slug: profile.agentSlug, isPrimary: profile.agentIsPrimary, generation: profile.generation }).live();
    if (connection === null) {
      return new Response("The desktop has nothing to connect to.", { status: 409 });
    }
    upstreamUrl = connection.websocketUrl;
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Orgo request failed.", {
      status: 502,
    });
  }

  try {
    return await experimental_upgradeWebSocket((client) => pipeVncSocket(client, upstreamUrl));
  } catch {
    return new Response("WebSocket upgrades are unavailable in this runtime.", { status: 501 });
  }
}
