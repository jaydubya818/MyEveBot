import { NextResponse } from "next/server";
import { applicationPasswordsEnabled, authenticateWebPrincipal, requireSameOrigin, WEB_SESSION_COOKIE, LEGACY_WEB_SESSION_COOKIE } from "@/lib/web-auth";
import { authClientKey, consumeAuthAttempt, replacePassword } from "@/lib/password-store";
import { authenticatePassword, passwordUsedByOtherOwner } from "@/lib/password-auth";
import { validPassword } from "@/lib/password-crypto";
import { AuthInputError, authJson, readAuthBody } from "@/lib/auth-request";

export async function POST(request: Request): Promise<Response> {
  const denied = requireSameOrigin(request);
  if (denied) return denied;
  if (!applicationPasswordsEnabled()) return authJson({ error: "Password management is not available yet." }, 503);
  try {
    const principal = await authenticateWebPrincipal(request);
    if (!principal) return authJson({ error: "Your session expired. Sign in again." }, 401);
    if (!await consumeAuthAttempt("change-password", principal.id, 8)
      || !await consumeAuthAttempt("change-password-client", authClientKey(request), 12))
      return authJson({ error: "Too many attempts. Try again in 15 minutes." }, 429);
    const body = await readAuthBody(request);
    if (typeof body.currentPassword !== "string" || !validPassword(body.newPassword))
      return authJson({ error: "Use a new password between 15 and 128 characters." }, 400);
    const credential = await authenticatePassword(body.currentPassword);
    if (!credential || credential.owner_id !== principal.id)
      return authJson({ error: "Your current password did not match." }, 401);
    if (body.currentPassword.normalize("NFC") === body.newPassword.normalize("NFC")
      || await passwordUsedByOtherOwner(principal.id, body.newPassword))
      return authJson({ error: "Choose a different password." }, 400);
    if (!await replacePassword(principal.id, credential.version, body.newPassword))
      return authJson({ error: "Your password changed during this request. Sign in again." }, 409);
    const response = NextResponse.json({ ok: true, message: "Password changed. All devices have been signed out. Sign in with your new password." }, { headers: { "Cache-Control": "no-store" } });
    for (const name of [WEB_SESSION_COOKIE, LEGACY_WEB_SESSION_COOKIE]) response.cookies.set({ name, value: "", maxAge: 0, path: "/", httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production" });
    return response;
  } catch (error) {
    return authJson({ error: error instanceof AuthInputError ? error.message : "Password could not be changed. Try again shortly." }, error instanceof AuthInputError ? 400 : 503);
  }
}
