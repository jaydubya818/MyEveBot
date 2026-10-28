import { createHash } from "node:crypto";
import {
  authenticateWebPrincipal, verifyWebSessionToken, cookieValue, WEB_SESSION_COOKIE, LEGACY_WEB_SESSION_COOKIE,
} from "../web-auth.ts";
import { isPartnerPrincipal, partnerPrivateRoute } from "../private-owner-boundary.ts";
import { DashboardProviderError, type DashboardPrincipal } from "./read-adapter.ts";

const paths = new Set(["/api/dashboard/v1/context", "/api/dashboard/v1/observation"]);
const selectedToken = (request: Request) =>
  cookieValue(request, WEB_SESSION_COOKIE) ?? cookieValue(request, LEGACY_WEB_SESSION_COOKIE);

/** Signed web-session authentication port only. No route, policy or read grant.
 * Environment is a trusted host dependency, never browser-provided configuration. */
export async function authenticateDashboardWebPrincipal(
  request: Request,
  signal: AbortSignal,
  env: NodeJS.ProcessEnv = process.env,
): Promise<DashboardPrincipal | null> {
  signal.throwIfAborted();
  const url = new URL(request.url);
  if (request.method !== "GET" || !paths.has(url.pathname) ||
    request.headers.get("sec-fetch-site") === "cross-site" ||
    request.headers.has("origin") && request.headers.get("origin") !== url.origin)
    throw new DashboardProviderError("forbidden");
  const token = selectedToken(request);
  if (!token || token.length > 4096) return null;
  // Require a real signed cookie even on a local development host. The existing
  // authenticator still owns credential-version and configured durable logout
  // checks. This copy does not mutate environment or issue a session/grant.
  const config: NodeJS.ProcessEnv = { ...env, NODE_ENV: "production" };
  const principal = await authenticateWebPrincipal(request, config);
  signal.throwIfAborted();
  if (!principal || selectedToken(request) !== token ||
    verifyWebSessionToken(token, config)?.id !== principal.id) return null;
  if (isPartnerPrincipal(principal.id, config) && !partnerPrivateRoute(url.pathname, request.method))
    throw new DashboardProviderError("forbidden");
  return {
    ownerId: principal.id,
    sessionRevision: createHash("sha256").update("myeve.dashboard.web-session/v1\0")
      .update(principal.id).update("\0").update(token).digest("hex"),
  };
}
