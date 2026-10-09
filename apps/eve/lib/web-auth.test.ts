import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createWebSessionToken,
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
});
