import { capabilityMap } from "@/lib/capabilities";
import { requireWebAuth } from "@/lib/web-auth";

// Which optional capabilities this deployment actually has, so the UI can
// hide surfaces that would always be empty. Two inputs: the feature list the
// agent builder baked into the deployment (EVE_ENABLED_FEATURES, unset =
// everything, which is what the personal app runs with) and the presence of
// the env keys a feature needs at runtime.

export async function GET(request: Request): Promise<Response> {
  const denied = requireWebAuth(request);
  if (denied) return denied;

  const capabilities = capabilityMap();
  return Response.json({
    memory: capabilities.memory.state === "ready",
    proactive:
      capabilities.reminders.state !== "excluded" || capabilities.triggers.state !== "excluded",
    integrations: capabilities.connections.state === "ready",
    skills: capabilities.skills.state === "ready",
  });
}
