import { applicationPasswordsEnabled, requireSameOrigin } from "@/lib/web-auth";
import { authClientKey, consumeAuthAttempt, consumeInstallationAttempt, resetPassword, passwordResetOwner } from "@/lib/password-store";
import { passwordUsedByOtherOwner } from "@/lib/password-auth";
import { validPassword } from "@/lib/password-crypto";
import { AuthInputError, authJson, readAuthBody } from "@/lib/auth-request";

export async function POST(request: Request): Promise<Response> {
  const denied = requireSameOrigin(request);
  if (denied) return denied;
  if (!applicationPasswordsEnabled()) return authJson({ error: "Password recovery is not available yet." }, 503);
  try {
    if (!await consumeInstallationAttempt("reset-installation", 60)
      || !await consumeAuthAttempt("reset-client", authClientKey(request), 8))
      return authJson({ error: "Too many attempts. Try again in 15 minutes." }, 429);
    const body = await readAuthBody(request);
    if (typeof body.token !== "string" || !validPassword(body.newPassword))
      return authJson({ error: "Use a password between 15 and 128 characters and a valid reset link." }, 400);
    const owner = await passwordResetOwner(body.token);
    if (owner && await passwordUsedByOtherOwner(owner, body.newPassword))
      return authJson({ error: "Choose a different password." }, 400);
    if (!await resetPassword(body.token, body.newPassword))
      return authJson({ error: "This reset link has expired or has already been used. Ask the owner for a new link." }, 400);
    return authJson({ ok: true, message: "Password reset. All devices have been signed out. Sign in with your new password." });
  } catch (error) {
    return authJson({ error: error instanceof AuthInputError ? error.message : "Password could not be reset. Try again shortly." }, error instanceof AuthInputError ? 400 : 503);
  }
}
