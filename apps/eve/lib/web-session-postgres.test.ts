import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { loadMigrations, runMigrations } from "../scripts/migration-runner";
import { createWebSessionToken, authenticateWebPrincipal, revokeWebSession } from "./web-auth";

const adapter = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../agent/lib/receipts-db.ts", () => ({ db: () => adapter }));
const connection = process.env.MYEVE_VALIDATION_POSTGRES_URL;
const schema = "web_sessions_" + randomUUID().replaceAll("-", "");
const { Pool } = createRequire(import.meta.url)("pg");
let pool: any, admin: any;
let databaseUrl: string;
const env = { NODE_ENV: "production", MYEVE_OWNER_ID: "synthetic-owner",
  MYEVE_ACCESS_PASSWORD: "synthetic-owner-password", MYEVE_SESSION_SECRET: "synthetic-session-secret-long-enough-00000",
  MYEVE_DURABLE_WEB_SESSIONS: "true" };
const request = (token: string) => new Request("https://alpha.example/api/files", { headers: { cookie: "myeve_session=" + token } });
const database = () => ({
  query: async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows,
  transaction: async (statements: { sql: string; params?: unknown[] }[]) => {
    const client = await pool.connect();
    try { await client.query("BEGIN"); const results = [];
      for (const statement of statements) results.push((await client.query(statement.sql, statement.params)).rows);
      await client.query("COMMIT"); return results;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  },
});

describe.skipIf(!connection)("PostgreSQL session revocation", () => {
  beforeAll(async () => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    admin = new Pool({ connectionString: connection });
    await admin.query('CREATE DATABASE "' + schema + '"');
    const url = new URL(connection!); url.pathname = "/" + schema; databaseUrl = url.href;
    pool = new Pool({ connectionString: databaseUrl });
    await runMigrations(database(), await loadMigrations(), () => {});
    adapter.query.mockImplementation(async (sql: string, params: unknown[]) => (await pool.query(sql, params)).rows);
  }, 60_000);
  afterAll(async () => {
    await pool?.end();
    if (admin) { await admin.query('DROP DATABASE "' + schema + '" WITH (FORCE)'); await admin.end(); }
    vi.unstubAllEnvs();
  });
  it("preserves revocation across connections, independent sessions, and operator reruns", async () => {
    const first = createWebSessionToken(), second = createWebSessionToken();
    expect(await authenticateWebPrincipal(request(first))).toEqual({ id: env.MYEVE_OWNER_ID });
    await Promise.all([revokeWebSession(request(first)), revokeWebSession(request(first))]);
    await pool.end();
    pool = new Pool({ connectionString: databaseUrl });
    expect(await authenticateWebPrincipal(request(first))).toBeNull();
    expect(await authenticateWebPrincipal(request(second))).toEqual({ id: env.MYEVE_OWNER_ID });
    await runMigrations(database(), await loadMigrations(), () => {});
    const rows = (await pool.query("SELECT * FROM web_session_revocations")).rows;
    expect(rows).toHaveLength(1); expect(rows[0].token_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(rows)).not.toContain(first);
    const migration = (await loadMigrations()).find(m => m.name === "0083_web_session_revocations.sql")!;
    const ledger = (await pool.query("SELECT checksum FROM sofie_schema_migrations WHERE name=$1", [migration.name])).rows;
    expect(ledger).toEqual([{ checksum: migration.checksum }]);
  });
});
