import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createWebSessionToken,
  verifyWebSessionToken,
  webAuthConfigStatus,
  webPrincipal,
  requireSameOrigin,
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

describe("QA-32 loopback origin normalization (requireSameOrigin)", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("keeps exact origins in production, including loopback aliases", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(requireSameOrigin(new Request("http://localhost:3000/api/auth/password", {method:"POST",headers:{origin:"http://127.0.0.1:3000"}}))?.status).toBe(403);
    expect(requireSameOrigin(new Request("https://tester.example/api/auth/password", {method:"POST",headers:{origin:"https://tester.example"}}))).toBeNull();
  });
  it.each(["http://localhost:3001", "https://localhost:3000", "http://other.localhost:3000", "null", "invalid origin"])("denies non-equivalent origin %s", origin => {
    expect(requireSameOrigin(new Request("http://localhost:3000/api/threads", {method:"POST",headers:{origin}}))?.status).toBe(403);
  });
  it("allows POST from 127.0.0.1 when request.url is localhost (Next.js rewrite)", () => {
    const request = new Request("http://localhost:3000/api/threads", {
      method: "POST",
      headers: { origin: "http://127.0.0.1:3000" },
    });
    expect(requireSameOrigin(request)).toBeNull();
  });

  it("allows POST from ::1 when request.url is localhost", () => {
    const request = new Request("http://localhost:3000/api/threads", {
      method: "POST",
      headers: { origin: "http://[::1]:3000" },
    });
    expect(requireSameOrigin(request)).toBeNull();
  });

  it("still blocks a genuinely cross-origin POST from a non-loopback origin", () => {
    const request = new Request("http://localhost:3000/api/threads", {
      method: "POST",
      headers: { origin: "https://malicious.example.com" },
    });
    const response = requireSameOrigin(request);
    expect(response).not.toBeNull();
    expect(response?.status).toBe(403);
  });

  it("blocks cross-origin POST when sec-fetch-site is cross-site regardless of origin header", () => {
    const request = new Request("http://localhost:3000/api/threads", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "sec-fetch-site": "cross-site",
      },
    });
    const response = requireSameOrigin(request);
    expect(response).not.toBeNull();
    expect(response?.status).toBe(403);
  });

  it("allows GET requests without an origin header (non-mutation)", () => {
    const request = new Request("http://localhost:3000/api/threads", {
      method: "GET",
    });
    expect(requireSameOrigin(request)).toBeNull();
  });
});
