import { readFile } from "node:fs/promises";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { digest } from "./contract.ts";
import {
  authenticatePoller, enqueueMailboxRequest, HOSTED_PROFILE, isMailboxFetch, leaseMailboxRequest, MAILBOX_LIMITS, mailboxFetch, MailboxRefused,
  pollerCredentialSha256, respondMailboxRequest, sha256Hex, type MailboxDb,
} from "./factory-mailbox.ts";
import { factoryTransportFetch } from "./factory-transport.ts";
import { LiveFactoryAdapter } from "./factory-live-adapter.ts";

const migration = new URL("../../migrations/0110_hosted_factory_mailbox.sql", import.meta.url);
const ORIGIN = "http://127.0.0.1:8792";
const A = { installationId: "prj_hosted_owner", ownerId: "owner-a" }, B = { installationId: "prj_hosted_tester", ownerId: "owner-b" };
const CRED_A = "a".repeat(43), CRED_B = "b".repeat(43);

it("0110 is additive only: it creates new tables and indexes and never alters, drops or writes existing ones", async () => {
  const sql = (await readFile(migration, "utf8")).replace(/--.*$/gm, "");
  const statements = sql.split(";").map(s => s.trim()).filter(Boolean);
  expect(statements.length).toBeGreaterThan(0);
  for (const s of statements) expect(s).toMatch(/^CREATE (TABLE|INDEX) (factory_mailbox_|hosted_verified_previews)/);
  expect(sql).not.toMatch(/\b(ALTER|DROP|UPDATE|DELETE|INSERT|TRUNCATE|GRANT)\b/i);
});

it("the mailbox option is selectable only for the hosted profile and a loopback connection; loopback stays the direct fetch", () => {
  const direct = (async () => new Response()) as typeof fetch, db = { query: async () => [] } as MailboxDb;
  const config = { origin: ORIGIN, token: "t".repeat(64) };
  expect(factoryTransportFetch(config, { kind: "loopback" }, direct)).toBe(direct);
  const viaMailbox = factoryTransportFetch(config, { kind: "mailbox", profile: HOSTED_PROFILE, db, binding: A });
  expect(isMailboxFetch(viaMailbox)).toBe(true);
  expect(() => factoryTransportFetch(config, { kind: "mailbox", profile: "myeve.private-beta.owner/v1" as never, db, binding: A })).toThrow("FACTORY_MAILBOX_HOSTED_PROFILE_REQUIRED");
  expect(() => factoryTransportFetch({ ...config, origin: "https://myfactory-cloud-production.vercel.app", transport: "CLOUD", protocol: "MYFACTORY_EXECUTION_V2",
    projectId: "prj_4hfceCN8l6wN1gUyYOzZLQ7aJapK" }, { kind: "mailbox", profile: HOSTED_PROFILE, db, binding: A })).toThrow("FACTORY_MAILBOX_HOSTED_PROFILE_REQUIRED");
  expect(() => mailboxFetch(db, A, "factory", "https://factory.example")).toThrow(MailboxRefused);
});

it("the hosted mailbox never carries the unmetered owner subscription route (metered LIVE only)", () => {
  const h = (c: string) => c.repeat(64), sourceDigest = h("1"), configurationDigest = h("2");
  const connection = (mode: string) => ({ origin: ORIGIN, token: h("a"), factoryId: "f", sourceDigest, configurationDigest, factoryVersion: digest({ sourceDigest, configurationDigest }),
    repositoryPath: "/tmp/repo", keys: [{ factoryId: "f", keyId: "k", publicKey: "pem", activeFrom: "2026-01-01T00:00:00Z", notAfter: "2099-01-01T00:00:00Z" }],
    spendContract: { version: "WORK_LEDGER_V2", sourceDigest },
    qualification: { scopeId: "owner", profileHash: h("3"), evidenceRef: "ev", qualifiedAt: "2026-01-01T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z", mode, spendEnforced: true } } as never);
  const db = { query: async () => [] } as MailboxDb;
  const viaMailbox = mailboxFetch(db, A, "factory", ORIGIN);
  expect(() => new LiveFactoryAdapter(connection("OWNER_SUBSCRIPTION_LOCAL"), viaMailbox)).toThrow("FACTORY_MAILBOX_REQUIRES_METERED_LOOPBACK_HOST");
  expect(() => new LiveFactoryAdapter(connection("LIVE"), mailboxFetch(db, A, "factory", "http://127.0.0.1:9999"))).toThrow("FACTORY_MAILBOX_REQUIRES_METERED_LOOPBACK_HOST");
  expect(() => new LiveFactoryAdapter(connection("LIVE"), viaMailbox)).not.toThrow();
  expect(() => new LiveFactoryAdapter(connection("OWNER_SUBSCRIPTION_LOCAL"), (async () => new Response()) as typeof fetch)).not.toThrow();
});

it("poller credentials are compared by hash only", () => {
  expect(pollerCredentialSha256(CRED_A)).toMatch(/^[a-f0-9]{64}$/);
  expect(pollerCredentialSha256(CRED_A)).not.toContain(CRED_A);
  expect(() => pollerCredentialSha256("short")).toThrow(MailboxRefused);
});

const connection = process.env.MAILBOX_TEST_DATABASE_URL;
describe.skipIf(!connection)("hosted Factory mailbox against real PostgreSQL", () => {
  let pool: pg.Pool;
  const db: MailboxDb = { query: async (sql, params) => (await pool.query(sql, params as unknown[])).rows };
  const lease = (b = A, waitMs = 0) => leaseMailboxRequest(db, b, { waitMs, pollMs: 20 });
  beforeAll(async () => {
    const target = new URL(connection!);
    if (target.hostname !== "127.0.0.1") throw new Error("Use a disposable local fixture database.");
    pool = new pg.Pool({ connectionString: connection, options: "-c search_path=mailbox_fixture", max: 8 });
    await pool.query("DROP SCHEMA IF EXISTS mailbox_fixture CASCADE; CREATE SCHEMA mailbox_fixture");
    await pool.query(await readFile(migration, "utf8"));
  });
  afterAll(async () => { if (pool) { await pool.query("DROP SCHEMA mailbox_fixture CASCADE"); await pool.end(); } });
  beforeEach(async () => {
    await pool.query("TRUNCATE factory_mailbox_requests, hosted_verified_previews, factory_mailbox_pollers");
    await pool.query("INSERT INTO factory_mailbox_pollers(installation_id,owner_id,credential_sha256) VALUES($1,$2,$3),($4,$5,$6)",
      [A.installationId, A.ownerId, pollerCredentialSha256(CRED_A), B.installationId, B.ownerId, pollerCredentialSha256(CRED_B)]);
  });
  /** A Mac poller stand-in: leases once, checks the exact bytes, replies with the given response. */
  async function poller(reply: (envelope: NonNullable<Awaited<ReturnType<typeof lease>>>) => { status: number; body: Buffer; headers?: Record<string, string> }) {
    const envelope = await lease(A, 5000);
    if (!envelope) throw new Error("nothing leased");
    const r = reply(envelope);
    await respondMailboxRequest(db, A, { id: envelope.id, requestBodySha256: envelope.bodySha256, status: r.status, headers: r.headers ?? { "content-type": "application/json" },
      body: r.body.toString("base64"), bodySha256: sha256Hex(r.body) });
    return envelope;
  }

  it("authenticates only the enrolled, unrevoked poller of exactly this installation and owner", async () => {
    expect(await authenticatePoller(db, `Bearer ${CRED_A}`, A)).toEqual(A);
    expect(await authenticatePoller(db, `Bearer ${CRED_B}`, A)).toBeNull();
    expect(await authenticatePoller(db, `Bearer ${"c".repeat(43)}`, A)).toBeNull();
    expect(await authenticatePoller(db, CRED_A, A)).toBeNull();
    expect(await authenticatePoller(db, null, A)).toBeNull();
    await pool.query("UPDATE factory_mailbox_pollers SET revoked_at=now() WHERE installation_id=$1", [A.installationId]);
    expect(await authenticatePoller(db, `Bearer ${CRED_A}`, A)).toBeNull();
    const [{ n }] = (await pool.query("SELECT count(*)::int AS n FROM factory_mailbox_pollers WHERE credential_sha256 IN ($1,$2)", [CRED_A, CRED_B])).rows;
    expect(n).toBe(0);
  });

  it("carries the request and response byte-for-byte, allowlists headers, clears the envelope at lease and deletes it when read", async () => {
    const send = mailboxFetch(db, A, "factory", ORIGIN, { pollMs: 20 });
    const body = JSON.stringify({ requestId: "r-1", note: "unicode ✓" });
    const seen = poller(envelope => {
      expect(envelope).toMatchObject({ target: "factory", method: "POST", path: "/api/connect/v1/dispatches?x=1",
        headers: { authorization: "Bearer factory-token", "content-type": "application/json" }, bodySha256: sha256Hex(body) });
      expect(Buffer.from(envelope.body, "base64").toString("utf8")).toBe(body);
      return { status: 201, body: Buffer.from('{"ok":true}') };
    });
    const response = await send(ORIGIN + "/api/connect/v1/dispatches?x=1", { method: "POST", body,
      headers: { authorization: "Bearer factory-token", "content-type": "application/json", cookie: "session=secret", "x-forwarded-for": "1.2.3.4" } });
    const envelope = await seen;
    expect(response.status).toBe(201);
    expect(await response.text()).toBe('{"ok":true}');
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(envelope.headers)).not.toMatch(/cookie|forwarded/);
    expect((await pool.query("SELECT count(*)::int AS n FROM factory_mailbox_requests")).rows[0].n).toBe(0);
  });

  it("is single use: one lease, no re-lease, one answer, bound to the request body digest", async () => {
    const { id } = await enqueueMailboxRequest(db, A, { target: "factory", method: "POST", path: "/p", body: Buffer.from("x"), deadlineMs: 10_000 });
    const envelope = (await lease())!;
    expect(envelope.id).toBe(id);
    const [row] = (await pool.query("SELECT headers, body_base64, state FROM factory_mailbox_requests WHERE id=$1", [id])).rows;
    expect(row).toEqual({ headers: {}, body_base64: "", state: "LEASED" });
    expect(await lease()).toBeNull();
    const answer = (sha: string) => ({ id, requestBodySha256: sha, status: 200, headers: {}, body: "", bodySha256: sha256Hex("") });
    await expect(respondMailboxRequest(db, A, answer(sha256Hex("y")))).rejects.toMatchObject({ code: "MAILBOX_RESPONSE_REFUSED" });
    await expect(respondMailboxRequest(db, B, answer(sha256Hex("x")))).rejects.toMatchObject({ code: "MAILBOX_RESPONSE_REFUSED" });
    await respondMailboxRequest(db, A, answer(sha256Hex("x")));
    await expect(respondMailboxRequest(db, A, answer(sha256Hex("x")))).rejects.toMatchObject({ code: "MAILBOX_RESPONSE_REFUSED" });
    await expect(respondMailboxRequest(db, A, { ...answer(sha256Hex("x")), id: "6f1c1c1e-0000-4000-8000-000000000000" })).rejects.toMatchObject({ code: "MAILBOX_RESPONSE_REFUSED" });
    await expect(respondMailboxRequest(db, A, { ...answer(sha256Hex("x")), extra: 1 })).rejects.toMatchObject({ code: "MAILBOX_RESPONSE_SHAPE" });
  });

  it("refuses a reply after the lease expired, and an expired request is never leased", async () => {
    const { id } = await enqueueMailboxRequest(db, A, { target: "factory", method: "GET", path: "/p", deadlineMs: 10_000 });
    const envelope = (await lease())!;
    await pool.query("UPDATE factory_mailbox_requests SET lease_expires_at=now() - interval '1 second' WHERE id=$1", [id]);
    await expect(respondMailboxRequest(db, A, { id, requestBodySha256: envelope.bodySha256, status: 200, headers: {}, body: "", bodySha256: sha256Hex("") }))
      .rejects.toMatchObject({ code: "MAILBOX_RESPONSE_REFUSED" });
    const late = await enqueueMailboxRequest(db, A, { target: "factory", method: "GET", path: "/q", deadlineMs: 10_000 });
    await pool.query("UPDATE factory_mailbox_requests SET created_at=now() - interval '10 seconds', deadline=now() - interval '5 seconds' WHERE id=$1", [late.id]);
    expect(await lease()).toBeNull();
  });

  it("Mac asleep: the existing deadline ends the wait as a transport failure, nothing is resent and the request is withdrawn", async () => {
    const send = mailboxFetch(db, A, "factory", ORIGIN, { timeoutMs: 1000, pollMs: 20 });
    await expect(send(ORIGIN + "/api/connect/v1/dispatches", { method: "POST", body: "{}" })).rejects.toMatchObject({ code: "MAILBOX_DEADLINE" });
    expect((await pool.query("SELECT count(*)::int AS n FROM factory_mailbox_requests")).rows[0].n).toBe(0);
    expect(await lease()).toBeNull();
  });

  it("the caller's own signal aborts the wait and withdraws an unleased request", async () => {
    const send = mailboxFetch(db, A, "factory", ORIGIN, { pollMs: 20 });
    await expect(send(ORIGIN + "/x", { signal: AbortSignal.timeout(100) })).rejects.toBeTruthy();
    expect((await pool.query("SELECT count(*)::int AS n FROM factory_mailbox_requests")).rows[0].n).toBe(0);
  });

  it("isolates installations and enforces queue, body, path and origin limits", async () => {
    await enqueueMailboxRequest(db, B, { target: "factory", method: "GET", path: "/b", deadlineMs: 10_000 });
    expect(await lease(A)).toBeNull();
    expect((await lease(B))?.path).toBe("/b");
    for (let i = 0; i < MAILBOX_LIMITS.maxQueueDepth; i++) await enqueueMailboxRequest(db, A, { target: "factory", method: "GET", path: "/q" + i, deadlineMs: 10_000 });
    await expect(enqueueMailboxRequest(db, A, { target: "factory", method: "GET", path: "/full", deadlineMs: 10_000 })).rejects.toMatchObject({ code: "MAILBOX_QUEUE_FULL", status: 429 });
    await expect(enqueueMailboxRequest(db, A, { target: "factory", method: "POST", path: "/big", body: Buffer.alloc(MAILBOX_LIMITS.maxBodyBytes + 1), deadlineMs: 10_000 }))
      .rejects.toMatchObject({ code: "MAILBOX_BODY_TOO_LARGE" });
    for (const path of ["/a/../b", "//x", "/a/%2e%2e/b", "relative"]) await expect(enqueueMailboxRequest(db, B, { target: "factory", method: "GET", path, deadlineMs: 10_000 })).rejects.toMatchObject({ code: "MAILBOX_PATH" });
    await expect(enqueueMailboxRequest(db, B, { target: "factory", method: "GET", path: "/x", deadlineMs: 600_000 })).rejects.toMatchObject({ code: "MAILBOX_DEADLINE" });
    await expect(enqueueMailboxRequest(db, { installationId: "unenrolled", ownerId: "x" }, { target: "factory", method: "GET", path: "/x", deadlineMs: 10_000 }))
      .rejects.toMatchObject({ code: "MAILBOX_NOT_ENROLLED" });
    const send = mailboxFetch(db, A, "factory", ORIGIN);
    await expect(send("http://127.0.0.1:9999/x")).rejects.toMatchObject({ code: "MAILBOX_ORIGIN" });
  });
});
