import { NextResponse } from "next/server";

import {
  createWebSessionToken,
  ownerForPassword,
  WEB_SESSION_COOKIE,
  WEB_SESSION_MAX_AGE_SECONDS,
  requireSameOrigin,
  webAuthConfigStatus,
  webAuthRequired,
  applicationPasswordsEnabled,
} from "@/lib/web-auth";
import { authenticatePassword } from "@/lib/password-auth";
import { authClientKey, consumeAuthAttempt, consumeInstallationAttempt } from "@/lib/password-store";
import { AuthInputError, authJson, readAuthBody } from "@/lib/auth-request";

const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const attempts = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function rateLimited(request: Request): boolean {
  const now = Date.now();
  const key = clientKey(request);
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 0, resetAt: now + ATTEMPT_WINDOW_MS });
    return false;
  }
  return current.count >= MAX_ATTEMPTS;
}

function recordFailure(request: Request): void {
  const now = Date.now();
  const key = clientKey(request);
  const current = attempts.get(key);
  attempts.set(
    key,
    current && current.resetAt > now
      ? { ...current, count: current.count + 1 }
      : { count: 1, resetAt: now + ATTEMPT_WINDOW_MS },
  );
}

export async function POST(request: Request): Promise<Response> {
  const crossOrigin = requireSameOrigin(request);
  if (crossOrigin) return crossOrigin;
  if (!webAuthRequired()) return NextResponse.json({ ok: true, localDevelopment: true });
  if (!webAuthConfigStatus().configured) {
    return NextResponse.json(
      { error: "Personal-agent access is not configured for this deployment." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  let limited: boolean;
  try {
    limited = applicationPasswordsEnabled()
      ? !await consumeInstallationAttempt("login-installation", 120)
        || !await consumeAuthAttempt("login-client", authClientKey(request), 12)
      : rateLimited(request);
  } catch { return authJson({ error: "Sign-in is temporarily unavailable. Try again shortly." }, 503); }
  if (limited) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "900" } },
    );
  }
  let ownerId: string | null = null;
  let version: number | undefined;
  try {
    const body = await readAuthBody(request);
    if (typeof body.password === "string" && body.password.length <= 128) {
      if (applicationPasswordsEnabled()) {
        const credential = await authenticatePassword(body.password);
        ownerId = credential?.owner_id ?? null;
        version = credential?.version;
      } else ownerId = ownerForPassword(body.password);
    }
  } catch (error) {
    return authJson({ error: error instanceof AuthInputError ? error.message : "Sign-in is temporarily unavailable. Try again shortly." }, error instanceof AuthInputError ? 400 : 503);
  }
  if (!ownerId) {
    if (!applicationPasswordsEnabled()) recordFailure(request);
    return NextResponse.json(
      { error: "That password did not match." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const token = createWebSessionToken(process.env, Date.now(), ownerId, version);
  if (process.env.MYEVE_DURABLE_WEB_SESSIONS === "true") {
    try {
      const { sessionRevoked } = await import("@/lib/web-session-store");
      if (await sessionRevoked(ownerId, token)) throw new Error("Session unavailable");
    } catch {
      return NextResponse.json({ error: "Sign-in is temporarily unavailable." }, {
        status: 503, headers: { "Cache-Control": "no-store" },
      });
    }
  }
  attempts.delete(clientKey(request));
  const response = NextResponse.json({ ok: true });
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set({
    name: WEB_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    maxAge: WEB_SESSION_MAX_AGE_SECONDS,
    path: "/",
    priority: "high",
    sameSite: "strict",
    secure: true,
  });
  return response;
}
