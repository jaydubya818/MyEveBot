
import { createPublicKey, sign as edSign, verify as edVerify, createPrivateKey, createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canonical } from "../../../../packages/myapps/src/contracts.ts";
import type { ActivationOperation, ActivationRequest, StaticReleaseConfig } from "./static-publish.ts";

/**
 * Scoped, single-use, owner-signed activation approvals for the QDEV static release controller.
 *
 * The controller refuses every mutation unless `activation.permit(request)` returns exactly `true`. This is the ordinary body behind that seam: it
 * verifies an Ed25519-signed approval FILE written by the owner (the approver key lives with the owner; only its PUBLIC key is pinned in the profile)
 * and consumes it once. An approval names the operation, app, owner, project, exact release digest (and exact rollback version) it authorizes, a
 * short validity window and a nonce. No approval, a mismatched scope, an expired/not-yet-valid/over-long window, an unknown/revoked/forged key, a
 * tampered payload, an unsafe directory or file, or an already consumed approval yields `false`. Nothing here deploys, exposes or activates by itself.
 */
const SCHEMA = "myeve.qdev-activation-approval/v1";
const DOMAIN = SCHEMA + "\n";
const MAX_FILES = 64, MAX_BYTES = 8192, MAX_WINDOW_MS = 24 * 3600_000;
const HEX64 = /^[a-f0-9]{64}$/;

export type ActivationApproval = {
  schema: typeof SCHEMA; operation: ActivationOperation; appId: string; ownerId: string; projectSha256: string; digest: string; version?: number;
  keyId: string; notBefore: string; notAfter: string; nonce: string;
};
export type ApproverKey = { keyId: string; publicKeyPem: string; activeFrom: string; notAfter: string; revokedAt?: string };

/** Owner-side signing helper (offline, with the owner's private key). Returns the exact file content to place in the approvals directory. */
export function signActivationApproval(approval: ActivationApproval, privateKeyPem: string): string {
  const key = createPrivateKey(privateKeyPem);
  if (key.asymmetricKeyType !== "ed25519") throw new Error("QDEV_ACTIVATION_SIGNER_ALGORITHM");
  const signature = edSign(null, Buffer.from(DOMAIN + canonical(approval)), key).toString("base64url");
  return canonical({ payload: approval, signature });
}

const fingerprint = (pem: string) => createHash("sha256").update(createPublicKey(pem).export({ type: "spki", format: "der" })).digest("hex");
/** SPKI fingerprints, so independence from the verifier/producer/build-issuer keys can be checked by the caller. */
export const approverFingerprints = (keys: ApproverKey[]) => keys.map(key => fingerprint(key.publicKeyPem));

function privateDirectory(path: string): boolean {
  try {
    const st = lstatSync(path);
    return st.isDirectory() && !st.isSymbolicLink() && (st.mode & 0o077) === 0 && (typeof process.getuid !== "function" || st.uid === process.getuid());
  } catch { return false; }
}
function readRegular(path: string): Buffer | null {
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const st = fstatSync(fd);
    if (!st.isFile() || st.nlink !== 1 || st.size > MAX_BYTES || (st.mode & 0o022) !== 0) return null;
    return readFileSync(fd);
  } catch { return null; } finally { if (fd !== undefined) closeSync(fd); }
}

export class FileActivationPermits {
  private readonly scope: { ownerId: string; appId: string; projectSha256: string };
  private chain: Promise<unknown> = Promise.resolve();
  constructor(private readonly c: { dir: string; keys: ApproverKey[]; ownerId: string; appId: string; projectSha256: string; now?: () => number }) {
    if (!c.ownerId || !c.appId || !HEX64.test(c.projectSha256) || !c.keys.length || c.keys.length > 4) throw new Error("QDEV_ACTIVATION_CONFIG");
    for (const key of c.keys) { if (createPublicKey(key.publicKeyPem).asymmetricKeyType !== "ed25519") throw new Error("QDEV_ACTIVATION_KEY"); }
    if (new Set(c.keys.map(k => k.keyId)).size !== c.keys.length) throw new Error("QDEV_ACTIVATION_KEY");
    this.scope = { ownerId: c.ownerId, appId: c.appId, projectSha256: c.projectSha256 };
  }

  /** The seam the controller calls. Serialized so concurrent requests cannot both consume one approval. */
  permit = (request: ActivationRequest): Promise<boolean> => {
    const run = this.chain.then(() => this.decide(request), () => this.decide(request));
    this.chain = run.catch(() => undefined);
    return run.catch(() => false);
  };

  private candidates(): Array<{ payload: ActivationApproval; name: string }> {
    const dir = join(this.c.dir, "approvals");
    if (!privateDirectory(this.c.dir) || !privateDirectory(dir)) return [];
    const out: Array<{ payload: ActivationApproval; name: string }> = [];
    for (const name of readdirSync(dir).filter(n => /^[A-Za-z0-9._-]{1,120}\.json$/.test(n)).sort().slice(0, MAX_FILES)) {
      const bytes = readRegular(join(dir, name));
      if (!bytes) continue;
      try {
        const text = bytes.toString("utf8"), envelope = JSON.parse(text) as { payload?: ActivationApproval; signature?: string };
        if (!envelope.payload || typeof envelope.signature !== "string" || canonical(envelope) !== text) continue;
        const key = this.c.keys.find(k => k.keyId === envelope.payload!.keyId), now = this.c.now?.() ?? Date.now();
        if (!key || key.revokedAt !== undefined && Date.parse(key.revokedAt) <= now || Date.parse(key.activeFrom) > now || Date.parse(key.notAfter) <= now) continue;
        const signature = Buffer.from(envelope.signature, "base64url");
        if (signature.length !== 64 || signature.toString("base64url") !== envelope.signature) continue;
        if (!edVerify(null, Buffer.from(DOMAIN + canonical(envelope.payload)), createPublicKey(key.publicKeyPem), signature)) continue;
        out.push({ payload: envelope.payload, name });
      } catch { /* an unreadable or malformed approval never authorizes */ }
    }
    return out;
  }

  private matches(p: ActivationApproval, request: ActivationRequest, now: number): boolean {
    if (p.schema !== SCHEMA || p.operation !== request.operation || p.appId !== request.appId || p.ownerId !== request.ownerId || p.projectSha256 !== request.projectSha256
      || p.digest !== request.digest || p.version !== request.version || typeof p.nonce !== "string" || p.nonce.length < 16 || p.nonce.length > 128) return false;
    if (p.appId !== this.scope.appId || p.ownerId !== this.scope.ownerId || p.projectSha256 !== this.scope.projectSha256) return false;
    const from = Date.parse(p.notBefore), to = Date.parse(p.notAfter);
    return Number.isFinite(from) && Number.isFinite(to) && from <= now && now < to && to - from <= MAX_WINDOW_MS;
  }

  private async decide(request: ActivationRequest): Promise<boolean> {
    const now = this.c.now?.() ?? Date.now();
    if (request.operation !== "PUBLISH" && request.operation !== "ROLLBACK") return false;
    const consumed = join(this.c.dir, "consumed");
    for (const { payload } of this.candidates()) {
      if (!this.matches(payload, request, now)) continue;
      mkdirSync(consumed, { recursive: true, mode: 0o700 });
      if (!privateDirectory(consumed)) return false;
      // Single use: exclusive creation of the marker is the consumption. A crash after it wastes the approval (fail closed), never reuses it.
      try { closeSync(openSync(join(consumed, createHash("sha256").update(canonical(payload)).digest("hex")), constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)); }
      catch { continue; }
      return true;
    }
    return false;
  }
}

/** `StaticReleaseConfig.activation` for a profile that pins approver keys and an approvals directory. */
export const fileActivation = (c: ConstructorParameters<typeof FileActivationPermits>[0]): NonNullable<StaticReleaseConfig["activation"]> => ({ permit: new FileActivationPermits(c).permit });
