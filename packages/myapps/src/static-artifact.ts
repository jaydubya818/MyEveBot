import { createHash } from "node:crypto";
import { AppError, canonical, digest, keys, requireValue } from "./contracts.ts";

export const STATIC_ARTIFACT_LIMITS = Object.freeze({ files: 256, fileBytes: 8 * 1024 * 1024, totalBytes: 16 * 1024 * 1024 });
export interface StaticSourcePins { sourceCommit: string; sourceTree: string; lockSha256: string }
export interface StaticFile { path: string; bytes: number; sha256: string }
interface BuildInventory extends StaticSourcePins {
  schema: "myeve.dashboard.build-inventory/v1";
  scope: "BROWSER_BUILD_ONLY";
  node: string;
  files: StaticFile[];
  independentVerification: "NOT_ESTABLISHED";
  signedResult: false;
  releaseQualified: false;
}
const unavailable = () => new AppError("APP_ARTIFACT_UNAVAILABLE");
const retainedConstruction = Symbol("retained-static-artifact");
const retainedCandidates = new WeakSet<object>();

/** Runtime retention brand, without granting owner or installation authority. */
export function isRetainedStaticArtifact(value: unknown): value is StaticArtifactCandidate {
  return typeof value === "object" && value !== null && retainedCandidates.has(value);
}
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const hash = (value: unknown, length: number) => typeof value === "string" && new RegExp(`^[a-f0-9]{${length}}$`).test(value);

function sourcePins(value: unknown): StaticSourcePins {
  // Validate and compare the same detached values, including caller-backed getters.
  try { value = structuredClone(value); } catch { throw new AppError("APP_ARTIFACT_SOURCE_INVALID"); }
  keys(value, ["sourceCommit", "sourceTree", "lockSha256"]);
  requireValue(hash(value.sourceCommit, 40) && hash(value.sourceTree, 40) && hash(value.lockSha256, 64), "APP_ARTIFACT_SOURCE_INVALID");
  return { sourceCommit: value.sourceCommit, sourceTree: value.sourceTree, lockSha256: value.lockSha256 };
}

function assetPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 240 || !value.startsWith("dist/")) return false;
  // No URL decoding, path normalization or filesystem traversal belongs here.
  return value.split("/").every(part => /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(part) && !part.endsWith("."));
}

function inventory(value: unknown): BuildInventory {
  // Snapshot once before checking values. Accessors must not change a validated
  // path or size before a later reader call or metadata copy.
  try { value = structuredClone(value); } catch { throw new AppError("APP_ARTIFACT_INVENTORY_INVALID"); }
  canonical(value);
  keys(value, ["schema", "scope", "sourceCommit", "sourceTree", "lockSha256", "node", "files", "independentVerification", "signedResult", "releaseQualified"]);
  requireValue(value.schema === "myeve.dashboard.build-inventory/v1" && value.scope === "BROWSER_BUILD_ONLY" &&
    value.independentVerification === "NOT_ESTABLISHED" && value.signedResult === false && value.releaseQualified === false, "APP_ARTIFACT_INVENTORY_INVALID");
  sourcePins({ sourceCommit: value.sourceCommit, sourceTree: value.sourceTree, lockSha256: value.lockSha256 });
  requireValue(typeof value.node === "string" && /^v24\.[0-9]+\.[0-9]+$/.test(value.node), "APP_ARTIFACT_RUNTIME_UNSUPPORTED");
  requireValue(Array.isArray(value.files) && value.files.length > 0 && value.files.length <= STATIC_ARTIFACT_LIMITS.files, "APP_ARTIFACT_LIMIT");
  const seen = new Set<string>();
  let total = 0;
  for (const file of value.files) {
    keys(file, ["path", "bytes", "sha256"]);
    requireValue(assetPath(file.path) && hash(file.sha256, 64), "APP_ARTIFACT_INVENTORY_INVALID");
    requireValue(Number.isSafeInteger(file.bytes) && file.bytes >= 0 && file.bytes <= STATIC_ARTIFACT_LIMITS.fileBytes, "APP_ARTIFACT_LIMIT");
    // Reject case aliases as well as exact duplicates before any bytes are read.
    const identity = file.path.toLowerCase();
    requireValue(!seen.has(identity), "APP_ARTIFACT_PATH_CONFLICT"); seen.add(identity);
    total += file.bytes;
  }
  requireValue(total <= STATIC_ARTIFACT_LIMITS.totalBytes, "APP_ARTIFACT_LIMIT");
  requireValue(value.files.some((file: StaticFile) => file.path === "dist/index.html"), "APP_ARTIFACT_ENTRY_MISSING");
  for (const file of value.files as StaticFile[]) {
    const parts = file.path.toLowerCase().split("/");
    for (let index = 1; index < parts.length; index++) requireValue(!seen.has(parts.slice(0, index).join("/")), "APP_ARTIFACT_PATH_CONFLICT");
  }
  return value as BuildInventory;
}

/** Exact-byte retention only. This object is neither an installed App nor an acceptance Proof. */
export class StaticArtifactCandidate {
  readonly source: Readonly<StaticSourcePins>;
  readonly inventoryDigest: string;
  readonly artifactDigest: string;
  readonly files: readonly Readonly<StaticFile>[];
  readonly independentVerification = "NOT_ESTABLISHED";
  readonly installed = false;
  #bytes: Map<string, Uint8Array>;

  private constructor(manifest: BuildInventory, bytes: Map<string, Uint8Array>, token: typeof retainedConstruction) {
    // TypeScript's private modifier does not restrict JavaScript callers.
    requireValue(token === retainedConstruction, "APP_ARTIFACT_UNAVAILABLE");
    this.source = Object.freeze(sourcePins({ sourceCommit: manifest.sourceCommit, sourceTree: manifest.sourceTree, lockSha256: manifest.lockSha256 }));
    this.inventoryDigest = digest(manifest);
    this.files = Object.freeze(manifest.files.map(file => Object.freeze({ ...file })).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    this.artifactDigest = digest({ source: this.source, files: this.files });
    this.#bytes = bytes;
    Object.freeze(this);
    retainedCandidates.add(this);
  }

  /** Caller supplies trusted expected source pins and a bounded retained-object reader.
   * It must independently authorize owner/Work/Result custody; inventory fields grant none. */
  static async retain(value: unknown, expectedSource: StaticSourcePins, load: (path: string) => Promise<Uint8Array>): Promise<StaticArtifactCandidate> {
    const manifest = inventory(value), expected = sourcePins(expectedSource);
    requireValue(manifest.sourceCommit === expected.sourceCommit && manifest.sourceTree === expected.sourceTree && manifest.lockSha256 === expected.lockSha256, "APP_ARTIFACT_SOURCE_MISMATCH");
    const retained = new Map<string, Uint8Array>();
    for (const file of manifest.files) {
      let loaded: Uint8Array;
      try { loaded = await load(file.path); } catch { throw unavailable(); }
      requireValue(loaded instanceof Uint8Array && loaded.byteLength === file.bytes, "APP_ARTIFACT_BYTES_MISMATCH");
      const bytes = Uint8Array.from(loaded);
      requireValue(sha256(bytes) === file.sha256, "APP_ARTIFACT_BYTES_MISMATCH");
      retained.set(file.path, bytes);
    }
    return new StaticArtifactCandidate(manifest, retained, retainedConstruction);
  }

  /** Defensive copy for a later separately authorized host. No network or filesystem access. */
  candidateBytes(path: string): Uint8Array {
    const bytes = this.#bytes.get(path);
    if (!bytes) throw unavailable();
    return Uint8Array.from(bytes);
  }
}
