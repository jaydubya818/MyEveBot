import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { apiError } from "./api-errors.ts";

export const WEB_SESSION_COOKIE = "myeve_session";
export const LEGACY_WEB_SESSION_COOKIE = "sofie_session";
export const WEB_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const MIN_PASSWORD_LENGTH = 12;
const MIN_SECRET_LENGTH = 32;

interface WebSessionPayload {
  exp: number;
  iat: number;
  sub: string;
  v: 1;
}

export interface WebPrincipal {
  id: string;
}

export interface WebAuthConfigStatus {
  configured: boolean;
  missing: string[];
}

function configuredValue(env: NodeJS.ProcessEnv, name: string): string | null {
  const value = env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function configuredAlias(
  env: NodeJS.ProcessEnv,
  preferred: string,
  legacy: string,
): string | null {
  return configuredValue(env, preferred) ?? configuredValue(env, legacy);
}

export function webAuthConfigStatus(env: NodeJS.ProcessEnv = process.env): WebAuthConfigStatus {
  const missing: string[] = [];
  const password = configuredAlias(env, "MYEVE_ACCESS_PASSWORD", "SOFIE_ACCESS_PASSWORD");
  const secret = configuredAlias(env, "MYEVE_SESSION_SECRET", "SOFIE_SESSION_SECRET");
  if (password === null || password.length < MIN_PASSWORD_LENGTH) {
    missing.push("MYEVE_ACCESS_PASSWORD");
  }
  if (secret === null || secret.length < MIN_SECRET_LENGTH) {
    missing.push("MYEVE_SESSION_SECRET");
  }
  return { configured: missing.length === 0, missing };
}

export function webAuthRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production";
}

function ownerId(env: NodeJS.ProcessEnv): string {
  return configuredAlias(env, "MYEVE_OWNER_ID", "SOFIE_OWNER_ID") ?? "owner";
}

function signature(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left.normalize("NFC")).digest();
  const rightHash = createHash("sha256").update(right.normalize("NFC")).digest();
  return timingSafeEqual(leftHash, rightHash);
}

export function passwordMatches(
  candidate: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const expected = configuredAlias(env, "MYEVE_ACCESS_PASSWORD", "SOFIE_ACCESS_PASSWORD");
  return expected !== null && safeEqual(candidate, expected);
}

export function createWebSessionToken(
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
): string {
  const auth = webAuthConfigStatus(env);
  if (!auth.configured) throw new Error("MyEve web authentication is not configured");
  const secret = configuredAlias(env, "MYEVE_SESSION_SECRET", "SOFIE_SESSION_SECRET")!;
  const issuedAt = Math.floor(now / 1000);
  const payload: WebSessionPayload = {
    exp: issuedAt + WEB_SESSION_MAX_AGE_SECONDS,
    iat: issuedAt,
    sub: ownerId(env),
    v: 1,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${signature(encodedPayload, secret)}`;
}

export function verifyWebSessionToken(
  token: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
): WebPrincipal | null {
  if (!token || !webAuthConfigStatus(env).configured) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || parts.some((part) => part.length === 0)) return null;
  const [encodedPayload, suppliedSignature] = parts;
  const secret = configuredAlias(env, "MYEVE_SESSION_SECRET", "SOFIE_SESSION_SECRET")!;
  const expectedSignature = signature(encodedPayload, secret);
  if (!safeEqual(suppliedSignature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<WebSessionPayload>;
    const current = Math.floor(now / 1000);
    if (
      payload.v !== 1 ||
      payload.sub !== ownerId(env) ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number" ||
      payload.iat > current + 60 ||
      payload.exp <= current
    ) {
      return null;
    }
    return { id: payload.sub };
  } catch {
    return null;
  }
}

function cookieValue(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie");
  if (raw === null) return null;
  for (const pair of raw.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0 || pair.slice(0, separator).trim() !== name) continue;
    const value = pair.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}

export function webPrincipal(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
): WebPrincipal | null {
  if (!webAuthRequired(env)) return { id: ownerId(env) };
  return verifyWebSessionToken(
    cookieValue(request, WEB_SESSION_COOKIE) ?? cookieValue(request, LEGACY_WEB_SESSION_COOKIE),
    env,
  );
}

function isUnsafeCrossOrigin(request: Request): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return false;
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return true;
  const origin = request.headers.get("origin");
  if (origin === null) return false;
  try {
    return new URL(origin).origin !== new URL(request.url).origin;
  } catch {
    return true;
  }
}

export function requireSameOrigin(request: Request): Response | null {
  return isUnsafeCrossOrigin(request)
    ? apiError(request, 403, "cross_origin_request", "This request was not allowed.")
    : null;
}

/**
 * Protects Next.js route handlers with the same signed owner session used by
 * the Eve HTTP channel. Development stays frictionless; production fails
 * closed when credentials are missing or the cookie is invalid.
 */
export function requireWebAuth(request: Request): Response | null {
  if (!webAuthRequired()) return null;
  if (!webAuthConfigStatus().configured) {
    return apiError(
      request,
      503,
      "auth_not_configured",
      "Personal-agent access is not configured for this deployment.",
    );
  }
  const crossOrigin = requireSameOrigin(request);
  if (crossOrigin) return crossOrigin;
  if (webPrincipal(request) === null) {
    return apiError(request, 401, "authentication_required", "Sign in to continue.");
  }
  return null;
}
