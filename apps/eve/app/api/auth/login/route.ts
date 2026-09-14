import { NextResponse } from "next/server";

import {
  createWebSessionToken,
  passwordMatches,
  WEB_SESSION_COOKIE,
  WEB_SESSION_MAX_AGE_SECONDS,
  requireSameOrigin,
  webAuthConfigStatus,
  webAuthRequired,
} from "@/lib/web-auth";

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
  if (rateLimited(request)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "900" } },
    );
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 4096) {
    return NextResponse.json({ error: "Invalid request." }, { status: 413 });
  }
  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  if (body === null || typeof body.password !== "string" || !passwordMatches(body.password)) {
    recordFailure(request);
    return NextResponse.json(
      { error: "That password did not match." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  attempts.delete(clientKey(request));
  const response = NextResponse.json({ ok: true });
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set({
    name: WEB_SESSION_COOKIE,
    value: createWebSessionToken(),
    httpOnly: true,
    maxAge: WEB_SESSION_MAX_AGE_SECONDS,
    path: "/",
    priority: "high",
    sameSite: "strict",
    secure: true,
  });
  return response;
}
