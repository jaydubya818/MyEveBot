import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * Outbound-only Factory mailbox, hosted side (output/private-beta-20261103/hosted/MAILBOX-CONTRACT.md v1).
 *
 * Hosted MyEve cannot reach the owner's Mac. Instead of calling the loopback Factory host, the existing Factory clients send through a
 * `fetch`-compatible function that enqueues the exact request (method, path, allowlisted headers, body bytes and their sha256) in an
 * owner/installation-scoped Postgres row and awaits the matching response. The Mac polls outbound (GET next), forwards the request unchanged
 * to its own 127.0.0.1 host and posts the reply (POST respond).
 *
 * The mailbox is untrusted transport. It authorizes nothing and verifies no Factory signature: every FENCE, PERMIT, challenge, prepare,
 * dispatch claim and Result is still verified end to end by the existing clients and the Factory host. Its own guarantees are transport ones:
 *  - single use: a request id is leased at most once and never returns to the queue, so nothing is resent; a second claim finds nothing;
 *  - each lease has a fresh `leaseId`; a response binds to id + leaseId + the request body sha256 and is accepted only while that lease and the
 *    deadline are live (stale lease or digest mismatch is refused);
 *  - bodies travel as canonical padded base64 (`bodyEncoding: "base64"`), `bodySha256` over the decoded bytes;
 *  - method, path (per target) and request-header allowlists are exact: an unknown request header refuses the envelope; response headers are
 *    filtered (set-cookie and everything else not listed is dropped);
 *  - the caller's deadline bounds the wait (mailbox per-call timeout = max(existing, 40 s), <= 1 h); on timeout the caller sees a transport
 *    failure (its existing UNKNOWN / readback-by-identity handling) and an unleased request is withdrawn so it can never run later;
 *  - limits: body <= 1 MiB each way, queue depth <= 16 per installation (admission serialized by a unique per-installation queue slot, so
 *    concurrent enqueues can never exceed it), lease exactly 30 s (contract v1), poll wait <= 25 s. No streaming.
 *  - P7: a verifier `/qdev/v1/evaluate` envelope gets a deadline of at least 12 minutes and its lease stays valid until that deadline (the
 *    poller forwards it for up to 720 s), so a correct evaluation answer is never refused as a stale lease and the evaluation does not fence UNKNOWN.
 * Request headers and bodies are cleared from the row the moment the Mac leases them; answered rows are deleted when the caller reads them.
 * Expired rows (and with them any unleased authorization header and body) are removed independently of enqueues: by every poll, respond,
 * wait and enqueue of any installation (sweepExpiredMailbox), so a waiter killed by the platform cannot leave credentials behind.
 */
export const HOSTED_PROFILE = "myeve.private-beta.hosted/v1" as const;
export const MAILBOX_LIMITS = { maxBodyBytes: 1 << 20, maxQueueDepth: 16, leaseMs: 30_000, maxWaitMs: 25_000,
  maxDeadlineMs: 3_600_000, minCallMs: 40_000, evaluateDeadlineMs: 12 * 60_000, evaluateForwardMs: 720_000 } as const;
/** The one long-running path (contract proposal P7): the verifier's charged evaluation. */
export const MAILBOX_EVALUATE_PATH = "/qdev/v1/evaluate" as const;

/**
 * Any hosted marker in the environment makes this a hosted installation: then every Factory/verifier call must use the mailbox transport
 * (never a direct loopback fetch) and owner-local launchers are never selected. A malformed marker still counts (fail closed).
 */
export const HOSTED_MARKERS = ["MYEVE_HOSTED_PROFILE", "MYEVE_EXTERNAL_ALPHA_HOSTED_BETA"] as const;
export function hostedMarkerPresent(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return HOSTED_MARKERS.some(name => typeof env[name] === "string" && env[name] !== "")
    || Object.keys(env).some(name => name.startsWith("MYEVE_HOSTED_") && typeof env[name] === "string" && env[name] !== "");
}
/** The stable per-person Factory ownerScope of a hosted installation (owner, Tester 1 and Tester 2 are separate installations). */
export function hostedOwnerScope(p: { installationId: string; ownerId: string }): string {
  return `myeve.hosted:${p.installationId}:${p.ownerId}`;
}
/** Refuses a direct (non-mailbox) transport to a loopback Factory/verifier host when this process is a hosted installation. */
export function assertHostedTransport(fetcher: unknown, origin: string | URL, env: Readonly<Record<string, string | undefined>> = process.env): void {
  if (!hostedMarkerPresent(env) || isMailboxFetch(fetcher)) return;
  let host = "";
  try { host = new URL(String(origin)).hostname; } catch { /* unparsable: refuse below */ }
  if (host === "" || host === "127.0.0.1" || host === "localhost" || host === "[::1]") throw new MailboxRefused("HOSTED_DIRECT_LOOPBACK_REFUSED", 503);
}
export const MAILBOX_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export const MAILBOX_REQUEST_HEADERS = ["authorization", "content-type", "accept", "idempotency-key", "last-event-id", "x-request-id", "x-relay-account-id"] as const;
export const MAILBOX_RESPONSE_HEADERS = ["content-type", "cache-control", "etag", "retry-after", "x-request-id"] as const;
/** Per-target path allowlists (v1 P3 + MyEve addition (a)). The poller maps each target to ONE configured 127.0.0.1 origin. */
export const MAILBOX_TARGET_PATHS: Record<"factory" | "verifier" | "relay", RegExp> = {
  factory: /^(\/api\/connect\/v1\/[^?]+|\/api\/capability-admission\/[^?]+|\/api\/health)(\?.*)?$/,
  // Hosted sends only the digest-only calls; artifact bytes never cross the mailbox (the Mac worker stages them to its own verifier on loopback).
  verifier: /^\/qdev\/v1\/(handoff|evaluate|verdict)$/,
  // Hosted private beta: the Mac-local qualification Relay, only its two remote capability-lease routes (FactoryRelayLeaseClient).
  relay: /^\/api\/v2\/runtime\/capability-leases(\/prepare)?$/,
};
export type MailboxTarget = "factory" | "verifier" | "relay";
export type MailboxDb = { query(sql: string, params?: unknown[]): Promise<Array<Record<string, unknown>>> };
export type MailboxBinding = { installationId: string; ownerId: string };
export type MailboxMethod = typeof MAILBOX_METHODS[number];
export type LeasedEnvelope = { id: string; leaseId: string; installationId: string; ownerId: string; target: MailboxTarget; createdAt: string; deadline: string;
  leaseExpiresAt: string; method: MailboxMethod; path: string; headers: Record<string, string>; bodySha256: string; body: string; bodyEncoding: "base64" };
export type MailboxResponse = { id: string; leaseId: string; requestBodySha256: string; status: number; headers: Record<string, string>; bodySha256: string;
  body: string; bodyEncoding: "base64" };

export class MailboxRefused extends Error { constructor(readonly code: string, readonly status = 409) { super(code); } }
const refuse = (code: string, status?: number): never => { throw new MailboxRefused(code, status); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HEX = /^[a-f0-9]{64}$/;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const PATH = /^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*(\?[A-Za-z0-9._~!$&'()*+,;=:@%/?-]*)?$/;
export const sha256Hex = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) return reject(signal.reason);
  const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
  const abort = () => { clearTimeout(timer); reject(signal!.reason); };
  signal?.addEventListener("abort", abort, { once: true });
});
const validBinding = (b: MailboxBinding) => typeof b?.installationId === "string" && b.installationId.length > 0 && b.installationId.length <= 160
  && typeof b.ownerId === "string" && b.ownerId.length > 0 && b.ownerId.length <= 160;
function decodeBody(body: unknown, sha: unknown): Buffer {
  if (typeof body !== "string" || !BASE64.test(body) || body.length > Math.ceil(MAILBOX_LIMITS.maxBodyBytes / 3) * 4 || typeof sha !== "string" || !HEX.test(sha))
    return refuse("MAILBOX_BODY", 400);
  const bytes = Buffer.from(body, "base64");
  if (bytes.toString("base64") !== body || bytes.length > MAILBOX_LIMITS.maxBodyBytes || sha256Hex(bytes) !== sha) return refuse("MAILBOX_BODY", 400);
  return bytes;
}
function allowHeaders(input: Record<string, unknown> | undefined, allow: readonly string[], strict = false): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(input ?? {})) {
    const key = name.toLowerCase();
    if (!allow.includes(key)) { if (strict) return refuse("MAILBOX_HEADER_NOT_ALLOWED", 400); continue; }
    if (typeof value !== "string" || value.length > 16384 || /[\r\n\0]/.test(value)) return refuse("MAILBOX_HEADER", 400);
    out[key] = value;
  }
  return out;
}
function validPath(path: unknown, target: MailboxTarget): path is string {
  return typeof path === "string" && path.length <= 2048 && PATH.test(path) && !path.includes("//") && !/[\\#\0-\x1f]/.test(path)
    && !path.split("?")[0].split("/").some(segment => segment === "." || segment === ".." || /%2e|%2f|%5c/i.test(segment))
    && MAILBOX_TARGET_PATHS[target].test(path);
}
/** The mailbox per-call timeout (contract v1 addition (b)): max(existing, 40 s) for a mailbox fetcher; unchanged for every other transport. */
export function transportTimeoutMs(fetcher: unknown, existingMs: number): number {
  return isMailboxFetch(fetcher) ? Math.min(Math.max(existingMs, MAILBOX_LIMITS.minCallMs), MAILBOX_LIMITS.maxDeadlineMs) : existingMs;
}

/** Poller credentials are random 32+ byte base64url strings held only on the Mac; the hosted side stores and compares only their sha256. */
export function pollerCredentialSha256(credential: string): string {
  if (typeof credential !== "string" || !/^[A-Za-z0-9_-]{43,128}$/.test(credential)) return refuse("MAILBOX_POLLER_CREDENTIAL", 401);
  return sha256Hex("myeve.factory-mailbox.poller/v1\n" + credential);
}

/**
 * Authenticates the Mac poller of exactly the configured installation and owner. Returns null (401) for a missing, malformed, unknown,
 * revoked or foreign credential. One credential is bound to one installation; there is no cross-installation access.
 */
export async function authenticatePoller(db: MailboxDb, authorization: string | null, expected: MailboxBinding): Promise<MailboxBinding | null> {
  if (!validBinding(expected)) return null;
  const match = /^Bearer ([A-Za-z0-9_-]{43,128})$/.exec(authorization ?? "");
  if (!match) return null;
  const hash = pollerCredentialSha256(match[1]);
  const [row] = await db.query("SELECT installation_id, owner_id, credential_sha256 FROM factory_mailbox_pollers WHERE credential_sha256=$1 AND revoked_at IS NULL", [hash]);
  if (!row || typeof row.credential_sha256 !== "string" || !timingSafeEqual(Buffer.from(row.credential_sha256), Buffer.from(hash))) return null;
  if (row.installation_id !== expected.installationId || row.owner_id !== expected.ownerId) return null;
  return { installationId: expected.installationId, ownerId: expected.ownerId };
}

export const isEvaluateEnvelope = (target: unknown, path: unknown) => target === "verifier" && path === MAILBOX_EVALUATE_PATH;

/**
 * Independent expiry cleanup (all installations): a row whose deadline has passed is deleted, so an unleased request's authorization header
 * and body (and any unread answer) never outlive the request even when the waiting function was terminated. Runs on every poll, respond,
 * wait and enqueue; it never touches a live row.
 */
export async function sweepExpiredMailbox(db: MailboxDb): Promise<void> {
  await db.query("DELETE FROM factory_mailbox_requests WHERE deadline <= now()");
}

/** Server-side only (never a browser-reachable route): enqueue one request envelope. Refuses when the installation queue is full. */
export async function enqueueMailboxRequest(db: MailboxDb, binding: MailboxBinding, request: { target: MailboxTarget; method: string; path: string;
  headers?: Record<string, unknown>; body?: Uint8Array; deadlineMs: number }): Promise<{ id: string }> {
  if (!validBinding(binding)) return refuse("MAILBOX_BINDING", 400);
  if (request.target !== "factory" && request.target !== "verifier" && request.target !== "relay") return refuse("MAILBOX_TARGET", 400);
  if (!(MAILBOX_METHODS as readonly string[]).includes(request.method)) return refuse("MAILBOX_METHOD", 400);
  if (!validPath(request.path, request.target)) return refuse("MAILBOX_PATH", 400);
  if (!Number.isSafeInteger(request.deadlineMs) || request.deadlineMs < 1000 || request.deadlineMs > MAILBOX_LIMITS.maxDeadlineMs) return refuse("MAILBOX_DEADLINE", 400);
  // P7: the evaluation is forwarded for up to 720 s; a shorter envelope deadline would cut it off and fence an answered evaluation UNKNOWN.
  if (isEvaluateEnvelope(request.target, request.path) && request.deadlineMs < MAILBOX_LIMITS.evaluateDeadlineMs) return refuse("MAILBOX_EVALUATE_DEADLINE", 400);
  const body = Buffer.from(request.body ?? new Uint8Array());
  if (body.length > MAILBOX_LIMITS.maxBodyBytes) return refuse("MAILBOX_BODY_TOO_LARGE", 413);
  if ((request.method === "GET" || request.method === "DELETE") && body.length) return refuse("MAILBOX_BODY", 400);
  const headers = allowHeaders(request.headers, MAILBOX_REQUEST_HEADERS, true), id = randomUUID();
  // Expired rows are removed first (bounded retention: an expired envelope is never delivered and never kept).
  await sweepExpiredMailbox(db);
  // Queue admission is serialized per installation by a unique (installation, slot) index over live rows: two concurrent enqueues that pick the
  // same free slot cannot both commit; the loser re-reads the queue with a fresh snapshot (and finds it full at depth 16).
  let rows: Array<Record<string, unknown>> = [];
  for (let attempt = 0; ; attempt++) {
    try {
      rows = await db.query(`WITH poller AS (SELECT 1 FROM factory_mailbox_pollers WHERE installation_id=$2 AND owner_id=$3 AND revoked_at IS NULL),
        slot AS (SELECT g AS n FROM generate_series(0, $11::int - 1) g
          WHERE NOT EXISTS (SELECT 1 FROM factory_mailbox_requests q WHERE q.installation_id=$2 AND q.queue_slot=g) ORDER BY g LIMIT 1)
        INSERT INTO factory_mailbox_requests(id,installation_id,owner_id,target,deadline,method,path,headers,body_sha256,body_base64,state,queue_slot)
        SELECT $1,$2,$3,$4,now()+($5::int * interval '1 millisecond'),$6,$7,$8::jsonb,$9,$10,'QUEUED',slot.n FROM poller, slot RETURNING id`,
        [id, binding.installationId, binding.ownerId, request.target, request.deadlineMs, request.method, request.path, JSON.stringify(headers),
          sha256Hex(body), body.toString("base64"), MAILBOX_LIMITS.maxQueueDepth]);
      break;
    } catch (error) {
      if ((error as { code?: unknown })?.code === "23505" && attempt < 2 * MAILBOX_LIMITS.maxQueueDepth) continue;
      return refuse("MAILBOX_UNAVAILABLE", 503);
    }
  }
  if (rows.length !== 1) {
    const [enrolled] = await db.query("SELECT 1 AS ok FROM factory_mailbox_pollers WHERE installation_id=$1 AND owner_id=$2 AND revoked_at IS NULL", [binding.installationId, binding.ownerId]);
    return refuse(enrolled ? "MAILBOX_QUEUE_FULL" : "MAILBOX_NOT_ENROLLED", enrolled ? 429 : 403);
  }
  return { id };
}

/**
 * Awaits the response for one enqueued request, bounded by the request deadline and the caller's signal. The answered row is deleted as it is
 * read. On abort or deadline an unleased request is withdrawn (it can never be delivered later) and the wait fails as a transport error, so the
 * caller keeps its existing UNKNOWN / reconcile-by-identity handling. Nothing is ever re-enqueued here.
 */
export async function awaitMailboxResponse(db: MailboxDb, binding: MailboxBinding, id: string, options: { signal?: AbortSignal | null; pollMs?: number } = {}):
  Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
  const pollMs = Math.min(Math.max(options.pollMs ?? 200, 10), 2000), signal = options.signal ?? undefined;
  const withdraw = () => db.query("DELETE FROM factory_mailbox_requests WHERE id=$1 AND installation_id=$2 AND owner_id=$3 AND state='QUEUED'",
    [id, binding.installationId, binding.ownerId]).catch(() => undefined);
  for (;;) {
    if (signal?.aborted) { await withdraw(); throw signal.reason ?? new MailboxRefused("MAILBOX_ABORTED"); }
    const [row] = await db.query(`DELETE FROM factory_mailbox_requests WHERE id=$1 AND installation_id=$2 AND owner_id=$3 AND state='ANSWERED'
      RETURNING response_status, response_headers, response_body_sha256, response_body_base64`, [id, binding.installationId, binding.ownerId]);
    if (row) {
      const body = decodeBody(row.response_body_base64, row.response_body_sha256);
      return { status: Number(row.response_status), headers: allowHeaders(row.response_headers as Record<string, unknown>, MAILBOX_RESPONSE_HEADERS), body };
    }
    const [live] = await db.query("SELECT (deadline > now()) AS live FROM factory_mailbox_requests WHERE id=$1 AND installation_id=$2 AND owner_id=$3",
      [id, binding.installationId, binding.ownerId]);
    if (!live?.live) { await withdraw(); throw new MailboxRefused("MAILBOX_DEADLINE", 504); }
    try { await sleep(pollMs, signal); } catch (reason) { await withdraw(); throw reason; }
  }
}

/** Mac poller: lease the oldest live queued request of this installation, once. Waits up to `waitMs` (<= 25 s). Null = nothing (204). */
export async function leaseMailboxRequest(db: MailboxDb, binding: MailboxBinding, options: { waitMs?: number; pollMs?: number; signal?: AbortSignal } = {}): Promise<LeasedEnvelope | null> {
  if (!validBinding(binding)) return refuse("MAILBOX_BINDING", 400);
  const waitMs = Math.min(Math.max(options.waitMs ?? 0, 0), MAILBOX_LIMITS.maxWaitMs), pollMs = Math.min(Math.max(options.pollMs ?? 500, 10), 5000);
  const until = Date.now() + waitMs;
  // Every poll also removes expired rows of every installation (independent of any enqueue or waiter).
  await sweepExpiredMailbox(db);
  for (;;) {
    // The sub-select reads the envelope as it was; the update clears headers and body in the same statement, so the Factory client token and
    // the request body leave the hosted store the moment they are handed to the poller. A leased row never returns to QUEUED.
    // Lease: exactly 30 s (contract v1), except the verifier evaluation (P7), whose lease stays valid until its envelope deadline.
    // The candidate is selected exactly once (MATERIALIZED): a re-scanned SKIP LOCKED sub-select could otherwise pick several rows for one lease.
    const [row] = await db.query(`WITH o AS MATERIALIZED (SELECT id, target, method, path, headers, body_sha256, body_base64 FROM factory_mailbox_requests
            WHERE installation_id=$1 AND owner_id=$2 AND state='QUEUED' AND deadline > now() ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED)
      UPDATE factory_mailbox_requests r SET state='LEASED', leased_at=now(), lease_id=$4,
        lease_expires_at=CASE WHEN o.target='verifier' AND o.path=$5 THEN r.deadline ELSE least(r.deadline, now() + ($3::int * interval '1 millisecond')) END,
        headers='{}'::jsonb, body_base64=''
      FROM o
      WHERE r.id=o.id AND r.state='QUEUED'
      RETURNING o.id, r.lease_id, o.target, o.method, o.path, o.headers, o.body_sha256, o.body_base64, r.created_at, r.deadline, r.lease_expires_at`,
      [binding.installationId, binding.ownerId, MAILBOX_LIMITS.leaseMs, randomBytes(24).toString("base64url"), MAILBOX_EVALUATE_PATH]);
    if (row) return { id: String(row.id), leaseId: String(row.lease_id), installationId: binding.installationId, ownerId: binding.ownerId,
      target: row.target as MailboxTarget, createdAt: new Date(row.created_at as string).toISOString(), deadline: new Date(row.deadline as string).toISOString(),
      leaseExpiresAt: new Date(row.lease_expires_at as string).toISOString(), method: row.method as MailboxMethod, path: String(row.path),
      headers: allowHeaders(row.headers as Record<string, unknown>, MAILBOX_REQUEST_HEADERS), bodySha256: String(row.body_sha256), body: String(row.body_base64),
      bodyEncoding: "base64" };
    const left = until - Date.now();
    if (left <= 0 || options.signal?.aborted) return null;
    await sleep(Math.min(pollMs, left));
  }
}

/** Mac poller: post the reply for exactly one live lease. Unknown, expired, already answered or body-mismatched ids are refused. */
export async function respondMailboxRequest(db: MailboxDb, binding: MailboxBinding, input: unknown): Promise<void> {
  if (!validBinding(binding)) return refuse("MAILBOX_BINDING", 400);
  const r = input as MailboxResponse;
  if (!r || typeof r !== "object" || Object.keys(r).sort().join(",") !== "body,bodyEncoding,bodySha256,headers,id,leaseId,requestBodySha256,status"
    || r.bodyEncoding !== "base64") return refuse("MAILBOX_RESPONSE_SHAPE", 400);
  if (typeof r.id !== "string" || !UUID.test(r.id) || typeof r.leaseId !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(r.leaseId)
    || typeof r.requestBodySha256 !== "string" || !HEX.test(r.requestBodySha256)
    || !Number.isSafeInteger(r.status) || r.status < 200 || r.status > 599 || !r.headers || typeof r.headers !== "object" || Array.isArray(r.headers)) return refuse("MAILBOX_RESPONSE_SHAPE", 400);
  const body = decodeBody(r.body, r.bodySha256), headers = allowHeaders(r.headers, MAILBOX_RESPONSE_HEADERS);
  await sweepExpiredMailbox(db);
  const rows = await db.query(`UPDATE factory_mailbox_requests SET state='ANSWERED', answered_at=now(), response_status=$5, response_headers=$6::jsonb,
      response_body_sha256=$7, response_body_base64=$8
    WHERE id=$1 AND installation_id=$2 AND owner_id=$3 AND body_sha256=$4 AND lease_id=$9 AND state='LEASED' AND lease_expires_at > now() AND deadline > now() RETURNING id`,
    [r.id, binding.installationId, binding.ownerId, r.requestBodySha256, r.status, JSON.stringify(headers), sha256Hex(body), body.toString("base64"), r.leaseId]);
  if (rows.length !== 1) return refuse("MAILBOX_RESPONSE_REFUSED", 409);
}

const MAILBOX_FETCH = Symbol.for("myeve.factory-mailbox.fetch/v1");
export type MailboxFetch = typeof fetch & { [MAILBOX_FETCH]: { target: MailboxTarget; origin: string } };
export const isMailboxFetch = (value: unknown): value is MailboxFetch => typeof value === "function" && MAILBOX_FETCH in value;
export const mailboxFetchOrigin = (value: unknown): string | null => isMailboxFetch(value) ? value[MAILBOX_FETCH].origin : null;

/**
 * A `fetch` replacement for exactly one pinned loopback origin on the owner's Mac (the origin the Mac poller forwards to). It accepts only that
 * origin, carries the request byte-for-byte through the mailbox and returns the Mac's response. `timeoutMs` is the request's own deadline
 * (the existing client signal still aborts earlier). A thrown error is a transport failure: the client's existing UNKNOWN handling applies.
 */
export function mailboxFetch(db: MailboxDb, binding: MailboxBinding, target: MailboxTarget, origin: string, options: { timeoutMs?: number; pollMs?: number } = {}): MailboxFetch {
  const pinned = new URL(origin);
  if (pinned.protocol !== "http:" || pinned.hostname !== "127.0.0.1" || !pinned.port || pinned.origin !== origin) return refuse("MAILBOX_ORIGIN", 400);
  if (!validBinding(binding)) return refuse("MAILBOX_BINDING", 400);
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? MAILBOX_LIMITS.minCallMs, MAILBOX_LIMITS.minCallMs), MAILBOX_LIMITS.maxDeadlineMs);
  const send = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    if (typeof input !== "string" && !(input instanceof URL)) return refuse("MAILBOX_REQUEST_OBJECT", 400);
    const url = new URL(String(input));
    if (url.origin !== origin || url.username || url.password || url.hash) return refuse("MAILBOX_ORIGIN", 400);
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, name) => { headers[name] = value; });
    let body: Uint8Array | undefined;
    if (typeof init.body === "string") body = new TextEncoder().encode(init.body);
    else if (init.body instanceof Uint8Array) body = init.body;
    else if (init.body != null) return refuse("MAILBOX_BODY_TYPE", 400);
    const path = url.pathname + url.search;
    // P7: the charged evaluation keeps its envelope (and lease) for at least 12 minutes; everything else uses the call's own deadline.
    const deadlineMs = isEvaluateEnvelope(target, path) ? Math.max(timeoutMs, MAILBOX_LIMITS.evaluateDeadlineMs) : timeoutMs;
    const { id } = await enqueueMailboxRequest(db, binding, { target, method: (init.method ?? "GET").toUpperCase(), path, headers, body, deadlineMs });
    const reply = await awaitMailboxResponse(db, binding, id, { signal: init.signal, pollMs: options.pollMs });
    const empty = reply.status === 204 || reply.status === 205 || reply.status === 304 || init.method === "HEAD";
    return new Response(empty ? null : new Uint8Array(reply.body), { status: reply.status, headers: { ...reply.headers, "cache-control": "no-store" } });
  };
  return Object.assign(send as typeof fetch, { [MAILBOX_FETCH]: { target, origin } }) as MailboxFetch;
}
