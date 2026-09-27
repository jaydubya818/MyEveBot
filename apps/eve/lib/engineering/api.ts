import { webPrincipal } from "../web-auth.ts";
import { WorkError } from "./types.ts";
export function engineeringPrincipal(request: Request) {
  // Internal qualification only until business identity and execution are qualified.
  if (process.env.MYEVE_ENGINEERING_MODE !== "dogfood")
    throw new WorkError(
      "engineering_disabled",
      "Engineering is not enabled in this deployment.",
      404,
    );
  const principal = webPrincipal(request, {
    ...process.env,
    NODE_ENV: "production",
  });
  if (!principal)
    throw new WorkError(
      "sign_in_required",
      "Sign in to this workspace first.",
      401,
    );
  if (
    request.method !== "GET" &&
    (request.headers.get("origin") !== new URL(request.url).origin ||
      request.headers.get("sec-fetch-site") === "cross-site")
  )
    throw new WorkError(
      "same_origin_required",
      "A same-origin workspace action is required.",
      403,
    );
  return {
    scopeId: principal.id,
    actorId: principal.id,
    scopeKind: "personal" as const,
  };
}
