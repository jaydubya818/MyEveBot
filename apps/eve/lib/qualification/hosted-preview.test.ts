import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { digest as myappsDigest } from "../../../../packages/myapps/src/contracts.ts";
import { canonical } from "../engineering/factory-producer-protocol.ts";
import { pollerCredentialSha256, type MailboxDb } from "../engineering/factory-mailbox.ts";
import { HOSTED_ASSURANCE_LABEL, HOSTED_PROFILE, hostedProfileSchema } from "./hosted-profile.ts";
import {
  beginPreviewUpload, completePreviewUpload, issuePreviewGrant, latestPreview, previewBlobKey, previewGrantKey, PreviewRefused, putPreviewFile,
  previewGrantBase, rewriteRootRelative, servePreviewFile, verifyPreviewGrant, verifyPreviewRelease, type PreviewBlobStore, type PreviewExpectation,
} from "./hosted-preview.ts";

const query = vi.hoisted(() => vi.fn());
vi.mock("../../agent/lib/receipts-db.ts", () => ({ db: () => ({ query }) }));

const sha = (b: string | Uint8Array) => createHash("sha256").update(b).digest("hex");
const verifierKey = generateKeyPairSync("ed25519"), producerKey = generateKeyPairSync("ed25519"), issuerKey = generateKeyPairSync("ed25519");
const pem = (k: { publicKey: { export(o: object): string | Buffer } }) => String(k.publicKey.export({ type: "spki", format: "pem" }));
const profileJson = {
  profile: HOSTED_PROFILE, role: "OWNER", ownerId: "jay", installationId: "prj_hosted_owner",
  relayOrigin: "https://relay.example.com", missionControlOrigin: "https://mc.example.com", servedOrigin: "https://sofie.example.com",
  build: { appId: "myeve-dashboard", lockSha256: "a".repeat(64), buildProfileDigest: "c".repeat(64), issuer: { keyId: "build-1", purpose: "STATIC_BUILD_PROVENANCE_V1", ownerId: "jay",
    factoryId: "f", factoryVersion: "d".repeat(64), buildProfileDigest: "c".repeat(64), publicKeyPem: pem(issuerKey), spkiSha256: "e".repeat(64), notBefore: "2026-01-01T00:00:00.000Z",
    notAfter: "2099-01-01T00:00:00.000Z", revoked: false } },
  factory: { transport: "MAILBOX", factoryOrigin: "http://127.0.0.1:8792", verifierOrigin: "http://127.0.0.1:8795", relayOrigin: "http://127.0.0.1:8797", ownerScope: "myeve.hosted:prj_hosted_owner:jay", spend: "METERED", qualificationMode: "LIVE" },
  verifier: { assurance: "PRIVATE_BETA_LOCAL", label: HOSTED_ASSURANCE_LABEL,
    keys: [{ keyId: "verifier-1", publicKeyPem: pem(verifierKey), activeFrom: "2026-01-01T00:00:00Z", notAfter: "2099-01-01T00:00:00Z" }],
    producerKeyIds: ["producer-1"], producerPublicKeysPem: [pem(producerKey)] },
  limits: { perWorkMicrousd: 1_300_000, maxWorksPerPerson: 4, automaticIncrease: false },
};
const profile = hostedProfileSchema.parse(profileJson);
const files: Record<string, string> = { "dist/index.html": "<!doctype html><script src=app.js></script>", "dist/app.js": "document.body.textContent='dashboard'" };
function release(content = files) {
  const list = Object.entries(content).map(([path, text]) => ({ path, bytes: Buffer.byteLength(text), sha256: sha(text) }));
  const source = { sourceCommit: "4".repeat(40), sourceTree: "5".repeat(40), lockSha256: "e".repeat(64) };
  return { schema: "myeve.qdev-static-release/v1" as const, artifactDigest: myappsDigest({ source, files: list }), inventoryDigest: "sha256:" + "f".repeat(64), source, files: list };
}
function signed(manifest: ReturnType<typeof release>, over: Record<string, unknown> = {}, key = verifierKey.privateKey) {
  const verdict = { schema: "myeve.qualification-verdict/v1", assurance: "PRIVATE_BETA_LOCAL", verifierKeyId: "verifier-1", projectSha256: "1".repeat(64), sourceSha256: "2".repeat(64),
    protectedSpecificationSha256: "3".repeat(64), candidateCommit: "4".repeat(40), candidateTree: "5".repeat(40), buildArtifactSha256: manifest.artifactDigest.slice(7),
    outcome: "PASS", issuedAt: new Date(Date.now() - 60_000).toISOString(), ...over };
  return { verdict, signatureBase64: sign(null, Buffer.from(canonical(verdict)), key).toString("base64") };
}
/** The installation's VERIFIED build expectation (what hosted retained; never read from the verdict). */
const expectation = (m: ReturnType<typeof release>, over: Partial<PreviewExpectation> = {}): PreviewExpectation => ({ candidateCommit: "4".repeat(40), candidateTree: "5".repeat(40),
  buildArtifactSha256: m.artifactDigest.slice(7), projectSha256: "1".repeat(64), sourceSha256: "2".repeat(64), protectedSpecificationSha256: "3".repeat(64),
  verifiedAtMs: Date.now() - 120_000, ...over });
const memoryBlob = () => { const m = new Map<string, Uint8Array>(); return { m, store: { put: async (k: string, b: Uint8Array) => { m.set(k, Buffer.from(b)); }, get: async (k: string) => m.get(k) ?? null } satisfies PreviewBlobStore }; };

it("binds the release manifest to a signed PASS verdict with the hosted (local) assurance", () => {
  const m = release();
  expect(verifyPreviewRelease(profile, signed(m), m, expectation(m)).artifactSha256).toBe(m.artifactDigest.slice(7));
  const refusedWith = (s: unknown, manifest: unknown = m, e: PreviewExpectation | null = expectation(m)) => { try { verifyPreviewRelease(profile, s, manifest, e); return "accepted"; } catch (e) { return (e as PreviewRefused).code; } };
  // P1 regression: no VERIFIED build of this installation -> refused, whatever the verdict says.
  expect(refusedWith(signed(m), m, null)).toBe("PREVIEW_BUILD_NOT_VERIFIED");
  // Expectations come from the retained build, not from the submitted verdict: a foreign project/spec/candidate verdict is refused.
  expect(refusedWith(signed(m, { projectSha256: "9".repeat(64) }))).toMatch(/^PREVIEW_VERDICT:QDEV_VERDICT_BINDING_MISMATCH:projectSha256/);
  expect(refusedWith(signed(m, { protectedSpecificationSha256: "9".repeat(64) }))).toMatch(/^PREVIEW_VERDICT:QDEV_VERDICT_BINDING_MISMATCH:protectedSpecificationSha256/);
  expect(refusedWith(signed(m), m, expectation(m, { candidateCommit: "6".repeat(40) }))).toMatch(/^PREVIEW_VERDICT:QDEV_VERDICT_BINDING_MISMATCH:candidateCommit/);
  // A replayed old verdict (issued before this build was verified) is refused.
  expect(refusedWith(signed(m, { issuedAt: new Date(Date.now() - 3_600_000).toISOString() }))).toBe("PREVIEW_VERDICT_PREDATES_BUILD");
  // The Mac build issuer is producer authority: a verdict signed with it is self-authored.
  const issuerAsVerifier = hostedProfileSchema.parse({ ...profileJson, verifier: { ...profileJson.verifier, keys: [{ ...profileJson.verifier.keys[0], publicKeyPem: pem(issuerKey) }] } });
  expect(() => verifyPreviewRelease(issuerAsVerifier, signed(m, {}, issuerKey.privateKey), m, expectation(m))).toThrow(/SELF_AUTHORED/);
  expect(refusedWith(signed(m, { outcome: "FAIL" }))).toMatch(/^PREVIEW_VERDICT:QDEV_VERDICT_FAIL/);
  expect(refusedWith(signed(m, { assurance: "INDEPENDENT" }))).toMatch(/^PREVIEW_VERDICT:QDEV_VERDICT_ASSURANCE/);
  expect(refusedWith(signed(m, {}, producerKey.privateKey))).toMatch(/^PREVIEW_VERDICT/);
  expect(refusedWith({ ...signed(m), signatureBase64: Buffer.alloc(64).toString("base64") })).toMatch(/^PREVIEW_VERDICT:QDEV_VERDICT_SIGNATURE/);
  const other = release({ ...files, "dist/extra.js": "x" });
  expect(refusedWith(signed(m), other)).toBe("PREVIEW_BUILD_NOT_VERIFIED");             // a release that is not the verified build's artifact
  expect(refusedWith(signed(other), other, expectation(m))).toBe("PREVIEW_BUILD_NOT_VERIFIED");
  expect(refusedWith(signed(m), { ...m, files: [...m.files, { path: "dist/x.js", bytes: 1, sha256: sha("x") }] })).toBe("PREVIEW_MANIFEST_DIGEST");
  expect(refusedWith(signed(m), { ...m, files: [{ ...m.files[0], path: "dist/../etc" }] })).toBe("PREVIEW_MANIFEST_FILES");
  // A producer key presented as the verifier is self-authored and refused.
  const selfAuthored = hostedProfileSchema.parse({ ...profileJson, verifier: { ...profileJson.verifier, producerPublicKeysPem: [pem(verifierKey)] } });
  expect(() => verifyPreviewRelease(selfAuthored, signed(m), m, expectation(m))).toThrow(/SELF_AUTHORED/);
});

it("grants are owner/installation/release bound and expire after 10 minutes", () => {
  const key = previewGrantKey("s".repeat(40)), binding = { installationId: profile.installationId, ownerId: "jay" }, hex = "a".repeat(64), now = Date.now();
  const grant = issuePreviewGrant(key, binding, hex, now);
  expect(verifyPreviewGrant(key, binding, hex, grant, now)).toBe(true);
  expect(verifyPreviewGrant(key, binding, "b".repeat(64), grant, now)).toBe(false);
  expect(verifyPreviewGrant(key, { ...binding, ownerId: "tester" }, hex, grant, now)).toBe(false);
  expect(verifyPreviewGrant(previewGrantKey("t".repeat(40)), binding, hex, grant, now)).toBe(false);
  expect(verifyPreviewGrant(key, binding, hex, grant, now + 10 * 60_000 + 1)).toBe(false);
  expect(() => previewGrantKey("short")).toThrow(PreviewRefused);
});

const blobs = vi.hoisted(() => new Map<string, Uint8Array>());
vi.mock("@vercel/blob", () => ({
  put: async (key: string, bytes: Uint8Array, options: { access: string }) => { if (options.access !== "private") throw new Error("public blob"); blobs.set(key, Buffer.from(bytes)); return {}; },
  get: async (key: string, options: { access: string }) => {
    if (options.access !== "private") throw new Error("public blob");
    const bytes = blobs.get(key);
    return bytes ? { statusCode: 200, stream: new Blob([new Uint8Array(bytes)]).stream() } : null;
  },
}));

const connection = process.env.MAILBOX_TEST_DATABASE_URL;
describe.skipIf(!connection)("private verified previews against real PostgreSQL", () => {
  let pool: pg.Pool;
  const db: MailboxDb = { query: async (sql, params) => (await pool.query(sql, params as unknown[])).rows };
  const CRED = "p".repeat(43), SECRET = "synthetic fixture session secret at least 32 chars";
  beforeAll(async () => {
    if (new URL(connection!).hostname !== "127.0.0.1") throw new Error("Use a disposable local fixture database.");
    pool = new pg.Pool({ connectionString: connection, options: "-c search_path=preview_fixture", max: 8 });
    await pool.query("DROP SCHEMA IF EXISTS preview_fixture CASCADE; CREATE SCHEMA preview_fixture");
    await pool.query(await readFile(new URL("../../migrations/0110_hosted_factory_mailbox.sql", import.meta.url), "utf8"));
    query.mockImplementation(async (sql: string, params: unknown[]) => (await pool.query(sql, params)).rows);
  });
  afterAll(async () => { if (pool) { await pool.query("DROP SCHEMA preview_fixture CASCADE"); await pool.end(); } });
  beforeEach(async () => {
    blobs.clear();
    await pool.query("TRUNCATE factory_mailbox_requests, hosted_verified_previews, hosted_mac_builds, factory_mailbox_pollers");
    await pool.query("INSERT INTO factory_mailbox_pollers(installation_id,owner_id,credential_sha256) VALUES($1,$2,$3)", [profile.installationId, profile.ownerId, pollerCredentialSha256(CRED)]);
    vi.stubEnv("MYEVE_HOSTED_PROFILE", JSON.stringify(profileJson)); vi.stubEnv("MYEVE_OWNER_ID", "jay");
    vi.stubEnv("DATABASE_URL", connection!); vi.stubEnv("MYEVE_SESSION_SECRET", SECRET);
  });
  afterEach(() => vi.unstubAllEnvs());
  /** The installation's VERIFIED Mac build for this release (what retainBuild + the Mac upload leave behind). */
  const seedBuild = async (r: ReturnType<typeof release>, request: Record<string, unknown> = {}, owner = profile) => {
    const candidate = { commit: "4".repeat(40), tree: "5".repeat(40) };
    await pool.query(`INSERT INTO hosted_mac_builds(installation_id,owner_id,candidate_commit,candidate_tree,request,state,submission,artifact_sha256,verified_at)
      VALUES($1,$2,$3,$4,$5::jsonb,'VERIFIED','{}'::jsonb,$6,now() - interval '2 minutes')`, [owner.installationId, owner.ownerId, candidate.commit, candidate.tree,
      JSON.stringify({ candidate, binding: { candidateCommit: candidate.commit, candidateTree: candidate.tree }, projectSha256: "1".repeat(64), sourceSha256: "2".repeat(64),
        protectedSpecificationSha256: "3".repeat(64), ...request }), r.artifactDigest.slice(7)]);
  };

  it("P1 regression: no preview without the installation's VERIFIED build; foreign/replayed verdicts refused even with matching files", async () => {
    const { store } = memoryBlob(), r = release(), hex = r.artifactDigest.slice(7);
    const upload = (verdict: unknown) => beginPreviewUpload(db, profile, store, { schema: "myeve.hosted-preview-upload/v1", verdict, manifest: r });
    await expect(upload(signed(r))).rejects.toMatchObject({ code: "PREVIEW_BUILD_NOT_VERIFIED" });
    expect((await pool.query("SELECT count(*)::int AS n FROM hosted_verified_previews")).rows[0].n).toBe(0);
    await expect(putPreviewFile(db, profile, store, hex, "dist/app.js", Buffer.from(files["dist/app.js"]))).rejects.toMatchObject({ code: "PREVIEW_NOT_FOUND" });
    // A build that is only REQUESTED/UPLOADING does not count.
    await pool.query(`INSERT INTO hosted_mac_builds(installation_id,owner_id,candidate_commit,candidate_tree,request,state) VALUES($1,$2,$3,$4,'{}'::jsonb,'REQUESTED')`,
      [profile.installationId, profile.ownerId, "4".repeat(40), "5".repeat(40)]);
    await expect(upload(signed(r))).rejects.toMatchObject({ code: "PREVIEW_BUILD_NOT_VERIFIED" });
    await pool.query("DELETE FROM hosted_mac_builds");
    await seedBuild(r);
    await expect(upload(signed(r, { projectSha256: "9".repeat(64) }))).rejects.toMatchObject({ code: expect.stringMatching(/BINDING_MISMATCH:projectSha256/) });
    await expect(upload(signed(r, { issuedAt: new Date(Date.now() - 3_600_000).toISOString() }))).rejects.toMatchObject({ code: "PREVIEW_VERDICT_PREDATES_BUILD" });
    // Another installation's verified build never authorizes this one.
    await pool.query("DELETE FROM hosted_mac_builds");
    await pool.query("INSERT INTO factory_mailbox_pollers(installation_id,owner_id,credential_sha256) VALUES('prj_other','tester',$1)", [pollerCredentialSha256("q".repeat(43))]);
    await seedBuild(r, {}, { ...profile, installationId: "prj_other", ownerId: "tester" });
    await expect(upload(signed(r))).rejects.toMatchObject({ code: "PREVIEW_BUILD_NOT_VERIFIED" });
  });

  it("upload: verified registration, per-file integrity, read-back re-hash, then READY; a different verdict for the same release is refused", async () => {
    const { m, store } = memoryBlob(), r = release(), s = signed(r), hex = r.artifactDigest.slice(7);
    await seedBuild(r);
    const begun = await beginPreviewUpload(db, profile, store, { schema: "myeve.hosted-preview-upload/v1", verdict: s, manifest: r });
    expect(begun).toEqual({ artifactSha256: hex, state: "UPLOADING", missing: ["dist/index.html", "dist/app.js"] });
    await expect(putPreviewFile(db, profile, store, hex, "dist/app.js", Buffer.from("tampered"))).rejects.toMatchObject({ code: "PREVIEW_FILE_INTEGRITY" });
    await expect(putPreviewFile(db, profile, store, hex, "dist/other.js", Buffer.from("x"))).rejects.toMatchObject({ code: "PREVIEW_PATH" });
    await putPreviewFile(db, profile, store, hex, "dist/index.html", Buffer.from(files["dist/index.html"]));
    await expect(completePreviewUpload(db, profile, store, hex)).rejects.toMatchObject({ code: "PREVIEW_INCOMPLETE:dist/app.js" });
    await putPreviewFile(db, profile, store, hex, "dist/app.js", Buffer.from(files["dist/app.js"]));
    expect(await completePreviewUpload(db, profile, store, hex)).toEqual({ artifactSha256: hex, state: "READY" });
    expect(await latestPreview(db, profile)).toBe(hex);
    expect([...m.keys()].every(k => k.startsWith("hosted-previews/") && !k.includes(profile.installationId))).toBe(true);
    await expect(beginPreviewUpload(db, profile, store, { schema: "myeve.hosted-preview-upload/v1", verdict: signed(r, { issuedAt: new Date(Date.now() - 1000).toISOString() }), manifest: r }))
      .rejects.toMatchObject({ code: "PREVIEW_RELEASE_CONFLICT" });
  });

  it("serving re-verifies verdict, manifest and file bytes on every response; sandboxed, private, no CORS", async () => {
    const { m, store } = memoryBlob(), r = release(), hex = r.artifactDigest.slice(7);
    await seedBuild(r);
    await beginPreviewUpload(db, profile, store, { schema: "myeve.hosted-preview-upload/v1", verdict: signed(r), manifest: r });
    for (const [path, text] of Object.entries(files)) await putPreviewFile(db, profile, store, hex, path, Buffer.from(text));
    expect((await servePreviewFile(db, profile, store, hex, "")).status).toBe(404);   // not READY yet
    await completePreviewUpload(db, profile, store, hex);
    const ok = await servePreviewFile(db, profile, store, hex, "");
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe(files["dist/index.html"]);
    expect(ok.headers.get("content-security-policy")).toMatch(/^sandbox allow-scripts/);
    expect(ok.headers.get("content-security-policy")).not.toMatch(/allow-same-origin/);
    expect(ok.headers.get("cache-control")).toBe("private, no-store");
    expect(ok.headers.get("access-control-allow-origin")).toBeNull();
    expect((await servePreviewFile(db, profile, store, hex, "../manifest.json")).status).toBe(404);
    expect((await servePreviewFile(db, profile, store, hex, "app.js", "POST")).status).toBe(405);
    m.set(previewBlobKey({ installationId: profile.installationId, ownerId: "jay" }, hex, sha(files["dist/app.js"])), Buffer.from("document.cookie"));
    expect((await servePreviewFile(db, profile, store, hex, "app.js")).status).toBe(500);
    // A verdict that no longer verifies (verifier key revoked) stops serving everything.
    const revoked = hostedProfileSchema.parse({ ...profileJson, verifier: { ...profileJson.verifier, keys: [{ ...profileJson.verifier.keys[0], revokedAt: new Date(Date.now() - 1000).toISOString() }] } });
    expect((await servePreviewFile(db, revoked, store, hex, "")).status).toBe(409);
    // Another owner/installation sees nothing.
    const other = hostedProfileSchema.parse({ ...profileJson, ownerId: "tester", installationId: "prj_other", factory: { ...profileJson.factory, ownerScope: "myeve.hosted:prj_other:tester" },
      build: { ...profileJson.build, issuer: { ...profileJson.build.issuer, ownerId: "tester" } } });
    expect((await servePreviewFile(db, other, store, hex, "")).status).toBe(404);
    // The build record is required on every response: without it nothing is served.
    m.set(previewBlobKey({ installationId: profile.installationId, ownerId: "jay" }, hex, sha(files["dist/app.js"])), Buffer.from(files["dist/app.js"]));
    expect((await servePreviewFile(db, profile, store, hex, "app.js")).status).toBe(200);
    await pool.query("DELETE FROM hosted_mac_builds");
    expect((await servePreviewFile(db, profile, store, hex, "app.js")).status).toBe(409);
  });

  it("P2 regression: browser serving keeps root-relative assets inside the grant and lets opaque-origin module scripts load", async () => {
    const app: Record<string, string> = {
      "dist/index.html": '<!doctype html><link rel="stylesheet" href="/assets/app.css"><script type="module" crossorigin src="/assets/app.js"></script><a href="//cdn.example/x">x</a><img src=/favicon.svg>',
      "dist/assets/app.js": 'import { x } from "/assets/chunk.js"; const u = new URL("/assets/logo.png", import.meta.url); fetch("/api/session"); document.body.textContent = x;',
      "dist/assets/chunk.js": "export const x = 'dashboard';", "dist/assets/app.css": "body{background:url(/assets/logo.png)}", "dist/favicon.svg": "<svg/>",
    };
    const { store } = memoryBlob(), r = release(app), hex = r.artifactDigest.slice(7), grant = "1999999999." + "A".repeat(43), base = previewGrantBase(hex, grant);
    await seedBuild(r);
    await beginPreviewUpload(db, profile, store, { schema: "myeve.hosted-preview-upload/v1", verdict: signed(r), manifest: r });
    for (const [path, text] of Object.entries(app)) await putPreviewFile(db, profile, store, hex, path, Buffer.from(text));
    await completePreviewUpload(db, profile, store, hex);
    const browser = (path: string, origin: string | null = null) => servePreviewFile(db, profile, store, hex, path, "GET", undefined, { grantBase: base, requestOrigin: origin });
    const html = await (await browser("index.html")).text();
    expect(html).toContain(`href="${base}assets/app.css"`);
    expect(html).toContain(`src="${base}assets/app.js"`);
    expect(html).toContain(`src=${base}favicon.svg`);
    expect(html).toContain('href="//cdn.example/x"');                       // protocol-relative URLs are not ours: untouched
    const js = await browser("assets/app.js", "null");
    const jsText = await js.text();
    expect(jsText).toContain(`from "${base}assets/chunk.js"`);
    expect(jsText).toContain(`"${base}assets/logo.png"`);
    expect(jsText).toContain('fetch("/api/session")');                     // not a release entry: never rewritten (and CSP blocks it)
    expect(js.headers.get("access-control-allow-origin")).toBe("null");     // module script from the opaque sandbox
    expect(js.headers.get("access-control-allow-credentials")).toBeNull();
    expect(js.headers.get("vary")).toBe("Origin");
    expect(js.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
    const csp = js.headers.get("content-security-policy")!;
    expect(csp).toMatch(/^sandbox allow-scripts allow-forms allow-popups;/);
    expect(csp).not.toMatch(/allow-same-origin/);
    expect(csp).toContain(`script-src https://sofie.example.com${base} 'unsafe-inline'`);
    expect(csp).toContain(`connect-src https://sofie.example.com${base};`);
    expect(csp).not.toContain("default-src 'self'");
    expect(await (await browser("assets/app.css")).text()).toBe(`body{background:url(${base}assets/logo.png)}`);
    // Any other origin gets no CORS grant; the exact verified bytes still back every response.
    expect((await browser("assets/app.js", "https://evil.example")).headers.get("access-control-allow-origin")).toBeNull();
    expect((await browser("assets/chunk.js")).headers.get("access-control-allow-origin")).toBeNull();
    // The server-side delivery observation (no browser context) reads the exact verified bytes, unrewritten.
    expect(await (await servePreviewFile(db, profile, store, hex, "assets/app.js")).text()).toBe(app["dist/assets/app.js"]);
    // A forged base never reaches the rewrite.
    expect((await servePreviewFile(db, profile, store, hex, "index.html", "GET", undefined, { grantBase: "/elsewhere/", requestOrigin: null })).status).toBe(404);
    expect(rewriteRootRelative('"/assets/a.js" "/assetsX/b.js" "/api/x"', ["assets"], base)).toBe(`"${base}assets/a.js" "/assetsX/b.js" "/api/x"`);
  });

  it("routes: poller auth for the Mac side, owner session + grant for viewing, no-store everywhere", async () => {
    const r = release(), hex = r.artifactDigest.slice(7);
    await seedBuild(r);
    const { POST: begin } = await import("../../app/api/factory-mailbox/v1/previews/route");
    const { PUT: putFile } = await import("../../app/api/factory-mailbox/v1/previews/[artifact]/files/[...path]/route");
    const { POST: complete } = await import("../../app/api/factory-mailbox/v1/previews/[artifact]/complete/route");
    const { GET: next } = await import("../../app/api/factory-mailbox/v1/next/route");
    const { GET: view } = await import("../../app/api/previews/v1/[artifact]/g/[grant]/[[...path]]/route");
    const mac = (path: string, init: RequestInit = {}, credential = CRED) => new Request("https://hosted.example" + path, { ...init, headers: { authorization: `Bearer ${credential}`, ...(init.headers ?? {}) } });
    expect((await begin(mac("/api/factory-mailbox/v1/previews", { method: "POST", body: "{}" }, "x".repeat(43)))).status).toBe(401);
    expect((await begin(mac("/api/factory-mailbox/v1/previews", { method: "POST", body: "{}", headers: { cookie: "eve_session=x" } }))).status).toBe(403);
    expect((await next(mac("/api/factory-mailbox/v1/next?wait=26"))).status).toBe(400);
    const empty = await next(mac("/api/factory-mailbox/v1/next?wait=0"));
    expect(empty.status).toBe(204);
    expect(empty.headers.get("cache-control")).toBe("no-store");
    const begun = await begin(mac("/api/factory-mailbox/v1/previews", { method: "POST", body: JSON.stringify({ schema: "myeve.hosted-preview-upload/v1", verdict: signed(r), manifest: r }) }));
    expect(begun.status).toBe(200);
    for (const [path, text] of Object.entries(files)) {
      const res = await putFile(mac(`/api/factory-mailbox/v1/previews/${hex}/files/${path}`, { method: "PUT", body: text }), { params: Promise.resolve({ artifact: hex, path: path.split("/") }) });
      expect(res.status).toBe(200);
    }
    expect((await complete(mac(`/api/factory-mailbox/v1/previews/${hex}/complete`, { method: "POST" }), { params: Promise.resolve({ artifact: hex }) })).status).toBe(200);
    const { GET: link } = await import("../../app/api/previews/v1/[artifact]/route");
    const redirect = await link(new Request("https://hosted.example/api/previews/v1/latest"), { params: Promise.resolve({ artifact: "latest" }) });
    expect(redirect.status).toBe(303);
    expect(redirect.headers.get("location")).toMatch(new RegExp(`^/api/previews/v1/${hex}/g/[0-9]{10}\\.[A-Za-z0-9_-]{43}/index\\.html$`));
    expect((await link(new Request("https://hosted.example/api/previews/v1/" + "0".repeat(64)), { params: Promise.resolve({ artifact: "0".repeat(64) }) })).status).toBe(404);
    const grant = issuePreviewGrant(previewGrantKey(SECRET), { installationId: profile.installationId, ownerId: "jay" }, hex);
    const ok = await view(new Request(`https://hosted.example/api/previews/v1/${hex}/g/${grant}/index.html`), { params: Promise.resolve({ artifact: hex, grant, path: ["index.html"] }) });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("access-control-allow-origin")).toBeNull();
    const sandboxed = await view(new Request(`https://hosted.example/api/previews/v1/${hex}/g/${grant}/app.js`, { headers: { origin: "null" } }),
      { params: Promise.resolve({ artifact: hex, grant, path: ["app.js"] }) });
    expect(sandboxed.status).toBe(200);
    expect(sandboxed.headers.get("access-control-allow-origin")).toBe("null");
    const forged = await view(new Request(`https://hosted.example/api/previews/v1/${hex}/g/x/index.html`), { params: Promise.resolve({ artifact: hex, grant: "1999999999." + "A".repeat(43), path: ["index.html"] }) });
    expect(forged.status).toBe(404);
    vi.stubEnv("MYEVE_HOSTED_PROFILE", "");
    expect((await next(mac("/api/factory-mailbox/v1/next"))).status).toBe(404);
  });

  it("the Mac uploader script drives the upload contract end to end (https origin, poller credential only)", async () => {
    const { upload, parseArgs } = await import("../../scripts/private-beta/hosted-preview-upload.mjs");
    expect(() => parseArgs(["--origin", "http://hosted.example", "--credential-file", "c", "--release-dir", "r", "--verdict-file", "v"])).toThrow("HTTPS_ORIGIN_REQUIRED");
    const r = release(), hex = r.artifactDigest.slice(7);
    await seedBuild(r);
    const { POST: begin } = await import("../../app/api/factory-mailbox/v1/previews/route");
    const { PUT: putFile } = await import("../../app/api/factory-mailbox/v1/previews/[artifact]/files/[...path]/route");
    const { POST: complete } = await import("../../app/api/factory-mailbox/v1/previews/[artifact]/complete/route");
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const request = new Request(url, init), parts = url.pathname.split("/").slice(5);
      if (url.pathname === "/api/factory-mailbox/v1/previews") return begin(request);
      if (parts[1] === "files") return putFile(request, { params: Promise.resolve({ artifact: parts[0], path: parts.slice(2).map(decodeURIComponent) }) });
      return complete(request, { params: Promise.resolve({ artifact: parts[0] }) });
    };
    const result = await upload({ origin: "https://hosted.example", credential: CRED, verdict: signed(r), fetcher,
      release: { manifest: r, files: Object.entries(files).map(([path, text]) => ({ path, bytes: Buffer.from(text) })) } });
    expect(result).toEqual({ artifactSha256: hex, state: "READY" });
  });
});
