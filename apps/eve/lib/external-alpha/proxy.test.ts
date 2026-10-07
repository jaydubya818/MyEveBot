import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../../proxy.ts";
import { hrefAllowed } from "../../components/owner/destination-gate.tsx";

const call = (path: string, method = "GET") => proxy(new NextRequest(new URL(path, "https://alpha.example.test"), { method }));

describe("proxy: server-side default-deny for external-alpha installations", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("returns 404 for denied and unclassified routes, before authentication or any other branch", async () => {
    vi.stubEnv("EVE_PROJECT_NAME", "myeve-alpha-tester-1");
    for (const [path, method] of [
      ["/api/email/send", "POST"], ["/api/routines", "POST"], ["/api/slack", "POST"], ["/api/computer-sessions", "POST"],
      ["/api/relay/owner-execution", "POST"], ["/api/beta/owner-decision", "POST"], ["/api/production-canary", "POST"],
      ["/api/local-computer/worker", "POST"], ["/eve/v1/channels/slack", "POST"], ["/eve/v1/hooks/a", "POST"],
      ["/rooms", "GET"], ["/computer", "GET"], ["/manage", "GET"], ["/memory", "GET"], ["/api/never-classified", "GET"], ["/x.png", "GET"],
      ["/api/threads/%2e%2e/email", "GET"],
    ] as const) {
      const response = await call(path, method);
      expect(response.status, `${method} ${path}`).toBe(404);
      expect(await response.text()).toBe("");
    }
  });
  it("lets allowlisted routes continue to the normal authentication chain", async () => {
    vi.stubEnv("EVE_PROJECT_NAME", "myeve-alpha-tester-1");
    for (const [path, method] of [["/api/threads", "POST"], ["/api/work-inbox", "GET"], ["/eve/v1/session", "POST"], ["/login", "GET"], ["/_next/static/a.js", "GET"]] as const)
      expect((await call(path, method)).status, `${method} ${path}`).not.toBe(404);
  });
  it("serves Memory only with the explicit local backend flag", async () => {
    vi.stubEnv("EVE_PROJECT_NAME", "myeve-alpha-tester-1");
    expect((await call("/api/memories")).status).toBe(404);
    vi.stubEnv("MYEVE_EXTERNAL_ALPHA_MEMORY_BACKEND", "local-postgres");
    expect((await call("/api/memories")).status).not.toBe(404);
  });
  it("does not change any deployment that is not an installation", async () => {
    vi.stubEnv("EVE_PROJECT_NAME", "myeve-production");
    expect((await call("/api/email/send", "POST")).status).not.toBe(404);
    expect((await call("/api/never-classified")).status).not.toBe(404);
  });
});

describe("navigation gate", () => {
  it("shows everything outside an installation and only allowlisted hrefs inside one", () => {
    expect(hrefAllowed(null, "/anything")).toBe(true);
    expect(hrefAllowed(["/today"], "/today")).toBe(true);
    expect(hrefAllowed(["/today"], "/rooms")).toBe(false);
    expect(hrefAllowed([], "/today")).toBe(false);
  });
});
