import { createHash } from "node:crypto";
import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from "node:fs";
import { join } from "node:path";
import { canonical, digest, RESULT_PROTOCOL, validateLocalResultManifestV4, type LocalResultManifestV4, type ResultKey } from "../engineering/factory-producer-protocol.ts";
import { verifyProtocolPayload } from "../engineering/factory-producer-signature.ts";
import { hostedOwnerScope } from "../engineering/factory-mailbox.ts";
import type { MacBuildRequest } from "./hosted-mac-build.ts";

/**
 * MAC SIDE: what makes a hosted build job executable on the owner's Mac.
 *
 * Hosted MyEve (and its database, and anyone who can write a job row) is NOT trusted to start Docker or the build signer. Before anything runs,
 * the Mac worker requires, from data it verifies itself:
 *  1. Factory authority: the job carries the stage-3 Factory Result (manifest + signature, no artifact bytes) signed by a Factory RESULT key the Mac
 *     pins locally (the same producer/receipt keys the Factory's own clients verify). The Factory signs a Result only for a request it admitted
 *     under MissionControl's ordered admission and its own spend reservation, so the signature proves an admitted, accounted run. The Result must
 *     be COMPLETED for exactly the job's candidate commit/tree and bound to the job's request/run/Factory/source/configuration/input pins.
 *  2. Ownership: the job's installation, owner and ownerScope (`myeve.hosted:<installation>:<owner>`) are exactly this Mac worker's configured
 *     installation; the expected build binding pins the Mac's own lock and build profile and has an unexpired deadline.
 *  3. A durable single-use claim (an exclusive, fsynced directory per job on the Mac) taken BEFORE Docker or signing: a replayed or re-sent job
 *     can never run a second build; a claimed-but-unfinished job stays refused until the operator clears it.
 */
export type MacJobTrust = { installationId: string; ownerId: string; resultKeys: ResultKey[]; lockSha256: string; buildProfileDigest: string };
export type MacBuildAuthority = { schema: "myeve.hosted-mac-build-authority/v1"; installationId: string; ownerScope: string;
  factoryResult: { protocol: string; encoded: string; signature: string; manifestDigest: string } };
export class MacJobRefused extends Error { constructor(readonly code: string) { super(code); } }
const refuse = (code: string): never => { throw new MacJobRefused(code); };
const COMMIT = /^[a-f0-9]{40}$/, HEX = /^[a-f0-9]{64}$/;
const exactKeys = (value: unknown, keys: string[]) => !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === [...keys].sort().join(",");

/** The authority hosted attaches to a build request: the signed stage-3 Result without its artifact bytes. */
export function macBuildAuthority(profile: { installationId: string; ownerId: string }, signedResult: unknown): MacBuildAuthority {
  const r = signedResult as { protocol?: unknown; encoded?: unknown; signature?: unknown; manifestDigest?: unknown };
  if (!r || typeof r.protocol !== "string" || typeof r.encoded !== "string" || typeof r.signature !== "string" || typeof r.manifestDigest !== "string")
    return refuse("MAC_JOB_AUTHORITY_SHAPE");
  return { schema: "myeve.hosted-mac-build-authority/v1", installationId: profile.installationId, ownerScope: hostedOwnerScope(profile),
    factoryResult: { protocol: r.protocol, encoded: r.encoded, signature: r.signature, manifestDigest: r.manifestDigest } };
}

/** Verifies a hosted build job against the Mac's own trust (see module comment). Returns the durable single-use claim key. Pure; never runs anything. */
export function verifyMacBuildJob(input: unknown, trust: MacJobTrust, now = Date.now()): { claimKey: string; manifest: LocalResultManifestV4 } {
  const request = input as MacBuildRequest;
  if (!exactKeys(request, ["schema", "candidate", "binding", "projectSha256", "sourceSha256", "protectedSpecificationSha256", "appId", "authority"])
    || request.schema !== "myeve.hosted-mac-build-request/v2") return refuse("MAC_JOB_SHAPE");
  const c = request.candidate, b = request.binding, a = request.authority;
  if (!exactKeys(c, ["commit", "tree"]) || !COMMIT.test(c.commit) || !COMMIT.test(c.tree)) return refuse("MAC_JOB_CANDIDATE");
  if (![request.projectSha256, request.sourceSha256, request.protectedSpecificationSha256].every(v => typeof v === "string" && HEX.test(v))) return refuse("MAC_JOB_PROJECT");
  if (!b || typeof b !== "object" || b.candidateCommit !== c.commit || b.candidateTree !== c.tree) return refuse("MAC_JOB_BINDING");
  // Ownership: exactly this Mac's installation and per-person scope.
  if (!exactKeys(a, ["schema", "installationId", "ownerScope", "factoryResult"]) || a.schema !== "myeve.hosted-mac-build-authority/v1"
    || a.installationId !== trust.installationId || b.ownerId !== trust.ownerId || a.ownerScope !== hostedOwnerScope(trust)) return refuse("MAC_JOB_FOREIGN");
  if (b.lockSha256 !== trust.lockSha256 || b.buildProfileDigest !== trust.buildProfileDigest) return refuse("MAC_JOB_PINS");
  const deadline = Date.parse(String(b.deadline));
  if (!Number.isFinite(deadline) || deadline <= now) return refuse("MAC_JOB_EXPIRED");
  // Factory authority: the signed stage-3 Result, verified with the Mac's pinned Factory result keys.
  const r = a.factoryResult;
  if (!exactKeys(r, ["protocol", "encoded", "signature", "manifestDigest"]) || r.protocol !== RESULT_PROTOCOL || typeof r.encoded !== "string"
    || typeof r.signature !== "string" || r.encoded.length > 1 << 20) return refuse("MAC_JOB_RESULT_SHAPE");
  let manifest: LocalResultManifestV4, raw: string;
  try {
    raw = Buffer.from(r.encoded, "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(raw);
    validateLocalResultManifestV4(parsed);
    manifest = parsed;
  } catch { return refuse("MAC_JOB_RESULT_INVALID"); }
  if (canonical(manifest) !== raw || Buffer.from(raw).toString("base64url") !== r.encoded || digest(manifest) !== r.manifestDigest) return refuse("MAC_JOB_RESULT_NONCANONICAL");
  const keys = trust.resultKeys.filter(k => k.factoryId === b.factoryId && k.keyId === manifest.keyId);
  if (keys.length !== 1) return refuse("MAC_JOB_RESULT_KEY");
  const key = keys[0];
  let signed = false;
  try { signed = verifyProtocolPayload(RESULT_PROTOCOL, r.encoded, r.signature, key.publicKey); } catch { signed = false; }
  if (!signed) return refuse("MAC_JOB_RESULT_SIGNATURE");
  const issued = Date.parse(manifest.issuedAt);
  if (!(issued >= Date.parse(key.activeFrom) && issued <= Date.parse(key.notAfter) && issued <= now) || key.revokedAt || (key.retiredAt && issued >= Date.parse(key.retiredAt))
    || now > Date.parse(key.notAfter)) return refuse("MAC_JOB_RESULT_KEY_WINDOW");
  const e = manifest.execution;
  if (manifest.status !== "COMPLETED" || !manifest.candidate || manifest.candidate.commit !== c.commit || manifest.candidate.tree !== c.tree) return refuse("MAC_JOB_RESULT_CANDIDATE");
  if (manifest.producer !== b.factoryId || (["factoryId", "factoryVersion", "sourceDigest", "configurationDigest", "requestId", "runId", "inputCommit", "inputTree"] as const)
    .some(f => e[f] !== (b as unknown as Record<string, unknown>)[f])) return refuse("MAC_JOB_RESULT_BINDING");
  const claimKey = createHash("sha256").update(canonical({ schema: "myeve.hosted-mac-build-claim/v1", installationId: trust.installationId, operationId: manifest.operationId,
    candidate: { commit: c.commit, tree: c.tree } })).digest("hex");
  return { claimKey, manifest };
}

export type StoredMacBuild = { inventory: unknown; lockSha256: string; claim: string; files: Array<{ path: string; sha256: string }>; load(path: string): Promise<Uint8Array> };
export type MacJobClaims = {
  /** Atomically and durably takes the single-use claim. "ALREADY" when this job was ever claimed before (replay). */
  claim(key: string, record: Record<string, unknown>): Promise<"CLAIMED" | "ALREADY">;
  saveBuilt(key: string, built: { inventory: unknown; lockSha256: string; claim: string; files: Array<{ path: string; bytes: Uint8Array }> }): Promise<void>;
  /** The build output recorded for a claim, or null (never claimed, or claimed but never finished). */
  loadBuilt(key: string): Promise<StoredMacBuild | null>;
};

function writeDurable(path: string, bytes: Uint8Array | string, exclusive = false) {
  const fd = openSync(path, exclusive ? "wx" : "w", 0o600);
  try { writeSync(fd, typeof bytes === "string" ? Buffer.from(bytes) : bytes); fsyncSync(fd); } finally { closeSync(fd); }
}
function fsyncDir(path: string) { const fd = openSync(path, "r"); try { fsyncSync(fd); } finally { closeSync(fd); } }

/** Durable claims on the Mac: one owner-only (0700) directory per job, created exclusively (mkdir is atomic) and fsynced before the build. */
export function fileMacJobClaims(root: string): MacJobClaims {
  const st = lstatSync(root);
  if (!st.isDirectory() || (st.mode & 0o077) !== 0) throw new MacJobRefused("MAC_JOB_CLAIMS_DIR_MUST_BE_0700");
  const dir = (key: string) => { if (!HEX.test(key)) throw new MacJobRefused("MAC_JOB_CLAIM_KEY"); return join(root, key); };
  return {
    async claim(key, record) {
      try { mkdirSync(dir(key), { mode: 0o700 }); } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") return "ALREADY";
        throw error;
      }
      writeDurable(join(dir(key), "claim.json"), JSON.stringify({ ...record, claimedAt: new Date().toISOString() }), true);
      fsyncDir(dir(key)); fsyncDir(root);
      return "CLAIMED";
    },
    async saveBuilt(key, built) {
      const d = dir(key), files = join(d, "files");
      mkdirSync(files, { recursive: true, mode: 0o700 });
      const index: Array<{ path: string; sha256: string }> = [];
      for (const f of built.files) {
        const sha = createHash("sha256").update(f.bytes).digest("hex");
        writeDurable(join(files, sha), f.bytes);
        index.push({ path: f.path, sha256: sha });
      }
      fsyncDir(files);
      writeDurable(join(d, "built.json.tmp"), JSON.stringify({ inventory: built.inventory, lockSha256: built.lockSha256, claim: built.claim, files: index }));
      renameSync(join(d, "built.json.tmp"), join(d, "built.json"));
      fsyncDir(d);
    },
    async loadBuilt(key) {
      let raw: string;
      try { raw = readFileSync(join(dir(key), "built.json"), "utf8"); } catch { return null; }
      const stored = JSON.parse(raw) as Omit<StoredMacBuild, "load">;
      return { ...stored, load: async (path: string) => {
        const entry = stored.files.find(f => f.path === path);
        if (!entry || !HEX.test(entry.sha256)) throw new MacJobRefused("MAC_JOB_STORED_PATH");
        const bytes = readFileSync(join(dir(key), "files", entry.sha256));
        if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256) throw new MacJobRefused("MAC_JOB_STORED_INTEGRITY");
        return new Uint8Array(bytes);
      } };
    },
  };
}

/** In-memory claims (tests only). */
export function memoryMacJobClaims(): MacJobClaims & { claimed: Set<string> } {
  const claimed = new Set<string>(), built = new Map<string, { inventory: unknown; lockSha256: string; claim: string; files: Array<{ path: string; bytes: Uint8Array }> }>();
  return {
    claimed,
    async claim(key) { if (claimed.has(key)) return "ALREADY"; claimed.add(key); return "CLAIMED"; },
    async saveBuilt(key, b) { built.set(key, { ...b, files: b.files.map(f => ({ path: f.path, bytes: Buffer.from(f.bytes) })) }); },
    async loadBuilt(key) {
      const b = built.get(key);
      if (!b) return null;
      return { inventory: b.inventory, lockSha256: b.lockSha256, claim: b.claim, files: b.files.map(f => ({ path: f.path, sha256: createHash("sha256").update(f.bytes).digest("hex") })),
        load: async (path: string) => { const f = b.files.find(x => x.path === path); if (!f) throw new MacJobRefused("MAC_JOB_STORED_PATH"); return f.bytes; } };
    },
  };
}
