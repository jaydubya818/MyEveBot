import { claimManagedInvite, lookupManagedInvite } from "@/managed/invites";
import { markProvisionFailure, transitionEnvironment } from "@/managed/environments";
import { managedConfig, provisionManagedEve } from "@/managed/provision";

export const maxDuration = 180;

export async function POST(request: Request): Promise<Response> {
  if (process.env.MANAGED_EVE_PROVISIONING_ENABLED !== "true") {
    return Response.json({ error: "Managed beta setup is not open yet" }, { status: 503 });
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.token !== "string" || typeof body.ownerName !== "string" ||
      typeof body.agentName !== "string" || typeof body.ownerTimezone !== "string" ||
      typeof body.accessPassword !== "string") {
    return Response.json({ error: "Complete every required setup field" }, { status: 400 });
  }
  const invite = await lookupManagedInvite(body.token).catch(() => null);
  if (!invite || invite.claimed) {
    return Response.json({ error: "This invitation is invalid, expired, or already used" }, { status: 409 });
  }
  // Validate before consuming the single-use invitation. The configured pin
  // is checked again against Relay before any project mutation.
  try {
    managedConfig({
      ownerName: body.ownerName,
      agentName: body.agentName,
      ownerTimezone: body.ownerTimezone,
      accessPassword: body.accessPassword,
      projectName: `myeve-beta-${"a".repeat(24)}`,
      relayFingerprint: process.env.MANAGED_EVE_RELAY_FINGERPRINT ?? "",
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid setup" }, { status: 400 });
  }
  let environmentId: string | null = null;
  try {
    const claimed = await claimManagedInvite({
      token: body.token,
      ownerName: body.ownerName,
      agentName: body.agentName,
    });
    environmentId = claimed.environmentId;
    await transitionEnvironment({ id: environmentId, from: "approved", to: "provisioning", kind: "provision_started" });
    const deployment = await provisionManagedEve({
      ...claimed,
      ownerName: body.ownerName,
      agentName: body.agentName,
      ownerTimezone: body.ownerTimezone,
      accessPassword: body.accessPassword,
      builderOrigin: new URL(request.url).origin,
    });
    return Response.json({
      environmentId,
      deploymentId: deployment.deploymentId,
      state: "deploying",
    }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (environmentId) {
      await markProvisionFailure(environmentId, "provision", error instanceof Error ? error.message : "Provisioning failed").catch(() => undefined);
    }
    return Response.json({
      error: environmentId
        ? "Setup stopped. The operator can inspect the environment and help recover it."
        : "Invitation could not be claimed. Ask the operator for a new link.",
      environmentId,
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
