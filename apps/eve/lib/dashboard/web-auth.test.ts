import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWebSessionToken } from "../web-auth.ts";
import { authenticateDashboardWebPrincipal } from "./web-auth.ts";
import { createDashboardReadHandler } from "./read-adapter.ts";

const stores = vi.hoisted(() => ({ credentialVersion: vi.fn(), sessionRevoked: vi.fn() }));
vi.mock("../password-store.ts", () => ({ credentialVersion: stores.credentialVersion }));
vi.mock("../web-session-store.ts", () => ({ sessionRevoked: stores.sessionRevoked }));
const env: NodeJS.ProcessEnv = {
  NODE_ENV: "production", MYEVE_OWNER_ID: "synthetic-owner",
  MYEVE_SESSION_SECRET: "synthetic-dashboard-cookie-secret-not-a-real-credential",
  MYEVE_APPLICATION_PASSWORDS: "true", DATABASE_URL: "synthetic-unused-database",
  MYEVE_DURABLE_WEB_SESSIONS: "true",
};
const signal = () => new AbortController().signal;
const token = (config = env) => createWebSessionToken(config, Date.now(), config.MYEVE_OWNER_ID, 3);
const request = (value: string, extra: Record<string, string> = {}) => new Request("https://dashboard.example/api/dashboard/v1/context", {
  headers: { cookie: "myeve_session=" + encodeURIComponent(value), ...extra },
});
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(Date.UTC(2026, 9, 28));
  stores.credentialVersion.mockReset().mockResolvedValue(3);
  stores.sessionRevoked.mockReset().mockResolvedValue(false);
});
afterEach(() => vi.useRealTimers());

describe("dashboard signed web-session authentication port", () => {
  it("uses real signed owner authentication and stable nonsecret per-session revisions", async () => {
    const first = token(), other = token();
    const result = await authenticateDashboardWebPrincipal(request(first), signal(), env);
    expect(result).toEqual({ ownerId: env.MYEVE_OWNER_ID, sessionRevision: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(await authenticateDashboardWebPrincipal(request(first), signal(), env)).toEqual(result);
    expect((await authenticateDashboardWebPrincipal(request(other), signal(), env))?.sessionRevision).not.toBe(result?.sessionRevision);
    expect(JSON.stringify(result)).not.toContain(first);
    expect(stores.credentialVersion).toHaveBeenCalledWith(env.MYEVE_OWNER_ID, expect.objectContaining({ NODE_ENV: "production" }));
    expect(stores.sessionRevoked).toHaveBeenCalledWith(env.MYEVE_OWNER_ID, first);
  });

  it("denies anonymous and invalid cookies instead of a development owner fallback", async () => {
    const local: NodeJS.ProcessEnv = { ...env, NODE_ENV: "development" };
    for (const value of ["", "invalid", token() + "changed"])
      expect(await authenticateDashboardWebPrincipal(request(value), signal(), local)).toBeNull();
    expect(stores.credentialVersion).not.toHaveBeenCalled();
    expect(stores.sessionRevoked).not.toHaveBeenCalled();
    expect(local.NODE_ENV).toBe("development");
  });

  it("accepts the existing legacy cookie but never falls back past an invalid preferred cookie", async () => {
    const value = token();
    const legacy = new Request("https://dashboard.example/api/dashboard/v1/context", { headers: { cookie: "sofie_session=" + value } });
    expect(await authenticateDashboardWebPrincipal(legacy, signal(), env)).not.toBeNull();
    legacy.headers.set("cookie", "myeve_session=invalid; sofie_session=" + value);
    expect(await authenticateDashboardWebPrincipal(legacy, signal(), env)).toBeNull();
  });

  it("rejects another owner secret, stale browser identity and expired sessions", async () => {
    const foreign = token({ ...env, MYEVE_OWNER_ID: "foreign-owner", MYEVE_SESSION_SECRET: "different-synthetic-session-secret-for-tests" });
    expect(await authenticateDashboardWebPrincipal(request(foreign), signal(), env)).toBeNull();
    expect(await authenticateDashboardWebPrincipal(request(token(), { "x-myeve-browser-owner": "foreign-owner" }), signal(), env)).toBeNull();
    const expired = createWebSessionToken(env, Date.now() - 8 * 86400_000, env.MYEVE_OWNER_ID, 3);
    expect(await authenticateDashboardWebPrincipal(request(expired), signal(), env)).toBeNull();
    expect(stores.sessionRevoked).not.toHaveBeenCalled();
  });

  it("rechecks configured credential changes and durable session revocation on every call", async () => {
    const req = request(token());
    expect(await authenticateDashboardWebPrincipal(req, signal(), env)).not.toBeNull();
    stores.credentialVersion.mockResolvedValue(4);
    expect(await authenticateDashboardWebPrincipal(req, signal(), env)).toBeNull();
    stores.credentialVersion.mockResolvedValue(3); stores.sessionRevoked.mockResolvedValue(true);
    expect(await authenticateDashboardWebPrincipal(req, signal(), env)).toBeNull();
  });

  it.each(["credentialVersion", "sessionRevoked"] as const)("denies an unavailable %s store", async (store) => {
    stores[store].mockRejectedValue(new Error("synthetic unavailable storage"));
    expect(await authenticateDashboardWebPrincipal(request(token()), signal(), env)).toBeNull();
  });

  it("preserves partner private-route refusal after authenticating that configured owner", async () => {
    const config = { ...env, MYEVE_PARTNER_OWNER_ID: "synthetic-partner" };
    const value = createWebSessionToken(config, Date.now(), "synthetic-partner", 3);
    await expect(authenticateDashboardWebPrincipal(request(value), signal(), config)).rejects.toMatchObject({ kind: "forbidden" });
  });

  it("drops authentication when the request cookie changes during a durable lookup", async () => {
    const req = request(token());
    stores.sessionRevoked.mockImplementation(async () => { req.headers.set("cookie", "myeve_session=" + token()); return false; });
    expect(await authenticateDashboardWebPrincipal(req, signal(), env)).toBeNull();
  });

  it("rechecks signed-session expiry after awaiting the configured durable stores", async () => {
    const req = request(token());
    stores.sessionRevoked.mockImplementation(async () => { vi.setSystemTime(Date.now() + 8 * 86400_000); return false; });
    expect(await authenticateDashboardWebPrincipal(req, signal(), env)).toBeNull();
  });

  it("discards a result when cancellation occurs during the existing durable read", async () => {
    const controller = new AbortController();
    stores.sessionRevoked.mockImplementation(async () => { controller.abort(); return false; });
    await expect(authenticateDashboardWebPrincipal(request(token()), controller.signal, env)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects aborted, cross-site, unknown-route and write calls before authentication stores", async () => {
    const value = token(), controller = new AbortController(); controller.abort();
    await expect(authenticateDashboardWebPrincipal(request(value), controller.signal, env)).rejects.toMatchObject({ name: "AbortError" });
    for (const req of [request(value, { origin: "https://foreign.example" }), request(value, { "sec-fetch-site": "cross-site" }),
      new Request("https://dashboard.example/api/dashboard/v1/context", { method: "POST" }),
      new Request("https://dashboard.example/api/files")])
      await expect(authenticateDashboardWebPrincipal(req, signal(), env)).rejects.toMatchObject({ kind: "forbidden" });
    expect(stores.credentialVersion).not.toHaveBeenCalled();
  });

  it("composes with the read handler and leaves missing installation policy denied without a provider read", async () => {
    const read = vi.fn(), binding = vi.fn().mockResolvedValue(null);
    const handler = createDashboardReadHandler({ authenticate: (req, abort) => authenticateDashboardWebPrincipal(req, abort, env), binding, read });
    const response = await handler(request(token()));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Dashboard read unavailable." });
    expect(binding).toHaveBeenCalledWith(expect.objectContaining({ ownerId: env.MYEVE_OWNER_ID }), expect.any(AbortSignal));
    expect(read).not.toHaveBeenCalled();
  });
});
