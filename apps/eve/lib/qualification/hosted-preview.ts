import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { digest as myappsDigest } from "../../../../packages/myapps/src/contracts.ts";
import { canonical } from "../engineering/factory-producer-protocol.ts";
import type { MailboxBinding, MailboxDb } from "../engineering/factory-mailbox.ts";
import { verifyVerdict, type SignedVerdict, type Verdict } from "./verdict.ts";
import { HOSTED_ASSURANCE, hostedBinding, type HostedProfile } from "./hosted-profile.ts";

/**
 * Private verified previews for hosted MyEve.
 *
 * Upload contract (Mac -> hosted, poller credential; no Blob credential ever leaves Vercel):
 *  1. POST /api/factory-mailbox/v1/previews {schema:"myeve.hosted-preview-upload/v1", verdict:SignedVerdict, manifest}
 *     The verdict must verify under the hosted profile's verifier keys (Ed25519, key window, not self-authored), be PASS and PRIVATE_BETA_LOCAL;
 *     the manifest must be the `myeve.qdev-static-release/v1` release whose artifactDigest (= digest({source, files})) is exactly the verdict's
 *     buildArtifactSha256. Response: {artifactSha256, missing:[paths]}.
 *  2. PUT /api/factory-mailbox/v1/previews/<artifactSha256>/files/<manifest path> (raw bytes). Accepted only for a manifest path whose
 *     length and sha256 match; stored in the PRIVATE Blob store content-addressed by sha256.
 *  3. POST /api/factory-mailbox/v1/previews/<artifactSha256>/complete. Every file is read back from Blob and re-hashed; only then READY.
 * Serving (owner): GET /api/previews/v1/<artifactSha256> (or /latest) with the owner session issues a 10-minute, owner/installation/
 * release-bound grant and redirects to /api/previews/v1/<artifactSha256>/g/<grant>/index.html. Every response re-verifies the stored signed
 * verdict, the manifest digest it binds and the served file's sha256 before any byte is returned; responses are private no-store, sandboxed
 * by CSP and carry no Access-Control-Allow-Origin. The grant exists because the sandboxed (opaque-origin) preview cannot send the owner's
 * SameSite=Strict session cookie on its own sub-resource requests.
 */
export const PREVIEW_LIMITS = { files: 256, fileBytes: 4 * 1024 * 1024, totalBytes: 16 * 1024 * 1024, grantMs: 10 * 60_000 } as const;
export type PreviewFile = { path: string; bytes: number; sha256: string };
export type PreviewManifest = { schema: "myeve.qdev-static-release/v1"; artifactDigest: string; inventoryDigest: string; source: unknown; files: PreviewFile[] };
export type PreviewBlobStore = { put(key: string, bytes: Uint8Array): Promise<void>; get(key: string): Promise<Uint8Array | null> };
export class PreviewRefused extends Error { constructor(readonly code: string, readonly status = 409) { super(code); } }
const refuse = (code: string, status?: number): never => { throw new PreviewRefused(code, status); };
const HEX = /^[a-f0-9]{64}$/;
const sha = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const SERVE_PATH = /^[A-Za-z0-9._~@+-]+(\/[A-Za-z0-9._~@+-]+)*$/;
const safeManifestPath = (p: unknown): p is string => typeof p === "string" && p.startsWith("dist/") && p.length < 400
  && p.split("/").every(s => s !== "" && s !== "." && s !== ".." && !/[\\\0-\x1f%?#]/.test(s));
export const previewBlobKey = (binding: MailboxBinding, artifactSha256: string, fileSha256: string) =>
  `hosted-previews/${createHash("sha256").update(binding.installationId).digest("hex").slice(0, 32)}/${artifactSha256}/${fileSha256}`;

/**
 * What a preview may be published for: the installation's own VERIFIED Mac build (hosted re-verified its signed build claim against the expected
 * binding hosted derived from its retained stage-3 admission) and that build's independently retained project/source/specification binding.
 * Nothing here comes from the submitted verdict.
 */
export type PreviewExpectation = { candidateCommit: string; candidateTree: string; buildArtifactSha256: string; projectSha256: string; sourceSha256: string;
  protectedSpecificationSha256: string; verifiedAtMs: number };
/** Verdicts may be issued on the Mac a little before the hosted clock records the build as VERIFIED; anything older is a replay. */
export const PREVIEW_VERDICT_SKEW_MS = 5 * 60_000;
export async function verifiedBuildExpectation(db: MailboxDb, binding: MailboxBinding, artifactSha256: string): Promise<PreviewExpectation | null> {
  if (!HEX.test(artifactSha256)) return null;
  const rows = await db.query(`SELECT request, candidate_commit, candidate_tree, artifact_sha256, verified_at FROM hosted_mac_builds
    WHERE installation_id=$1 AND owner_id=$2 AND artifact_sha256=$3 AND state='VERIFIED'`, [binding.installationId, binding.ownerId, artifactSha256]);
  if (rows.length !== 1) return null;
  const row = rows[0], request = parseJson<{ candidate?: { commit?: unknown; tree?: unknown }; projectSha256?: unknown; sourceSha256?: unknown;
    protectedSpecificationSha256?: unknown; binding?: { candidateCommit?: unknown; candidateTree?: unknown } }>(row.request);
  const verifiedAtMs = Date.parse(new Date(row.verified_at as string).toISOString());
  const e = { candidateCommit: String(row.candidate_commit), candidateTree: String(row.candidate_tree), buildArtifactSha256: String(row.artifact_sha256),
    projectSha256: String(request?.projectSha256), sourceSha256: String(request?.sourceSha256), protectedSpecificationSha256: String(request?.protectedSpecificationSha256), verifiedAtMs };
  if (request?.candidate?.commit !== e.candidateCommit || request?.candidate?.tree !== e.candidateTree || request?.binding?.candidateCommit !== e.candidateCommit
    || request?.binding?.candidateTree !== e.candidateTree || ![e.projectSha256, e.sourceSha256, e.protectedSpecificationSha256].every(v => HEX.test(v)) || !Number.isFinite(verifiedAtMs)) return null;
  return e;
}
const manifestArtifact = (manifest: unknown) => String((manifest as PreviewManifest)?.artifactDigest ?? "").replace(/^sha256:/, "");

/**
 * Verifies a signed PASS verdict and the release manifest it binds against the expectation of the installation's VERIFIED build (never against
 * fields of the verdict itself): exact candidate, artifact, project, source and protected specification, hosted assurance, verifier trust,
 * separation from every producer key (including the Mac build issuer), and issuance not before that build was verified. Throws PreviewRefused.
 */
export function verifyPreviewRelease(profile: HostedProfile, signed: unknown, manifest: unknown, expected: PreviewExpectation | null, now?: number): { artifactSha256: string; verdictSha256: string; verdict: Verdict; manifest: PreviewManifest } {
  const s = signed as SignedVerdict, v = s?.verdict as Verdict | undefined;
  if (!s || typeof s !== "object" || Object.keys(s).sort().join(",") !== "signatureBase64,verdict" || !v || typeof v !== "object") return refuse("PREVIEW_VERDICT_SHAPE", 400);
  if (!expected || expected.buildArtifactSha256 !== manifestArtifact(manifest)) return refuse("PREVIEW_BUILD_NOT_VERIFIED", 409);
  let verdict: Verdict;
  try {
    verdict = verifyVerdict({ signed: s, verifierKeys: profile.verifier.keys,
      producerKeyIds: [...profile.verifier.producerKeyIds, profile.build.issuer.keyId],
      producerPublicKeysPem: [...profile.verifier.producerPublicKeysPem, profile.build.issuer.publicKeyPem], now,
      expected: { assurance: HOSTED_ASSURANCE, projectSha256: expected.projectSha256, sourceSha256: expected.sourceSha256,
        protectedSpecificationSha256: expected.protectedSpecificationSha256, candidateCommit: expected.candidateCommit, candidateTree: expected.candidateTree,
        buildArtifactSha256: expected.buildArtifactSha256 } });
  } catch (error) { return refuse("PREVIEW_VERDICT:" + (error instanceof Error ? error.message : "rejected").slice(0, 80), 422); }
  if (Date.parse(verdict.issuedAt) < expected.verifiedAtMs - PREVIEW_VERDICT_SKEW_MS) return refuse("PREVIEW_VERDICT_PREDATES_BUILD", 422);
  const m = manifest as PreviewManifest;
  if (!m || typeof m !== "object" || Object.keys(m).sort().join(",") !== "artifactDigest,files,inventoryDigest,schema,source"
    || m.schema !== "myeve.qdev-static-release/v1" || m.artifactDigest !== "sha256:" + verdict.buildArtifactSha256 || !Array.isArray(m.files)) return refuse("PREVIEW_MANIFEST", 422);
  if (m.files.length < 1 || m.files.length > PREVIEW_LIMITS.files) return refuse("PREVIEW_MANIFEST_FILES", 422);
  const seen = new Set<string>(); let total = 0;
  for (const f of m.files) {
    if (!f || Object.keys(f).sort().join(",") !== "bytes,path,sha256" || !safeManifestPath(f.path) || seen.has(f.path) || !HEX.test(f.sha256)
      || !Number.isSafeInteger(f.bytes) || f.bytes < 0 || f.bytes > PREVIEW_LIMITS.fileBytes) return refuse("PREVIEW_MANIFEST_FILES", 422);
    seen.add(f.path); total += f.bytes;
  }
  if (total > PREVIEW_LIMITS.totalBytes) return refuse("PREVIEW_MANIFEST_SIZE", 413);
  let computed: string;
  try { computed = myappsDigest({ source: m.source, files: m.files }); } catch { return refuse("PREVIEW_MANIFEST_DIGEST", 422); }
  if (computed !== m.artifactDigest) return refuse("PREVIEW_MANIFEST_DIGEST", 422);
  // The release must be the build's own source pins (the verified build's candidate), not merely any release with a matching digest.
  const source = m.source as { sourceCommit?: unknown; sourceTree?: unknown } | null;
  if (source?.sourceCommit !== expected.candidateCommit || source?.sourceTree !== expected.candidateTree) return refuse("PREVIEW_MANIFEST_SOURCE", 422);
  return { artifactSha256: verdict.buildArtifactSha256, verdictSha256: sha(canonical(s)), verdict, manifest: m };
}

const parseJson = <T>(value: unknown): T => (typeof value === "string" ? JSON.parse(value) : value) as T;
export type PreviewRow = { verdict: SignedVerdict; manifest: PreviewManifest; state: "UPLOADING" | "READY"; verdictSha256: string };
export async function readPreview(db: MailboxDb, binding: MailboxBinding, artifactSha256: string): Promise<PreviewRow | null> {
  if (!HEX.test(artifactSha256)) return null;
  const [row] = await db.query("SELECT verdict, manifest, state, verdict_sha256 FROM hosted_verified_previews WHERE installation_id=$1 AND owner_id=$2 AND artifact_sha256=$3",
    [binding.installationId, binding.ownerId, artifactSha256]);
  return row ? { verdict: parseJson(row.verdict), manifest: parseJson(row.manifest), state: row.state as PreviewRow["state"], verdictSha256: String(row.verdict_sha256) } : null;
}

/** Step 1 (Mac): register a verified release. Idempotent for the same verdict; a different verdict for the same artifact is refused. */
export async function beginPreviewUpload(db: MailboxDb, profile: HostedProfile, blob: PreviewBlobStore, input: unknown, now?: number) {
  const body = input as { schema?: unknown; verdict?: unknown; manifest?: unknown };
  if (!body || typeof body !== "object" || Object.keys(body).sort().join(",") !== "manifest,schema,verdict" || body.schema !== "myeve.hosted-preview-upload/v1") return refuse("PREVIEW_UPLOAD_SHAPE", 400);
  const binding = hostedBinding(profile);
  const release = verifyPreviewRelease(profile, body.verdict, body.manifest, await verifiedBuildExpectation(db, binding, manifestArtifact(body.manifest)), now);
  await db.query(`INSERT INTO hosted_verified_previews(installation_id,owner_id,artifact_sha256,verdict,verdict_sha256,manifest,state)
    VALUES($1,$2,$3,$4::jsonb,$5,$6::jsonb,'UPLOADING') ON CONFLICT (installation_id, artifact_sha256) DO NOTHING`,
    [binding.installationId, binding.ownerId, release.artifactSha256, JSON.stringify(body.verdict), release.verdictSha256, JSON.stringify(release.manifest)]);
  const row = await readPreview(db, binding, release.artifactSha256);
  if (!row || row.verdictSha256 !== release.verdictSha256) return refuse("PREVIEW_RELEASE_CONFLICT", 409);
  const missing: string[] = [];
  if (row.state !== "READY") for (const f of release.manifest.files) if (!await blob.get(previewBlobKey(binding, release.artifactSha256, f.sha256))) missing.push(f.path);
  return { artifactSha256: release.artifactSha256, state: row.state, missing };
}

/** Step 2 (Mac): one file of a registered release, accepted only when its length and sha256 match the manifest entry. */
export async function putPreviewFile(db: MailboxDb, profile: HostedProfile, blob: PreviewBlobStore, artifactSha256: string, path: string, bytes: Uint8Array) {
  const binding = hostedBinding(profile), row = await readPreview(db, binding, artifactSha256);
  if (!row || !await verifiedBuildExpectation(db, binding, artifactSha256)) return refuse("PREVIEW_NOT_FOUND", 404);
  const entry = row.manifest.files.find(f => f.path === path);
  if (!entry) return refuse("PREVIEW_PATH", 404);
  if (bytes.length !== entry.bytes || sha(bytes) !== entry.sha256) return refuse("PREVIEW_FILE_INTEGRITY", 422);
  await blob.put(previewBlobKey(binding, artifactSha256, entry.sha256), bytes);
  return { path, sha256: entry.sha256 };
}

/** Step 3 (Mac): every file is read back from the private store and re-hashed; only then the release is READY. */
export async function completePreviewUpload(db: MailboxDb, profile: HostedProfile, blob: PreviewBlobStore, artifactSha256: string, now?: number) {
  const binding = hostedBinding(profile), row = await readPreview(db, binding, artifactSha256);
  if (!row) return refuse("PREVIEW_NOT_FOUND", 404);
  verifyPreviewRelease(profile, row.verdict, row.manifest, await verifiedBuildExpectation(db, binding, artifactSha256), now);
  for (const f of row.manifest.files) {
    const bytes = await blob.get(previewBlobKey(binding, artifactSha256, f.sha256));
    if (!bytes || bytes.length !== f.bytes || sha(bytes) !== f.sha256) return refuse("PREVIEW_INCOMPLETE:" + f.path.slice(0, 200), 409);
  }
  await db.query("UPDATE hosted_verified_previews SET state='READY', ready_at=now() WHERE installation_id=$1 AND owner_id=$2 AND artifact_sha256=$3 AND state='UPLOADING'",
    [binding.installationId, binding.ownerId, artifactSha256]);
  return { artifactSha256, state: "READY" as const };
}

/** The newest READY release of this owner/installation (the stable Result link `/api/previews/v1/latest`). */
export async function latestPreview(db: MailboxDb, profile: HostedProfile): Promise<string | null> {
  const binding = hostedBinding(profile);
  const [row] = await db.query("SELECT artifact_sha256 FROM hosted_verified_previews WHERE installation_id=$1 AND owner_id=$2 AND state='READY' ORDER BY ready_at DESC, artifact_sha256 LIMIT 1",
    [binding.installationId, binding.ownerId]);
  return row ? String(row.artifact_sha256) : null;
}
export const previewResultPath = (artifactSha256: string | "latest") => `/api/previews/v1/${artifactSha256}`;

export type HostedPreviewResult = { id: string; workId: string; title: string; verifiedAt: string; previewPath: string };

/** Only READY previews of this installation's verified builds and personal Work. The preview route still re-verifies access and bytes. */
export async function listHostedPreviewResults(db: MailboxDb, profile: HostedProfile): Promise<HostedPreviewResult[]> {
  const binding = hostedBinding(profile);
  const rows = await db.query(`SELECT p.artifact_sha256, p.ready_at, w.id AS work_id, w.title
    FROM hosted_verified_previews p
    JOIN hosted_mac_builds b ON b.installation_id=p.installation_id AND b.owner_id=p.owner_id AND b.artifact_sha256=p.artifact_sha256
    JOIN engineering_work w ON w.scope_id=b.owner_id AND w.scope_kind='personal' AND w.id::text=b.request#>>'{binding,workId}'
    WHERE p.installation_id=$1 AND p.owner_id=$2 AND p.state='READY' AND b.state='VERIFIED'
    ORDER BY p.ready_at DESC, p.artifact_sha256 LIMIT 20`, [binding.installationId, binding.ownerId]);
  return rows.map(row => ({
    id: String(row.artifact_sha256), workId: String(row.work_id), title: String(row.title),
    verifiedAt: new Date(String(row.ready_at)).toISOString(), previewPath: previewResultPath(String(row.artifact_sha256)),
  }));
}


/** Grant subkey derived from the session secret; it signs only owner/installation/release-bound, 10-minute preview grants. */
export function previewGrantKey(sessionSecret: string | undefined): Buffer {
  if (!sessionSecret || sessionSecret.length < 32) return refuse("PREVIEW_GRANT_KEY", 503);
  return createHmac("sha256", sessionSecret).update("myeve.hosted-preview-grant/v1").digest();
}
export function issuePreviewGrant(key: Buffer, binding: MailboxBinding, artifactSha256: string, now = Date.now()): string {
  if (!HEX.test(artifactSha256)) return refuse("PREVIEW_NOT_FOUND", 404);
  const expires = Math.floor((now + PREVIEW_LIMITS.grantMs) / 1000);
  const mac = createHmac("sha256", key).update(JSON.stringify([binding.installationId, binding.ownerId, artifactSha256, expires])).digest("base64url");
  return `${expires}.${mac}`;
}
export function verifyPreviewGrant(key: Buffer, binding: MailboxBinding, artifactSha256: string, grant: string, now = Date.now()): boolean {
  const match = /^([0-9]{10})\.([A-Za-z0-9_-]{43})$/.exec(grant ?? "");
  if (!match || !HEX.test(artifactSha256)) return false;
  const expires = Number(match[1]);
  if (expires * 1000 <= now || expires * 1000 > now + PREVIEW_LIMITS.grantMs + 1000) return false;
  const want = createHmac("sha256", key).update(JSON.stringify([binding.installationId, binding.ownerId, artifactSha256, expires])).digest();
  const got = Buffer.from(match[2], "base64url");
  return got.length === want.length && timingSafeEqual(got, want);
}

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8",
  json: "application/json", map: "application/json", webmanifest: "application/manifest+json", svg: "image/svg+xml", png: "image/png",
  jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", ico: "image/x-icon", woff: "font/woff", woff2: "font/woff2",
  txt: "text/plain; charset=utf-8", wasm: "application/wasm",
};
/** Sandboxed (opaque origin: no MyEve cookies, storage or same-origin API access), framed only by MyEve, never cached or shared cross-origin. */
export const PREVIEW_HEADERS = {
  "content-security-policy": "sandbox allow-scripts allow-forms allow-popups; default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
  "cache-control": "private, no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer",
  "cross-origin-resource-policy": "same-origin", "x-robots-tag": "noindex, nofollow",
} as const;

/**
 * Browser serving context of a grant path. Present only on the grant route (never on the server-side delivery observation, which must see the
 * exact verified bytes).
 *
 * Why the preview stays an OPAQUE-origin sandbox and how real builds run in it:
 *  - A same-origin (allow-same-origin) preview would run the built application's scripts as MyEve's own origin: they could read MyEve storage
 *    and drive MyEve's authenticated APIs with the owner's cookies. We keep the opaque sandbox and do not take that trade.
 *  - Root-relative references (`/assets/app.js`, `url(/assets/x.png)`, `import "/assets/chunk.js"`) would escape the grant path and hit MyEve's
 *    root. In HTML, CSS and JavaScript of the release they are rewritten to the grant path, but ONLY for references whose first segment is a
 *    top-level entry of the verified manifest (nothing else is touched). Served bytes then differ from the release by exactly that deterministic
 *    rewrite; the verdict/manifest/sha256 checks run on the stored bytes before it, and the delivery observation reads the unrewritten bytes.
 *  - From an opaque origin every module script (and `crossorigin` asset) is a CORS request with `Origin: null`. Grant responses therefore answer
 *    such a request with `Access-Control-Allow-Origin: null` (never `*`, never credentials, `Vary: Origin`) and a cross-origin resource policy.
 *    This grants nothing beyond the URL itself: the grant path is the bearer capability (owner-issued, 10 minutes, one release), no cookie is
 *    honoured or needed, and the bytes are already readable by whoever holds the URL. MyEve's own responses keep no CORS.
 *  - The CSP is path-scoped to the grant (`<servedOrigin>/api/previews/v1/<release>/g/<grant>/`) instead of the whole MyEve origin.
 */
export type PreviewBrowserContext = { grantBase: string; requestOrigin: string | null };
const GRANT_BASE = /^\/api\/previews\/v1\/[a-f0-9]{64}\/g\/[0-9]{10}\.[A-Za-z0-9_-]{43}\/$/;
export const previewGrantBase = (artifactSha256: string, grant: string) => `/api/previews/v1/${artifactSha256}/g/${grant}/`;
const REWRITTEN = new Set(["html", "htm", "css", "js", "mjs"]);
/** Rewrites root-relative references to the verified release's own top-level entries into grant-relative ones (see PreviewBrowserContext). */
export function rewriteRootRelative(text: string, roots: readonly string[], grantBase: string): string {
  const safe = roots.filter(r => /^[A-Za-z0-9._~@+-]+$/.test(r) && r !== "." && r !== "..");
  if (!safe.length || !GRANT_BASE.test(grantBase)) return text;
  const alternatives = safe.map(r => r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length).join("|");
  const pattern = new RegExp(`(^|[\\s"'\`(=,])\\/(?!\\/)(${alternatives})(?=[\\/"'\`)\\s?#,>;]|$)`, "g");
  return text.replace(pattern, (_m, lead: string, root: string) => `${lead}${grantBase}${root}`);
}
export function previewBrowserHeaders(profile: HostedProfile, browser: PreviewBrowserContext): Record<string, string> {
  if (!GRANT_BASE.test(browser.grantBase)) throw new PreviewRefused("PREVIEW_GRANT_BASE", 404);
  const scope = profile.servedOrigin + browser.grantBase;
  return {
    "content-security-policy": `sandbox allow-scripts allow-forms allow-popups; default-src ${scope}; script-src ${scope} 'unsafe-inline'; style-src ${scope} 'unsafe-inline'; img-src ${scope} data: blob:; font-src ${scope} data:; connect-src ${scope}; worker-src 'none'; frame-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'`,
    "cache-control": "private, no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer",
    "cross-origin-resource-policy": "cross-origin", "x-robots-tag": "noindex, nofollow", vary: "Origin",
    ...(browser.requestOrigin === "null" ? { "access-control-allow-origin": "null" } : {}),
  };
}

/** Serves one file of a READY release after re-verifying the signed verdict, the manifest it binds and this file's sha256. Fails closed. */
export async function servePreviewFile(db: MailboxDb, profile: HostedProfile, blob: PreviewBlobStore, artifactSha256: string, path: string, method = "GET", now?: number,
  browser?: PreviewBrowserContext): Promise<Response> {
  const fail = (status: number, code: string) => Response.json({ error: code }, { status, headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  if (method !== "GET" && method !== "HEAD") return fail(405, "PREVIEW_METHOD");
  const relative = path === "" ? "index.html" : path;
  if (!SERVE_PATH.test(relative)) return fail(404, "PREVIEW_NOT_FOUND");
  const binding = hostedBinding(profile), row = await readPreview(db, binding, artifactSha256);
  if (!row || row.state !== "READY") return fail(404, "PREVIEW_NOT_FOUND");
  try { verifyPreviewRelease(profile, row.verdict, row.manifest, await verifiedBuildExpectation(db, binding, artifactSha256), now); }
  catch { return fail(409, "PREVIEW_VERDICT_NOT_VALID"); }
  const entry = row.manifest.files.find(f => f.path === "dist/" + relative);
  if (!entry) return fail(404, "PREVIEW_NOT_FOUND");
  const bytes = await blob.get(previewBlobKey(binding, artifactSha256, entry.sha256));
  if (!bytes || bytes.length !== entry.bytes || sha(bytes) !== entry.sha256) return fail(500, "PREVIEW_SERVE_INTEGRITY");
  const ext = relative.slice(relative.lastIndexOf(".") + 1).toLowerCase(), type = TYPES[ext] ?? "application/octet-stream";
  if (!browser) return new Response(method === "HEAD" ? null : new Uint8Array(bytes), { status: 200, headers: { ...PREVIEW_HEADERS,
    "content-type": type, "content-length": String(bytes.length), etag: `"sha256-${entry.sha256}"` } });
  let headers: Record<string, string>;
  try { headers = previewBrowserHeaders(profile, browser); } catch { return fail(404, "PREVIEW_NOT_FOUND"); }
  let out: Uint8Array = bytes;
  if (REWRITTEN.has(ext)) {
    const roots = [...new Set(row.manifest.files.map(f => f.path.slice("dist/".length).split("/")[0]))];
    out = Buffer.from(rewriteRootRelative(Buffer.from(bytes).toString("utf8"), roots, browser.grantBase), "utf8");
  }
  return new Response(method === "HEAD" ? null : new Uint8Array(out), { status: 200, headers: { ...headers,
    "content-type": type, "content-length": String(out.length), etag: `"sha256-${sha(out)}"` } });
}

/** Private Vercel Blob store (server-side only; the read/write token is the deployment's own BLOB_READ_WRITE_TOKEN and never leaves Vercel). */
export function vercelPrivatePreviewStore(): PreviewBlobStore {
  return {
    async put(key, bytes) {
      const { put } = await import("@vercel/blob");
      await put(key, Buffer.from(bytes), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/octet-stream" } as never);
    },
    async get(key) {
      const { get } = await import("@vercel/blob");
      const found = await get(key, { access: "private" } as never) as { statusCode?: number; stream?: ReadableStream<Uint8Array> } | null;
      if (!found || found.statusCode !== 200 || !found.stream) return null;
      const reader = found.stream.getReader(), chunks: Uint8Array[] = []; let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > PREVIEW_LIMITS.fileBytes) { await reader.cancel(); return null; }
        chunks.push(value);
      }
      return Buffer.concat(chunks);
    },
  };
}
