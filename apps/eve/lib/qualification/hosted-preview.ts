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

/** Verifies a signed PASS verdict and the release manifest it binds. Returns the release identity; throws PreviewRefused otherwise. */
export function verifyPreviewRelease(profile: HostedProfile, signed: unknown, manifest: unknown, now?: number): { artifactSha256: string; verdictSha256: string; verdict: Verdict; manifest: PreviewManifest } {
  const s = signed as SignedVerdict, v = s?.verdict as Verdict | undefined;
  if (!s || typeof s !== "object" || Object.keys(s).sort().join(",") !== "signatureBase64,verdict" || !v || typeof v !== "object") return refuse("PREVIEW_VERDICT_SHAPE", 400);
  let verdict: Verdict;
  try {
    // The verdict's own binding fields are the expectation except the two that matter here: its assurance must be the hosted one, and its
    // build artifact must be exactly this manifest. Signature, key window, separation from producer keys and PASS are verified in full.
    verdict = verifyVerdict({ signed: s, verifierKeys: profile.verifier.keys, producerKeyIds: profile.verifier.producerKeyIds,
      producerPublicKeysPem: profile.verifier.producerPublicKeysPem, now,
      expected: { assurance: HOSTED_ASSURANCE, projectSha256: v.projectSha256, sourceSha256: v.sourceSha256, protectedSpecificationSha256: v.protectedSpecificationSha256,
        candidateCommit: v.candidateCommit, candidateTree: v.candidateTree,
        buildArtifactSha256: String((manifest as PreviewManifest)?.artifactDigest ?? "").replace(/^sha256:/, "") } });
  } catch (error) { return refuse("PREVIEW_VERDICT:" + (error instanceof Error ? error.message : "rejected").slice(0, 80), 422); }
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
  const release = verifyPreviewRelease(profile, body.verdict, body.manifest, now), binding = hostedBinding(profile);
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
  if (!row) return refuse("PREVIEW_NOT_FOUND", 404);
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
  verifyPreviewRelease(profile, row.verdict, row.manifest, now);
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

/** Serves one file of a READY release after re-verifying the signed verdict, the manifest it binds and this file's sha256. Fails closed. */
export async function servePreviewFile(db: MailboxDb, profile: HostedProfile, blob: PreviewBlobStore, artifactSha256: string, path: string, method = "GET", now?: number): Promise<Response> {
  const fail = (status: number, code: string) => Response.json({ error: code }, { status, headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  if (method !== "GET" && method !== "HEAD") return fail(405, "PREVIEW_METHOD");
  const relative = path === "" ? "index.html" : path;
  if (!SERVE_PATH.test(relative)) return fail(404, "PREVIEW_NOT_FOUND");
  const binding = hostedBinding(profile), row = await readPreview(db, binding, artifactSha256);
  if (!row || row.state !== "READY") return fail(404, "PREVIEW_NOT_FOUND");
  try { verifyPreviewRelease(profile, row.verdict, row.manifest, now); } catch { return fail(409, "PREVIEW_VERDICT_NOT_VALID"); }
  const entry = row.manifest.files.find(f => f.path === "dist/" + relative);
  if (!entry) return fail(404, "PREVIEW_NOT_FOUND");
  const bytes = await blob.get(previewBlobKey(binding, artifactSha256, entry.sha256));
  if (!bytes || bytes.length !== entry.bytes || sha(bytes) !== entry.sha256) return fail(500, "PREVIEW_SERVE_INTEGRITY");
  const ext = relative.slice(relative.lastIndexOf(".") + 1).toLowerCase();
  return new Response(method === "HEAD" ? null : new Uint8Array(bytes), { status: 200, headers: { ...PREVIEW_HEADERS,
    "content-type": TYPES[ext] ?? "application/octet-stream", "content-length": String(bytes.length), etag: `"sha256-${entry.sha256}"` } });
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
