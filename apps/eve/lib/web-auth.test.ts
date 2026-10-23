import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applicationPasswordsEnabled,
  createWebSessionToken,
  requireSameOrigin,
  verifyWebSessionToken,
  webAuthConfigStatus,
  webPrincipal,
  WEB_SESSION_COOKIE,
} from "./web-auth";

const env = {
  NODE_ENV: "production",
  MYEVE_ACCESS_PASSWORD: "a-production-password",
  MYEVE_SESSION_SECRET: "a-session-secret-that-is-long-enough-for-production",
  MYEVE_OWNER_ID: "owner-123",
} as NodeJS.ProcessEnv;

describe("web owner authentication", () => {
  afterEach(() => vi.useRealTimers());
  it("accepts a signed owner session", () => {
    const now = Date.UTC(2026, 8, 14);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const token = createWebSessionToken(env, now);
    const request = new Request("https://sofie.example/api/files", {
      headers: { cookie: `${WEB_SESSION_COOKIE}=${encodeURIComponent(token)}` },
    });

    expect(webAuthConfigStatus(env)).toEqual({ configured: true, missing: [] });
    expect(webPrincipal(request, env)).toEqual({ id: "owner-123" });
  });

  it("rejects a modified session token", () => {
    const now = Date.UTC(2026, 8, 14);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const token = createWebSessionToken(env, now);

    expect(verifyWebSessionToken(`${token}modified`, env, now)).toBeNull();
  });

  it("treats loopback 127.0.0.1 and localhost as the same origin (QA-32)", () => {
    const request = new Request("http://localhost:3091/api/auth/login", {
      method: "POST",
      headers: { origin: "http://127.0.0.1:3091" },
    });
    expect(requireSameOrigin(request)).toBeNull();
  });

  it("still rejects a different host origin", () => {
    const request = new Request("http://localhost:3091/api/auth/login", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    });
    expect(requireSameOrigin(request)?.status).toBe(403);
  });

  it("keeps application-password mode off unless explicitly enabled", () => {
    expect(applicationPasswordsEnabled(env)).toBe(false);
    expect(applicationPasswordsEnabled({ ...env, MYEVE_APPLICATION_PASSWORDS: "true" })).toBe(true);
  });
});
