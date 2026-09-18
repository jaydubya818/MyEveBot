import { orgoForProfile } from "@/agent/lib/orgo";
import { apiError, requireDatabase } from "@/lib/api-errors";
import {
  advanceBrowserProfileGeneration,
  ensureAllBrowserProfiles,
  getBrowserProfile,
  revokeBrowserProfileGrant,
  setBrowserProfileStatus,
  shareBrowserProfile,
  type BrowserProfileView,
} from "@/lib/browser-profiles";
import { requireWebAuth, webPrincipal } from "@/lib/web-auth";

function guard(request: Request): Response | null {
  return requireWebAuth(request) ?? requireDatabase(request);
}

function descriptor(profile: BrowserProfileView) {
  return { slug: profile.agentSlug, isPrimary: profile.agentIsPrimary, generation: profile.generation };
}

export async function GET(request: Request): Promise<Response> {
  const denied = guard(request);
  if (denied) return denied;
  try {
    return Response.json({ profiles: await ensureAllBrowserProfiles(webPrincipal(request)!.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Persistent browser profiles could not be listed", error);
    return apiError(request, 503, "browser_profiles_unavailable", "Persistent browser profiles are temporarily unavailable.");
  }
}

export async function PATCH(request: Request): Promise<Response> {
  const denied = guard(request);
  if (denied) return denied;
  const ownerId = webPrincipal(request)!.id;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const profileId = typeof body?.profileId === "string" ? body.profileId : "";
  const action = typeof body?.action === "string" ? body.action : "";
  if (!profileId.startsWith("browser_profile_")) return apiError(request, 400, "invalid_browser_profile", "Choose a valid browser profile.");
  try {
    if (action === "ready" || action === "takeover_required" || action === "reconnect_required") {
      await setBrowserProfileStatus({ ownerId, profileId, status: action, failureSummary: typeof body?.reason === "string" ? body.reason.slice(0, 500) : null });
    } else if (action === "share" || action === "revoke_share") {
      if (typeof body?.agentId !== "string") return apiError(request, 400, "invalid_profile_grantee", "Choose an Agent.");
      if (action === "share") await shareBrowserProfile(ownerId, profileId, body.agentId);
      else await revokeBrowserProfileGrant(ownerId, profileId, body.agentId);
    } else if (action === "reset") {
      if (body?.confirmation !== `RESET ${profileId}`) return apiError(request, 400, "browser_profile_reset_unconfirmed", "Confirm the exact browser profile reset.");
      const profile = await getBrowserProfile(ownerId, profileId);
      if (!profile) return apiError(request, 404, "browser_profile_not_found", "Persistent browser profile not found.");
      await orgoForProfile(descriptor(profile)).delete();
      await advanceBrowserProfileGeneration(ownerId, profileId);
    } else {
      return apiError(request, 400, "invalid_browser_profile_action", "Choose a supported browser profile action.");
    }
    return Response.json({ profiles: await ensureAllBrowserProfiles(ownerId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Persistent browser profile could not be updated.";
    return apiError(request, /not found/i.test(message) ? 404 : 409, "browser_profile_update_failed", message);
  }
}
