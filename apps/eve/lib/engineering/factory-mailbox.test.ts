import { readFile } from "node:fs/promises";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { digest } from "./contract.ts";
import {
  assertHostedTransport, authenticatePoller, awaitMailboxResponse, enqueueMailboxRequest, hostedMarkerPresent, hostedOwnerScope, transportTimeoutMs, HOSTED_PROFILE, isMailboxFetch,
  leaseMailboxRequest, MAILBOX_LIMITS, mailboxFetch, MailboxRefused, pollerCredentialSha256, respondMailboxRequest, sha256Hex, sweepExpiredMailbox, type MailboxDb,
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
  for (const s of statements) expect(s).toMatch(/^CREATE (UNIQUE )?(TABLE|INDEX) (factory_mailbox_|hosted_verified_previews|hosted_mac_builds)/);
  expect(sql.replace(/'[^']*'/g, "''")).not.toMatch(/\b(ALTER|DROP|UPDATE|DELETE|INSERT|TRUNCATE|GRANT)\b/i);
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

it("v1 per-call timeout: max(existing, 40 s) only for the mailbox transport", () => {
  const db = { query: async () => [] } as MailboxDb, direct = (async () => new Response()) as typeof fetch;
  expect(transportTimeoutMs(direct, 5000)).toBe(5000);
  expect(transportTimeoutMs(mailboxFetch(db, A, "factory", ORIGIN), 5000)).toBe(40_000);
  expect(transportTimeoutMs(mailboxFetch(db, A, "factory", ORIGIN), 12 * 60_000)).toBe(12 * 60_000);
});

const connection = process.env.MAILBOX_TEST_DATABASE_URL;
describe.skipIf(!connection)("hosted Factory mailbox v1 against real PostgreSQL", () => {
  let pool: pg.Pool;
  const db: MailboxDb = { query: async (sql, params) => (await pool.query(sql, params as unknown[])).rows };
  const lease = (b = A, waitMs = 0) => leaseMailboxRequest(db, b, { waitMs, pollMs: 20 });
  const P = (suffix: string) => "/api/connect/v1/" + suffix;
  beforeAll(async () => {
    const target = new URL(connection!);
    if (target.hostname !== "127.0.0.1") throw new Error("Use a disposable local fixture database.");
    pool = new pg.Pool({ connectionString: connection, options: "-c search_path=mailbox_fixture", max: 8 });
    await pool.query("DROP SCHEMA IF EXISTS mailbox_fixture CASCADE; CREATE SCHEMA mailbox_fixture");
    await pool.query(await readFile(migration, "utf8"));
    await pool.query(await readFile(new URL("../../migrations/0112_hosted_mailbox_relay_target.sql", import.meta.url), "utf8"));
  });
  afterAll(async () => { if (pool) { await pool.query("DROP SCHEMA mailbox_fixture CASCADE"); await pool.end(); } });
  beforeEach(async () => {
    await pool.query("TRUNCATE factory_mailbox_requests, hosted_verified_previews, hosted_mac_builds, factory_mailbox_pollers");
    await pool.query("INSERT INTO factory_mailbox_pollers(installation_id,owner_id,credential_sha256) VALUES($1,$2,$3),($4,$5,$6)",
      [A.installationId, A.ownerId, pollerCredentialSha256(CRED_A), B.installationId, B.ownerId, pollerCredentialSha256(CRED_B)]);
  });
  const reply = (envelope: { id: string; leaseId: string; bodySha256: string }, status = 200, body = Buffer.from(""), headers: Record<string, string> = {}) =>
    ({ id: envelope.id, leaseId: envelope.leaseId, requestBodySha256: envelope.bodySha256, status, headers, body: body.toString("base64"), bodySha256: sha256Hex(body), bodyEncoding: "base64" });

  it("authenticates only the enrolled, unrevoked poller of exactly this installation and owner", async () => {
    expect(await authenticatePoller(db, `Bearer ${CRED_A}`, A)).toEqual(A);
    expect(await authenticatePoller(db, `Bearer ${CRED_B}`, A)).toBeNull();
    expect(await authenticatePoller(db, `Bearer ${"c".repeat(43)}`, A)).toBeNull();
    expect(await authenticatePoller(db, CRED_A, A)).toBeNull();
    expect(await authenticatePoller(db, null, A)).toBeNull();
    await pool.query("UPDATE factory_mailbox_pollers SET revoked_at=now() WHERE installation_id=$1", [A.installationId]);
    expect(await authenticatePoller(db, `Bearer ${CRED_A}`, A)).toBeNull();
  });

  it("carries request and response byte-for-byte as base64 with leaseId binding; response headers filtered; envelope cleared at lease, deleted when read", async () => {
    const send = mailboxFetch(db, A, "factory", ORIGIN, { pollMs: 20 });
    const body = Buffer.from([0, 255, 1, 254, ...Buffer.from(JSON.stringify({ requestId: "r-1", note: "unicode ✓" }))]);
    const mac = (async () => {
      const envelope = (await lease(A, 5000))!;
      expect(envelope).toMatchObject({ installationId: A.installationId, ownerId: A.ownerId, target: "factory", method: "POST", path: P("dispatches?x=1"),
        headers: { authorization: "Bearer factory-token", "content-type": "application/octet-stream", "idempotency-key": "k-1" }, bodySha256: sha256Hex(body), bodyEncoding: "base64" });
      expect(envelope.leaseId).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
      expect(Date.parse(envelope.createdAt)).toBeLessThanOrEqual(Date.now() + 1000);
      expect(Buffer.from(envelope.body, "base64").equals(body)).toBe(true);
      const [row] = (await pool.query("SELECT headers, body_base64 FROM factory_mailbox_requests WHERE id=$1", [envelope.id])).rows;
      expect(row).toEqual({ headers: {}, body_base64: "" });
      await respondMailboxRequest(db, A, reply(envelope, 201, Buffer.from('{"ok":true}'), { "content-type": "application/json", etag: '"e1"', "set-cookie": "a=b", server: "x" }));
    })();
    const response = await send(ORIGIN + P("dispatches?x=1"), { method: "POST", body,
      headers: { authorization: "Bearer factory-token", "content-type": "application/octet-stream", "idempotency-key": "k-1" } });
    await mac;
    expect(response.status).toBe(201);
    expect(await response.text()).toBe('{"ok":true}');
    expect(response.headers.get("etag")).toBe('"e1"');
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("server")).toBeNull();
    expect((await pool.query("SELECT count(*)::int AS n FROM factory_mailbox_requests")).rows[0].n).toBe(0);
  });

  it("an unknown request header refuses the whole envelope (never silently dropped)", async () => {
    const send = mailboxFetch(db, A, "factory", ORIGIN);
    await expect(send(ORIGIN + P("x"), { headers: { cookie: "session=secret" } })).rejects.toMatchObject({ code: "MAILBOX_HEADER_NOT_ALLOWED" });
    await expect(send(ORIGIN + P("x"), { headers: { "x-forwarded-for": "1.2.3.4" } })).rejects.toMatchObject({ code: "MAILBOX_HEADER_NOT_ALLOWED" });
    expect((await pool.query("SELECT count(*)::int AS n FROM factory_mailbox_requests")).rows[0].n).toBe(0);
  });

  it("is single use: one lease, no re-lease, one answer bound to id + leaseId + request body digest", async () => {
    const { id } = await enqueueMailboxRequest(db, A, { target: "factory", method: "POST", path: P("p"), body: Buffer.from("x"), deadlineMs: 10_000 });
    const envelope = (await lease())!;
    expect(envelope.id).toBe(id);
    expect(await lease()).toBeNull();
    await expect(respondMailboxRequest(db, A, { ...reply(envelope), requestBodySha256: sha256Hex("y") })).rejects.toMatchObject({ code: "MAILBOX_RESPONSE_REFUSED" });
    await expect(respondMailboxRequest(db, A, { ...reply(envelope), leaseId: "stale-lease-000000000" })).rejects.toMatchObject({ code: "MAILBOX_RESPONSE_REFUSED" });
    await expect(respondMailboxRequest(db, B, reply(envelope))).rejects.toMatchObject({ code: "MAILBOX_RESPONSE_REFUSED" });
    await expect(respondMailboxRequest(db, A, { ...reply(envelope), bodyEncoding: "utf8" })).rejects.toMatchObject({ code: "MAILBOX_RESPONSE_SHAPE" });
    await expect(respondMailboxRequest(db, A, { ...reply(envelope), extra: 1 })).rejects.toMatchObject({ code: "MAILBOX_RESPONSE_SHAPE" });
    await respondMailboxRequest(db, A, reply(envelope));
    await expect(respondMailboxRequest(db, A, reply(envelope))).rejects.toMatchObject({ code: "MAILBOX_RESPONSE_REFUSED" });
  });

  it("refuses a reply after the lease expired, and an expired request is never leased", async () => {
    const { id } = await enqueueMailboxRequest(db, A, { target: "factory", method: "GET", path: P("p"), deadlineMs: 10_000 });
    const envelope = (await lease())!;
    await pool.query("UPDATE factory_mailbox_requests SET lease_expires_at=now() - interval '1 second' WHERE id=$1", [id]);
    await expect(respondMailboxRequest(db, A, reply(envelope))).rejects.toMatchObject({ code: "MAILBOX_RESPONSE_REFUSED" });
    const late = await enqueueMailboxRequest(db, A, { target: "factory", method: "GET", path: P("q"), deadlineMs: 10_000 });
    await pool.query("UPDATE factory_mailbox_requests SET created_at=now() - interval '10 seconds', deadline=now() - interval '5 seconds' WHERE id=$1", [late.id]);
    expect(await lease()).toBeNull();
  });

  it("Mac asleep: the deadline ends the wait as a transport failure, nothing is resent and the request is withdrawn", async () => {
    const { id } = await enqueueMailboxRequest(db, A, { target: "factory", method: "POST", path: P("dispatches"), body: Buffer.from("{}"), deadlineMs: 1000 });
    await expect(awaitMailboxResponse(db, A, id, { pollMs: 20 })).rejects.toMatchObject({ code: "MAILBOX_DEADLINE" });
    expect((await pool.query("SELECT count(*)::int AS n FROM factory_mailbox_requests")).rows[0].n).toBe(0);
    expect(await lease()).toBeNull();
  });

  it("the caller's own signal aborts the wait and withdraws an unleased request", async () => {
    const send = mailboxFetch(db, A, "factory", ORIGIN, { pollMs: 20 });
    await expect(send(ORIGIN + P("x"), { signal: AbortSignal.timeout(100) })).rejects.toBeTruthy();
    expect((await pool.query("SELECT count(*)::int AS n FROM factory_mailbox_requests")).rows[0].n).toBe(0);
  });

  it("enforces v1 method, per-target path, body, queue, deadline and origin limits; isolates installations", async () => {
    await enqueueMailboxRequest(db, B, { target: "factory", method: "GET", path: "/api/health?x=1", deadlineMs: 10_000 });
    expect(await lease(A)).toBeNull();
    expect((await lease(B))?.path).toBe("/api/health?x=1");
    for (const [target, path] of [["factory", "/api/capability-admission/prepare"], ["verifier", "/qdev/v1/verdict"],
      ["relay", "/api/v2/runtime/capability-leases/prepare"], ["relay", "/api/v2/runtime/capability-leases"]] as const)
      await expect(enqueueMailboxRequest(db, B, { target, method: "POST", path, deadlineMs: 10_000 })).resolves.toBeTruthy();
    // P7: an evaluation envelope shorter than 12 minutes would be cut off by its own deadline (refused); at 12 minutes it is accepted.
    await expect(enqueueMailboxRequest(db, B, { target: "verifier", method: "POST", path: "/qdev/v1/evaluate", deadlineMs: 10_000 })).rejects.toMatchObject({ code: "MAILBOX_EVALUATE_DEADLINE" });
    await expect(enqueueMailboxRequest(db, B, { target: "verifier", method: "POST", path: "/qdev/v1/evaluate", deadlineMs: MAILBOX_LIMITS.evaluateDeadlineMs })).resolves.toBeTruthy();
    for (const [target, path] of [["factory", "/qdev/v1/verdict"], ["verifier", "/api/connect/v1/x"], ["relay", "/api/v2/runtime/actions"], ["relay", "/api/v2/runtime/capability-leases/x"],
      ["relay", "/api/v2/control/capability-fences"], ["relay", "/qdev/v1/verdict"], ["factory", "/api/v2/runtime/capability-leases"], ["verifier", "/qdev/v1/artifact/file"], ["verifier", "/qdev/v1/artifact/commit"], ["factory", "/api/other"], ["factory", "/api/connect/v1/a/../b"],
      ["factory", "//api/connect/v1/x"], ["factory", "/api/connect/v1/%2e%2e/b"], ["factory", "/api/connect/v1/x#f"], ["factory", "/api/connect/v1/a\\b"], ["factory", "relative"]] as const)
      await expect(enqueueMailboxRequest(db, B, { target, method: "GET", path, deadlineMs: 10_000 }), path).rejects.toMatchObject({ code: "MAILBOX_PATH" });
    await expect(enqueueMailboxRequest(db, B, { target: "factory", method: "HEAD", path: P("x"), deadlineMs: 10_000 })).rejects.toMatchObject({ code: "MAILBOX_METHOD" });
    for (const method of ["GET", "DELETE"]) await expect(enqueueMailboxRequest(db, B, { target: "factory", method, path: P("x"), body: Buffer.from("x"), deadlineMs: 10_000 })).rejects.toMatchObject({ code: "MAILBOX_BODY" });
    for (const method of ["PUT", "PATCH", "DELETE"]) await expect(enqueueMailboxRequest(db, { ...B }, { target: "factory", method, path: P("m"), deadlineMs: 10_000 })).resolves.toBeTruthy();
    for (let i = 0; i < MAILBOX_LIMITS.maxQueueDepth; i++) await enqueueMailboxRequest(db, A, { target: "factory", method: "GET", path: P("q" + i), deadlineMs: 10_000 });
    await expect(enqueueMailboxRequest(db, A, { target: "factory", method: "GET", path: P("full"), deadlineMs: 10_000 })).rejects.toMatchObject({ code: "MAILBOX_QUEUE_FULL", status: 429 });
    await expect(enqueueMailboxRequest(db, A, { target: "factory", method: "POST", path: P("big"), body: Buffer.alloc(MAILBOX_LIMITS.maxBodyBytes + 1), deadlineMs: 10_000 }))
      .rejects.toMatchObject({ code: "MAILBOX_BODY_TOO_LARGE" });
    await expect(enqueueMailboxRequest(db, B, { target: "factory", method: "GET", path: P("x"), deadlineMs: 3_600_001 })).rejects.toMatchObject({ code: "MAILBOX_DEADLINE" });
    await expect(enqueueMailboxRequest(db, { installationId: "unenrolled", ownerId: "x" }, { target: "factory", method: "GET", path: P("x"), deadlineMs: 10_000 }))
      .rejects.toMatchObject({ code: "MAILBOX_NOT_ENROLLED" });
    await expect(mailboxFetch(db, A, "factory", ORIGIN)("http://127.0.0.1:9999" + P("x"))).rejects.toMatchObject({ code: "MAILBOX_ORIGIN" });
  });

  it("P2 regression: concurrent enqueues are serialized per installation; depth never exceeds 16", async () => {
    const results = await Promise.allSettled(Array.from({ length: 40 }, (_, i) =>
      enqueueMailboxRequest(db, A, { target: "factory", method: "GET", path: P("race" + i), deadlineMs: 10_000 })));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(MAILBOX_LIMITS.maxQueueDepth);
    expect(results.filter(r => r.status === "rejected").every(r => (r as PromiseRejectedResult).reason?.code === "MAILBOX_QUEUE_FULL")).toBe(true);
    expect((await pool.query("SELECT count(*)::int AS n FROM factory_mailbox_requests WHERE installation_id=$1", [A.installationId])).rows[0].n).toBe(16);
    // Another installation has its own queue.
    await expect(enqueueMailboxRequest(db, B, { target: "factory", method: "GET", path: P("b"), deadlineMs: 10_000 })).resolves.toBeTruthy();
    // A slot frees when its request is answered and read (or expires): admission resumes at exactly one more.
    const envelope = (await lease(A))!;
    await respondMailboxRequest(db, A, reply(envelope));
    await awaitMailboxResponse(db, A, envelope.id, { pollMs: 10 });
    const again = await Promise.allSettled([0, 1, 2].map(i => enqueueMailboxRequest(db, A, { target: "factory", method: "GET", path: P("again" + i), deadlineMs: 10_000 })));
    expect(again.filter(r => r.status === "fulfilled")).toHaveLength(1);
  });

  it("P2 regression: abandoned queued rows (credentials) are wiped by an independent sweep, without any further enqueue", async () => {
    const { id } = await enqueueMailboxRequest(db, A, { target: "factory", method: "POST", path: P("dispatches"), headers: { authorization: "Bearer factory-token" },
      body: Buffer.from("{}"), deadlineMs: 10_000 });
    // The waiter was killed (no withdraw ran). The deadline passes; no enqueue of this installation ever happens again.
    await pool.query("UPDATE factory_mailbox_requests SET created_at=now() - interval '20 seconds', deadline=now() - interval '1 second' WHERE id=$1", [id]);
    expect((await pool.query("SELECT headers FROM factory_mailbox_requests WHERE id=$1", [id])).rows[0].headers).toEqual({ authorization: "Bearer factory-token" });
    await sweepExpiredMailbox(db);
    expect((await pool.query("SELECT count(*)::int AS n FROM factory_mailbox_requests")).rows[0].n).toBe(0);
    // The poller of ANY installation sweeps on every poll.
    const other = await enqueueMailboxRequest(db, A, { target: "factory", method: "GET", path: P("x"), deadlineMs: 10_000 });
    await pool.query("UPDATE factory_mailbox_requests SET created_at=now() - interval '20 seconds', deadline=now() - interval '1 second' WHERE id=$1", [other.id]);
    expect(await lease(B)).toBeNull();
    expect((await pool.query("SELECT count(*)::int AS n FROM factory_mailbox_requests")).rows[0].n).toBe(0);
  });

  it("P3 regression: the lease is exactly 30 s; P7: an evaluation lease stays valid until its >= 12 min deadline", async () => {
    await enqueueMailboxRequest(db, A, { target: "factory", method: "GET", path: P("short"), deadlineMs: 10 * 60_000 });
    const short = (await lease(A))!;
    const leaseMs = Date.parse(short.leaseExpiresAt) - Date.now();
    expect(leaseMs).toBeLessThanOrEqual(MAILBOX_LIMITS.leaseMs + 1000);
    expect(leaseMs).toBeGreaterThan(MAILBOX_LIMITS.leaseMs - 5000);
    const send = mailboxFetch(db, A, "verifier", "http://127.0.0.1:8795", { pollMs: 20 });
    const pending = send("http://127.0.0.1:8795/qdev/v1/evaluate", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
    const evaluation = (await lease(A, 5000))!;
    expect(evaluation.path).toBe("/qdev/v1/evaluate");
    expect(Date.parse(evaluation.deadline) - Date.parse(evaluation.createdAt)).toBeGreaterThanOrEqual(MAILBOX_LIMITS.evaluateDeadlineMs - 1000);
    expect(evaluation.leaseExpiresAt).toBe(evaluation.deadline);
    // An answer after 30 s (simulated: 10 minutes into the lease) is still accepted for the evaluation lease.
    await pool.query("UPDATE factory_mailbox_requests SET leased_at=now() - interval '10 minutes' WHERE id=$1", [evaluation.id]);
    await respondMailboxRequest(db, A, reply(evaluation, 200, Buffer.from('{"state":"FINAL"}')));
    expect(await (await pending).text()).toBe('{"state":"FINAL"}');
    // A non-evaluation answer after its 30 s lease is refused.
    await pool.query("UPDATE factory_mailbox_requests SET lease_expires_at=now() - interval '1 second' WHERE id=$1", [short.id]);
    await expect(respondMailboxRequest(db, A, reply(short))).rejects.toMatchObject({ code: "MAILBOX_RESPONSE_REFUSED" });
  });
});

it("P1 regression: a hosted marker forbids every direct loopback Factory/verifier transport (health included)", () => {
  const direct = (async () => new Response()) as typeof fetch, db = { query: async () => [] } as MailboxDb;
  expect(hostedMarkerPresent({})).toBe(false);
  for (const env of [{ MYEVE_HOSTED_PROFILE: "{}" }, { MYEVE_HOSTED_PROFILE: "not json" }, { MYEVE_EXTERNAL_ALPHA_HOSTED_BETA: "true" }, { MYEVE_HOSTED_ANYTHING: "1" }]) {
    expect(hostedMarkerPresent(env)).toBe(true);
    expect(() => assertHostedTransport(direct, ORIGIN, env)).toThrow("HOSTED_DIRECT_LOOPBACK_REFUSED");
    expect(() => assertHostedTransport(mailboxFetch(db, A, "factory", ORIGIN), ORIGIN, env)).not.toThrow();
  }
  expect(() => assertHostedTransport(direct, ORIGIN, {})).not.toThrow();
  expect(() => assertHostedTransport(direct, "https://relay.example.com", { MYEVE_HOSTED_PROFILE: "{}" })).not.toThrow();
  expect(hostedOwnerScope({ installationId: "prj_hosted_owner", ownerId: "jay" })).toBe("myeve.hosted:prj_hosted_owner:jay");
});
