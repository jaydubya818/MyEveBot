import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import pg from "pg";

const query = vi.hoisted(() => vi.fn());
vi.mock("../agent/lib/receipts-db.ts", () => ({ db: () => ({ query }) }));
import { POST as login } from "../app/api/auth/login/route";
import { POST as change } from "../app/api/auth/password/route";
import { POST as reset } from "../app/api/auth/reset/route";
import { authenticateWebPrincipal, createWebSessionToken, WEB_SESSION_COOKIE } from "./web-auth";
import { consumeAuthAttempt, credentialFor, issuePasswordReset, authClientKey, bootstrapCredential, replacePassword } from "./password-store";

const connection = process.env.AUTH_TEST_DATABASE_URL;
const oldPassword = "synthetic old password only";
const nextPassword = "synthetic next password only";
const owner = "fixture-owner-a";
const installation = "prj_auth_fixture_a";
const origin = "https://auth-fixture.example";
let pool: pg.Pool;
function request(path: string, body?: object, cookie?: string, source = origin) {
  return new Request(origin + path, { method: "POST", headers: {
    "Content-Type": "application/json", Origin: source, "x-vercel-forwarded-for": "192.0.2.1",
    ...(cookie ? { cookie } : {}),
  }, body: JSON.stringify(body ?? {}) });
}
function cookieOf(response: Response) { return response.headers.get("set-cookie")!.split(";")[0]; }
const principal = (cookie: string) => authenticateWebPrincipal(new Request(origin + "/api/files", { headers: { cookie } }));

describe.skipIf(!connection)("application passwords against real PostgreSQL", () => {
  beforeAll(async () => {
    const target = new URL(connection!);
    if (target.hostname !== "127.0.0.1" || target.port !== "55482") throw new Error("Use the dedicated local auth fixture database.");
    pool = new pg.Pool({ connectionString: connection, options: "-c search_path=auth_password_fixture", max: 12 });
    await pool.query("CREATE SCHEMA IF NOT EXISTS auth_password_fixture");
    await pool.query(await readFile(new URL("../migrations/0108_application_passwords.sql", import.meta.url), "utf8"));
    query.mockImplementation(async (sql: string, params: unknown[]) => (await pool.query(sql, params)).rows);
  });
  afterAll(async () => { if (pool) { await pool.query("DROP SCHEMA auth_password_fixture CASCADE"); await pool.end(); } });
  beforeEach(async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_PROJECT_ID", installation); vi.stubEnv("MYEVE_APPLICATION_PASSWORDS", "true");
    vi.stubEnv("MYEVE_OWNER_ID", owner); vi.stubEnv("MYEVE_ACCESS_PASSWORD", oldPassword);
    vi.stubEnv("MYEVE_SESSION_SECRET", "synthetic fixture session secret at least 32 chars");
    vi.stubEnv("MYEVE_DURABLE_WEB_SESSIONS", "false"); vi.stubEnv("MYEVE_PARTNER_OWNER_ID", "");
    vi.stubEnv("DATABASE_URL", connection!);
    await pool.query("TRUNCATE web_password_credentials,web_password_resets,web_auth_attempts");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("bootstraps only a verified password and preserves the original owner and legacy session", async () => {
    const legacy = `${WEB_SESSION_COOKIE}=${createWebSessionToken({ ...process.env, MYEVE_APPLICATION_PASSWORDS: "false" })}`;
    expect((await login(request("/api/auth/login", { password: "incorrect password" }))).status).toBe(401);
    expect(await credentialFor(owner)).toBeNull();
    const response = await login(request("/api/auth/login", { password: oldPassword }));
    expect(response.status).toBe(200);
    const row = await credentialFor(owner);
    expect(row?.password_hash).toMatch(/^scrypt\$131072\$8\$1\$/);
    expect(row?.version).toBe(0);
    expect(await principal(legacy)).toEqual({ id: owner });
    expect(await principal(cookieOf(response))).toEqual({ id: owner });
  });
  it("changes without redeployment, rejects the env password and revokes every old cookie", async () => {
    const legacy = `${WEB_SESSION_COOKIE}=${createWebSessionToken({ ...process.env, MYEVE_APPLICATION_PASSWORDS: "false" })}`;
    const loggedIn = await login(request("/api/auth/login", { password: oldPassword }));
    const cookie = cookieOf(loggedIn);
    expect((await change(request("/api/auth/password", { currentPassword: oldPassword, newPassword: nextPassword }, cookie))).status).toBe(200);
    expect(process.env.MYEVE_ACCESS_PASSWORD).toBe(oldPassword);
    expect(await principal(cookie)).toBeNull(); expect(await principal(legacy)).toBeNull();
    expect((await login(request("/api/auth/login", { password: oldPassword }))).status).toBe(401);
    const fresh = await login(request("/api/auth/login", { password: nextPassword }));
    expect(fresh.status).toBe(200); expect(await principal(cookieOf(fresh))).toEqual({ id: owner });
  });
  it("denies anonymous, cross-origin, incorrect-current and weak password changes", async () => {
    expect((await change(request("/api/auth/password", {}))).status).toBe(401);
    const cookie = cookieOf(await login(request("/api/auth/login", { password: oldPassword })));
    expect((await change(request("/api/auth/password", { currentPassword: oldPassword, newPassword: nextPassword }, cookie, "https://other.example"))).status).toBe(403);
    expect((await change(request("/api/auth/password", { currentPassword: "wrong-password-value", newPassword: nextPassword }, cookie))).status).toBe(401);
    expect((await change(request("/api/auth/password", { currentPassword: oldPassword, newPassword: "short" }, cookie))).status).toBe(400);
    expect(await principal(cookie)).toEqual({ id: owner });
  });
  it("consumes a recovery token once and revokes cookies while preserving identity", async () => {
    const cookie = cookieOf(await login(request("/api/auth/login", { password: oldPassword })));
    const token = await issuePasswordReset(owner);
    expect(await principal(cookie)).toEqual({ id: owner }); // Issuance does not revoke.
    const stored = await pool.query("SELECT token_hash FROM web_password_resets");
    expect(stored.rows[0].token_hash).not.toBe(token);
    const results = await Promise.all([reset(request("/api/auth/reset", { token, newPassword: nextPassword })), reset(request("/api/auth/reset", { token, newPassword: nextPassword }))]);
    expect(results.map(r => r.status).sort()).toEqual([200, 400]);
    expect(await principal(cookie)).toBeNull();
    expect((await login(request("/api/auth/login", { password: nextPassword }))).status).toBe(200);
    expect((await reset(request("/api/auth/reset", { token, newPassword: "another synthetic password" }))).status).toBe(400);
  });
  it("rejects expired, replaced and cross-installation reset links", async () => {
    await login(request("/api/auth/login", { password: oldPassword }));
    const oldToken = await issuePasswordReset(owner); const token = await issuePasswordReset(owner);
    expect((await reset(request("/api/auth/reset", { token: oldToken, newPassword: nextPassword }))).status).toBe(400);
    vi.stubEnv("VERCEL_PROJECT_ID", "prj_other_fixture");
    expect((await reset(request("/api/auth/reset", { token, newPassword: nextPassword }))).status).toBe(400);
    vi.stubEnv("VERCEL_PROJECT_ID", installation);
    await pool.query("UPDATE web_password_resets SET expires_at=now()-interval '1 second'");
    expect((await reset(request("/api/auth/reset", { token, newPassword: nextPassword }))).status).toBe(400);
  });
  it("allows only one concurrent password change", async () => {
    const cookie = cookieOf(await login(request("/api/auth/login", { password: oldPassword })));
    const results = await Promise.all([nextPassword, "second competing password"].map(newPassword => change(request("/api/auth/password", { currentPassword: oldPassword, newPassword }, cookie))));
    expect(results.filter(r => r.status === 200)).toHaveLength(1);
    expect((await credentialFor(owner))?.version).toBe(1);
  });
  it("enforces a shared limit atomically and resets expired windows", async () => {
    const attempts = await Promise.all(Array.from({ length: 20 }, () => consumeAuthAttempt("fixture", "same-client", 8)));
    expect(attempts.filter(Boolean)).toHaveLength(8);
    await pool.query("UPDATE web_auth_attempts SET expires_at=now()-interval '1 second'");
    expect(await consumeAuthAttempt("fixture", "same-client", 8)).toBe(true);
    expect(authClientKey(request("/api/auth/login"))).toBe("192.0.2.1");
  });
  it("fails closed on database outages and a stale login version", async () => {
    const cookie = cookieOf(await login(request("/api/auth/login", { password: oldPassword })));
    query.mockRejectedValueOnce(new Error("database unavailable"));
    expect(await principal(cookie)).toBeNull();
    query.mockRejectedValueOnce(new Error("database unavailable"));
    expect((await login(request("/api/auth/login", { password: oldPassword }))).status).toBe(503);
  });
  it("rejects reset to another owner's current or unbootstrapped password", async () => {
    const partnerPassword = "synthetic partner password only";
    vi.stubEnv("MYEVE_PARTNER_OWNER_ID", "fixture-owner-b");
    vi.stubEnv("MYEVE_PARTNER_ACCESS_PASSWORD", partnerPassword);
    await login(request("/api/auth/login", { password: oldPassword }));
    const token = await issuePasswordReset(owner);
    expect((await reset(request("/api/auth/reset", { token, newPassword: partnerPassword }))).status).toBe(400);
    await bootstrapCredential("fixture-owner-b", partnerPassword);
    expect((await reset(request("/api/auth/reset", { token, newPassword: partnerPassword }))).status).toBe(400);
    expect((await reset(request("/api/auth/reset", { token, newPassword: nextPassword }))).status).toBe(200);
  });
  it("atomically prevents two owners choosing the same password", async () => {
    await bootstrapCredential(owner, oldPassword);
    await bootstrapCredential("fixture-owner-b", "synthetic partner password only");
    const changed = await Promise.all([owner, "fixture-owner-b"].map(id => replacePassword(id, 0, nextPassword)));
    expect(changed.filter(Boolean)).toHaveLength(1);
    expect((await pool.query("SELECT count(*)::int AS n FROM web_password_credentials WHERE version=1")).rows[0].n).toBe(1);
  });
  it("binds new cookies to the installation even with the same owner and signing key", async () => {
    const cookie = cookieOf(await login(request("/api/auth/login", { password: oldPassword })));
    vi.stubEnv("VERCEL_PROJECT_ID", "prj_other_fixture");
    expect(await principal(cookie)).toBeNull();
  });
});
