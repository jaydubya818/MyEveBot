import { createHash, randomBytes } from "node:crypto";
import { chmodSync, closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, writeSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { z } from "zod";
import { StaticArtifactCandidate, STATIC_ARTIFACT_LIMITS, type StaticFile, type StaticSourcePins } from "../../../../packages/myapps/src/static-artifact.ts";
import { bareSha256 } from "./delivery-observer.ts";

/**
 * Bounded artifact staging: the one data-plane path that carries the EXACT built bytes of the accepted candidate from the producer process to the
 * independently administered verifier host BEFORE the charged evaluation. The proof handoff stays digest-only; nothing here is public, charged or protected.
 *
 *   producer  (HttpVerifierPort.submit -> stageArtifact)            verifier host (verifier-service routes -> ArtifactStagingStore)
 *   POST /qdev/v1/artifact/file    one inventoried file, octet-stream   -> sha256 + path + size checked, written atomically to a private pending area
 *   POST /qdev/v1/artifact/commit  { candidate, binding, pins, inventory } -> StaticArtifactCandidate.retain over the pending bytes (the EXISTING inventory,
 *                                      path, size, count, duplicate and digest controls), exact file-set equality, and `bareSha256(artifactDigest)` must equal the
 *                                      handoff's buildArtifactSha256; only then is the area atomically renamed into its durable, candidate-keyed location.
 * The verifier then (1) refuses a handoff for an unstaged candidate, (2) re-verifies every staged byte before it durably begins the single evaluation, and
 * (3) hands the evaluator the staged directory plus the file digests. A staged artifact is never served or published: pre-PASS publication stays impossible.
 * Staging is idempotent and uncharged; any failure here happens before the handoff, so no evaluation can have started.
 */
export class ArtifactStagingRefused extends Error { constructor(readonly code: string, readonly status = 409) { super(code); } }
export type ArtifactCandidate = { commit: string; tree: string; buildArtifactSha256: string };
export type StagedArtifact = { dir: string; artifactSha256: string; inventoryDigest: string; files: StaticFile[] };
export type ArtifactSource = { inventory: unknown; pins: StaticSourcePins; artifact: StaticArtifactCandidate };
export type ArtifactReceipt = { staged: true; artifactSha256: string; inventoryDigest: string; files: number; bytes: number };

/** Largest body the verifier transport must accept on the artifact routes. */
export const ARTIFACT_FILE_BODY_LIMIT = STATIC_ARTIFACT_LIMITS.fileBytes;
export const ARTIFACT_COMMIT_BODY_LIMIT = 262_144;
export const ARTIFACT_PATHS = Object.freeze({ file: "/qdev/v1/artifact/file", commit: "/qdev/v1/artifact/commit" });

const hex = (n: number) => z.string().regex(new RegExp("^[a-f0-9]{" + n + "}$"));
const candidateShape = z.object({ commit: hex(40), tree: hex(40), buildArtifactSha256: hex(64) }).strict();
const bindingShape = z.object({ projectSha256: hex(64), sourceSha256: hex(64) }).strict();
const pinsShape = z.object({ sourceCommit: hex(40), sourceTree: hex(40), lockSha256: hex(64) }).strict();
const commitRequest = z.object({ candidate: candidateShape, binding: bindingShape, pins: pinsShape, inventory: z.unknown().refine(v => v !== undefined) }).strict();
// Same rule as the MyApps inventory, applied before a path can name a file on this host. The commit re-validates the whole inventory.
const safePath = (value: unknown): value is string => typeof value === "string" && value.length <= 240 && value.startsWith("dist/")
  && value.split("/").every(part => /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(part) && !part.endsWith("."));
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const keyOf = (c: ArtifactCandidate) => createHash("sha256").update(c.commit + ":" + c.tree + ":" + c.buildArtifactSha256).digest("hex");
const MANIFEST = "manifest.json", MAX_MANIFEST_BYTES = 1_048_576;
const refuse = (code: string, status = 409): never => { throw new ArtifactStagingRefused(code, status); };

function durableWrite(path: string, bytes: Uint8Array): void {
  const fd = openSync(path, "wx", 0o600);
  try { let offset = 0; while (offset < bytes.length) offset += writeSync(fd, bytes, offset); fsyncSync(fd); } finally { closeSync(fd); }
}
/** Regular files only (no symlinks, devices or sockets), bounded by the artifact limits; throws on anything else. */
function listFiles(base: string): Array<{ path: string; bytes: number }> {
  const out: Array<{ path: string; bytes: number }> = [];
  const walk = (rel: string) => {
    for (const entry of readdirSync(rel ? join(base, rel) : base, { withFileTypes: true })) {
      const next = rel ? rel + "/" + entry.name : entry.name;
      if (entry.isDirectory()) walk(next);
      else if (entry.isFile()) { out.push({ path: next, bytes: lstatSync(join(base, next)).size }); if (out.length > STATIC_ARTIFACT_LIMITS.files) refuse("QDEV_ARTIFACT_LIMIT", 413); }
      else refuse("QDEV_ARTIFACT_INVALID");
    }
  };
  try { if (lstatSync(base).isDirectory()) walk(""); } catch (error) { if (error instanceof ArtifactStagingRefused) throw error; if ((error as NodeJS.ErrnoException).code !== "ENOENT") refuse("QDEV_ARTIFACT_INVALID"); }
  return out;
}
const loaderFor = (base: string) => async (path: string): Promise<Uint8Array> => {
  const target = join(base, path), stat = lstatSync(target);
  if (!stat.isFile() || stat.size > STATIC_ARTIFACT_LIMITS.fileBytes) throw new Error("not a bounded regular file");
  return readFileSync(target);
};

/** Durable, candidate-keyed staging area on the verifier host's own filesystem. */
export class ArtifactStagingStore {
  readonly root: string;
  constructor(options: { root: string }) {
    if (typeof options.root !== "string" || !isAbsolute(options.root) || options.root.includes("\0") || options.root.split("/").includes("..")) throw new ArtifactStagingRefused("QDEV_ARTIFACT_ROOT");
    mkdirSync(options.root, { recursive: true, mode: 0o700 });
    const stat = lstatSync(options.root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new ArtifactStagingRefused("QDEV_ARTIFACT_ROOT");
    this.root = options.root;
  }
  private committed(c: ArtifactCandidate) { return join(this.root, keyOf(c)); }
  private pending(c: ArtifactCandidate) { return join(this.root, keyOf(c) + ".pending"); }

  async has(c: ArtifactCandidate): Promise<boolean> {
    try { return lstatSync(join(this.committed(c), MANIFEST)).isFile(); } catch { return false; }
  }

  /** Receives one inventoried file. The claimed digest, the path rule and the size bound are enforced before anything is written. */
  async receiveFile(c: ArtifactCandidate, path: string, claimedSha256: string, bytes: Uint8Array): Promise<void> {
    if (!safePath(path) || !/^[a-f0-9]{64}$/.test(claimedSha256)) return refuse("QDEV_ARTIFACT_REQUEST", 400);
    if (bytes.byteLength > STATIC_ARTIFACT_LIMITS.fileBytes) return refuse("QDEV_ARTIFACT_LIMIT", 413);
    if (sha256(bytes) !== claimedSha256) return refuse("QDEV_ARTIFACT_DIGEST", 400);
    if (await this.has(c)) {
      // Already committed: a duplicate upload is accepted only when it matches the retained inventory byte for byte.
      const manifest = this.readManifest(c);
      const file = (manifest.inventory as { files: StaticFile[] }).files.find(f => f.path === path);
      return file && file.sha256 === claimedSha256 && file.bytes === bytes.byteLength ? undefined : refuse("QDEV_ARTIFACT_CONFLICT");
    }
    const pending = this.pending(c), files = join(pending, "files"), temp = join(pending, "tmp");
    mkdirSync(temp, { recursive: true, mode: 0o700 });
    const others = listFiles(files).filter(f => f.path !== path);
    if (others.length + 1 > STATIC_ARTIFACT_LIMITS.files || others.reduce((n, f) => n + f.bytes, 0) + bytes.byteLength > STATIC_ARTIFACT_LIMITS.totalBytes) return refuse("QDEV_ARTIFACT_LIMIT", 413);
    // Case aliases and file/directory collisions are refused here exactly as the inventory refuses them.
    const lowered = path.toLowerCase();
    for (const other of others) {
      const o = other.path.toLowerCase();
      if (o === lowered || o.startsWith(lowered + "/") || lowered.startsWith(o + "/")) return refuse("QDEV_ARTIFACT_CONFLICT");
    }
    const staged = join(temp, randomBytes(8).toString("hex"));
    durableWrite(staged, bytes);
    const target = join(files, path);
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    renameSync(staged, target);   // atomic replace: a retried upload of the same file is idempotent
  }

  /** Verifies the pending bytes against the exact inventory and the candidate's build identity, then atomically commits. Idempotent. */
  async commit(c: ArtifactCandidate, pins: StaticSourcePins, inventory: unknown): Promise<ArtifactReceipt> {
    if (await this.has(c)) return this.receipt(await this.open(c));
    if (pins.sourceCommit !== c.commit || pins.sourceTree !== c.tree) return refuse("QDEV_ARTIFACT_SOURCE_MISMATCH", 403);
    const pending = this.pending(c), files = join(pending, "files");
    let artifact: StaticArtifactCandidate;
    try { artifact = await StaticArtifactCandidate.retain(inventory, pins, loaderFor(files)); }
    catch (error) { return refuse("QDEV_ARTIFACT_" + String((error as { code?: string }).code ?? "INVALID").replace(/^APP_ARTIFACT_/, ""), 422); }
    let bare: string;
    try { bare = bareSha256(artifact.artifactDigest); } catch { return refuse("QDEV_ARTIFACT_INVALID", 422); }
    if (bare !== c.buildArtifactSha256) return refuse("QDEV_ARTIFACT_MISMATCH", 422);
    const present = listFiles(files).map(f => f.path).sort(), wanted = artifact.files.map(f => f.path).sort();
    if (present.length !== wanted.length || present.some((p, i) => p !== wanted[i])) return refuse("QDEV_ARTIFACT_FILESET", 422);
    const manifest = { schema: "myeve.qdev-staged-artifact/v1", candidate: c, pins, inventory: structuredClone(inventory), inventoryDigest: artifact.inventoryDigest, artifactDigest: artifact.artifactDigest };
    durableWrite(join(pending, MANIFEST), Buffer.from(JSON.stringify(manifest)));
    rmSync(join(pending, "tmp"), { recursive: true, force: true });
    for (const f of present) chmodSync(join(files, f), 0o444);
    try { renameSync(pending, this.committed(c)); }
    catch (error) {
      // A concurrent commit of the same (content-addressed) candidate won the rename: the result is identical.
      if (!["ENOTEMPTY", "EEXIST"].includes(String((error as NodeJS.ErrnoException).code))) throw error;
      rmSync(pending, { recursive: true, force: true });
    }
    return this.receipt(await this.open(c));
  }

  private readManifest(c: ArtifactCandidate): { candidate: ArtifactCandidate; pins: StaticSourcePins; inventory: unknown; inventoryDigest: string; artifactDigest: string } {
    try {
      const path = join(this.committed(c), MANIFEST), stat = lstatSync(path);
      if (!stat.isFile() || stat.size > MAX_MANIFEST_BYTES) throw new Error("manifest");
      const manifest = JSON.parse(readFileSync(path, "utf8"));
      if (manifest?.schema !== "myeve.qdev-staged-artifact/v1" || manifest.candidate?.commit !== c.commit || manifest.candidate?.tree !== c.tree || manifest.candidate?.buildArtifactSha256 !== c.buildArtifactSha256) throw new Error("manifest");
      return manifest;
    } catch { return refuse("QDEV_ARTIFACT_INVALID"); }
  }

  /** Re-verifies EVERY staged byte (inventory, size, digest, exact file set, build identity) and returns the directory the evaluator reads. */
  async open(c: ArtifactCandidate): Promise<StagedArtifact> {
    if (!(await this.has(c))) return refuse("QDEV_ARTIFACT_NOT_STAGED");
    const manifest = this.readManifest(c), files = join(this.committed(c), "files");
    let artifact: StaticArtifactCandidate;
    try { artifact = await StaticArtifactCandidate.retain(manifest.inventory, manifest.pins, loaderFor(files)); } catch { return refuse("QDEV_ARTIFACT_INVALID"); }
    let bare = "";
    try { bare = bareSha256(artifact.artifactDigest); } catch { /* compared below */ }
    if (artifact.artifactDigest !== manifest.artifactDigest || artifact.inventoryDigest !== manifest.inventoryDigest || bare !== c.buildArtifactSha256) return refuse("QDEV_ARTIFACT_INVALID");
    const present = listFiles(files).map(f => f.path).sort(), wanted = artifact.files.map(f => f.path).sort();
    if (present.length !== wanted.length || present.some((p, i) => p !== wanted[i])) return refuse("QDEV_ARTIFACT_INVALID");
    return { dir: files, artifactSha256: bare, inventoryDigest: artifact.inventoryDigest, files: artifact.files.map(f => ({ ...f })) };
  }
  private receipt(staged: StagedArtifact): ArtifactReceipt {
    return { staged: true, artifactSha256: staged.artifactSha256, inventoryDigest: staged.inventoryDigest, files: staged.files.length, bytes: staged.files.reduce((n, f) => n + f.bytes, 0) };
  }
}

const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const asRefusal = (error: unknown) => error instanceof ArtifactStagingRefused ? json(error.status, { error: error.code }) : json(503, { error: "QDEV_VERIFIER_UNAVAILABLE" });

/** Request handlers for the two artifact routes. The caller (the verifier service) has already authenticated the request. */
export function artifactRoutes(store: ArtifactStagingStore, expected: { projectSha256: string; sourceSha256: string }) {
  const foreign = (binding: { projectSha256: string; sourceSha256: string }) => binding.projectSha256 !== expected.projectSha256 || binding.sourceSha256 !== expected.sourceSha256;
  const pairs = (header: string | null, names: string[]) => Object.fromEntries((header ?? "").split(":").map((v, i) => [names[i] ?? "extra", v]));
  return {
    async file(request: Request): Promise<Response> {
      try {
        if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/octet-stream")) return json(400, { error: "QDEV_ARTIFACT_REQUEST" });
        const declared = request.headers.get("content-length");
        if (declared !== null && (!/^\d{1,9}$/.test(declared) || Number(declared) > ARTIFACT_FILE_BODY_LIMIT)) return json(413, { error: "QDEV_ARTIFACT_LIMIT" });
        const candidate = candidateShape.safeParse(pairs(request.headers.get("x-qdev-candidate"), ["commit", "tree", "buildArtifactSha256"]));
        const binding = bindingShape.safeParse(pairs(request.headers.get("x-qdev-binding"), ["projectSha256", "sourceSha256"]));
        const path = request.headers.get("x-qdev-path") ?? "", claimed = request.headers.get("x-qdev-sha256") ?? "";
        if (!candidate.success || !binding.success) return json(400, { error: "QDEV_ARTIFACT_REQUEST" });
        if (foreign(binding.data)) return json(403, { error: "QDEV_VERIFIER_FOREIGN_BINDING" });
        const bytes = new Uint8Array(await request.arrayBuffer());
        await store.receiveFile(candidate.data, path, claimed, bytes);
        return json(200, { received: true, path, sha256: claimed });
      } catch (error) { return asRefusal(error); }
    },
    async commit(body: unknown): Promise<Response> {
      try {
        const parsed = commitRequest.safeParse(body);
        if (!parsed.success) return json(400, { error: "QDEV_ARTIFACT_REQUEST" });
        if (foreign(parsed.data.binding)) return json(403, { error: "QDEV_VERIFIER_FOREIGN_BINDING" });
        return json(200, await store.commit(parsed.data.candidate, parsed.data.pins, parsed.data.inventory));
      } catch (error) { return asRefusal(error); }
    },
  };
}

export type StageArtifactConfig = {
  origin: string; authorization: string; fetch?: typeof fetch; timeoutMs?: number;
  source: ArtifactSource; candidate: ArtifactCandidate; binding: { projectSha256: string; sourceSha256: string };
};
/** Producer side: uploads the retained exact bytes (one bounded request per inventoried file) and checks the commit receipt against the local artifact. */
export async function stageArtifact(c: StageArtifactConfig): Promise<ArtifactReceipt> {
  const { artifact, pins, inventory } = c.source, fail = (code: string): never => { throw new ArtifactStagingRefused(code); };
  let bare: string;
  try { bare = bareSha256(artifact.artifactDigest); } catch { return fail("QDEV_ARTIFACT_INVALID"); }
  if (bare !== c.candidate.buildArtifactSha256 || pins.sourceCommit !== c.candidate.commit || pins.sourceTree !== c.candidate.tree
    || artifact.source.sourceCommit !== c.candidate.commit || artifact.source.sourceTree !== c.candidate.tree) return fail("QDEV_ARTIFACT_CANDIDATE_MISMATCH");
  const send = async (path: string, init: RequestInit): Promise<any> => {
    const response = await (c.fetch ?? fetch)(c.origin + path, { method: "POST", redirect: "error", signal: AbortSignal.timeout(c.timeoutMs ?? 60_000), ...init });
    if (response.status !== 200) throw new ArtifactStagingRefused("QDEV_ARTIFACT_STATUS_" + response.status);
    return response.json();
  };
  const candidateHeader = c.candidate.commit + ":" + c.candidate.tree + ":" + c.candidate.buildArtifactSha256;
  const bindingHeader = c.binding.projectSha256 + ":" + c.binding.sourceSha256;
  for (const file of artifact.files) {
    const bytes = artifact.candidateBytes(file.path);
    const ack = await send(ARTIFACT_PATHS.file, { headers: { authorization: c.authorization, "content-type": "application/octet-stream", "x-qdev-candidate": candidateHeader,
      "x-qdev-binding": bindingHeader, "x-qdev-path": file.path, "x-qdev-sha256": file.sha256 }, body: new Uint8Array(bytes) });
    if (!ack || ack.received !== true || ack.path !== file.path || ack.sha256 !== file.sha256) return fail("QDEV_ARTIFACT_ACK");
  }
  const receipt = await send(ARTIFACT_PATHS.commit, { headers: { authorization: c.authorization, "content-type": "application/json" },
    body: JSON.stringify({ candidate: c.candidate, binding: c.binding, pins, inventory }) });
  const total = artifact.files.reduce((n, f) => n + f.bytes, 0);
  if (!receipt || Object.keys(receipt).sort().join(",") !== "artifactSha256,bytes,files,inventoryDigest,staged" || receipt.staged !== true || receipt.artifactSha256 !== bare
    || receipt.inventoryDigest !== artifact.inventoryDigest || receipt.files !== artifact.files.length || receipt.bytes !== total) return fail("QDEV_ARTIFACT_RECEIPT");
  return receipt as ArtifactReceipt;
}
