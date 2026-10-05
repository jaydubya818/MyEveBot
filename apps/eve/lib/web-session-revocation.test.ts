import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { authenticateWebPrincipal, createWebSessionToken, requireWebAuth, revokeWebSession } from "./web-auth";
import { ownerSession } from "../agent/channels/eve";

const database = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../agent/lib/receipts-db.ts", () => ({ db: () => database }));
const revoked = new Set<string>();
const env = {
  NODE_ENV: "production", MYEVE_OWNER_ID: "alpha-owner-a",
  MYEVE_ACCESS_PASSWORD: "a-synthetic-owner-password",
  MYEVE_SESSION_SECRET: "synthetic-secret-for-session-tests-only-000000",
  MYEVE_DURABLE_WEB_SESSIONS: "true",
};
const request = (token: string, path = "/api/files") => new Request("https://alpha.example" + path, {
  headers: { cookie: "myeve_session=" + token },
});
const key = (owner: string, token: string) => owner + ":" + createHash("sha256").update(token).digest("hex");

beforeEach(() => {
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  revoked.clear();
  database.query.mockReset().mockImplementation(async (sql: string, values: string[]) => {
    const id = values[0] + ":" + values[1];
    if (sql.startsWith("INSERT")) { revoked.add(id); return []; }
    return revoked.has(id) ? [{ exists: 1 }] : [];
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("durable owner-session revocation", () => {
  it("revokes copied cookies across API and agent reconnect without revoking another session", async () => {
    const first = createWebSessionToken(), other = createWebSessionToken();
    expect(first).not.toBe(other);
    expect(await requireWebAuth(request(first))).toBeNull();
    expect(await ownerSession()(request(first, "/eve/v1/info"))).toMatchObject({ principalId: env.MYEVE_OWNER_ID });
    await revokeWebSession(request(first, "/api/auth/logout"));
    expect(revoked.has(key(env.MYEVE_OWNER_ID, first))).toBe(true);
    expect((await requireWebAuth(request(first)))?.status).toBe(401);
    expect(await ownerSession()(request(first, "/eve/v1/session/example/stream"))).toBeNull();
    expect(await authenticateWebPrincipal(request(other))).toEqual({ id: env.MYEVE_OWNER_ID });
    expect(JSON.stringify(database.query.mock.calls)).not.toContain(first);
    await revokeWebSession(request(first)); // idempotent logout, never reactivates
    expect(await authenticateWebPrincipal(request(first))).toBeNull();
  });
  it("denies storage outages and propagates an unconfirmed revocation", async () => {
    const token = createWebSessionToken();
    database.query.mockRejectedValue(new Error("storage unavailable"));
    expect(await authenticateWebPrincipal(request(token))).toBeNull();
    expect((await requireWebAuth(request(token)))?.status).toBe(401);
    await expect(revokeWebSession(request(token))).rejects.toThrow("storage unavailable");
  });
  it("rejects expiry, another owner secret, and a stale browser binding before storage", async () => {
    const expired = createWebSessionToken(process.env, Date.now() - 8 * 86400_000);
    expect(await authenticateWebPrincipal(request(expired))).toBeNull();
    const other = createWebSessionToken({ ...process.env, MYEVE_OWNER_ID: "alpha-owner-b", MYEVE_SESSION_SECRET: "another-synthetic-secret-not-shared-00000" });
    expect(await authenticateWebPrincipal(request(other))).toBeNull();
    const stale = request(createWebSessionToken()); stale.headers.set("x-myeve-browser-owner", "alpha-owner-b");
    expect(await authenticateWebPrincipal(stale)).toBeNull();
    expect(database.query).not.toHaveBeenCalled();
  });
  it("preserves the installed legacy boundary until the explicit rollout is enabled", async () => {
    vi.stubEnv("MYEVE_DURABLE_WEB_SESSIONS", "false");
    expect(await authenticateWebPrincipal(request(createWebSessionToken()))).toEqual({ id: env.MYEVE_OWNER_ID });
    expect(database.query).not.toHaveBeenCalled();
  });
});
