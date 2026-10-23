import { createHmac, randomBytes } from "node:crypto";
import { db } from "../agent/lib/receipts-db.ts";
import { hashPassword, tokenDigest, verifyPassword } from "./password-crypto.ts";

export interface Credential { owner_id: string; password_hash: string; version: number }
const options = () => ({ fetchOptions: { signal: AbortSignal.timeout(5_000), cache: "no-store" as const } });

export function authInstallationId(env: NodeJS.ProcessEnv = process.env): string {
  const id = env.VERCEL_PROJECT_ID?.trim();
  if (env.VERCEL && !id) throw new Error("Authentication installation binding is missing.");
  return id || "local";
}

function passwordFingerprint(password: string, env: NodeJS.ProcessEnv): string {
  const secret = env.MYEVE_SESSION_SECRET?.trim() || env.SOFIE_SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("Authentication signing key is missing.");
  return createHmac("sha256", secret).update("myeve-password-fingerprint-v1\0")
    .update(authInstallationId(env)).update("\0").update(password.normalize("NFC")).digest("hex");
}

const duplicatePassword = (error: unknown): boolean => typeof error === "object" && error !== null
  && "code" in error && error.code === "23505";

export async function credentialFor(ownerId: string, env = process.env): Promise<Credential | null> {
  const rows = await db().query(
    "SELECT owner_id, password_hash, version FROM web_password_credentials WHERE installation_id=$1 AND owner_id=$2",
    [authInstallationId(env), ownerId], options(),
  );
  return (rows[0] as Credential | undefined) ?? null;
}

/** Bootstrap only after the existing deployment password has been verified. */
export async function bootstrapCredential(ownerId: string, password: string, env = process.env): Promise<Credential> {
  const hash = await hashPassword(password);
  await db().query(
    `INSERT INTO web_password_credentials (installation_id, owner_id, password_hash, password_fingerprint)
     VALUES ($1,$2,$3,$4) ON CONFLICT (installation_id, owner_id) DO NOTHING`,
    [authInstallationId(env), ownerId, hash, passwordFingerprint(password, env)], options(),
  );
  const row = await credentialFor(ownerId, env);
  if (!row || !await verifyPassword(password, row.password_hash)) throw new Error("Credentials changed. Sign in again.");
  return row;
}

export async function credentialVersion(ownerId: string, env = process.env): Promise<number> {
  const rows = await db().query(
    "SELECT version FROM web_password_credentials WHERE installation_id=$1 AND owner_id=$2",
    [authInstallationId(env), ownerId], options(),
  );
  return rows.length ? Number(rows[0].version) : 0;
}

/** Atomic compare-and-set prevents an in-flight old-password login/change winning a reset. */
export async function replacePassword(ownerId: string, expectedVersion: number, password: string, env = process.env): Promise<boolean> {
  const hash = await hashPassword(password);
  try {
  const rows = await db().query(
    `WITH changed AS (
       UPDATE web_password_credentials SET password_hash=$4, password_fingerprint=$5, version=version+1, updated_at=now()
       WHERE installation_id=$1 AND owner_id=$2 AND version=$3 RETURNING owner_id
     ), cleared AS (
       DELETE FROM web_password_resets WHERE installation_id=$1 AND owner_id IN (SELECT owner_id FROM changed)
     ) SELECT owner_id FROM changed`,
    [authInstallationId(env), ownerId, expectedVersion, hash, passwordFingerprint(password, env)], options(),
  );
  return rows.length === 1;
  } catch (error) { if (duplicatePassword(error)) return false; throw error; }
}

/** A rolling database window is shared by every serverless instance. No IPs are stored. */
export async function consumeAuthAttempt(scope: string, key: string, maximum: number, env = process.env): Promise<boolean> {
  const rows = await db().query(
    `INSERT INTO web_auth_attempts (installation_id,scope,key_hash,attempts,expires_at)
     VALUES ($1,$2,$3,1,now()+interval '15 minutes')
     ON CONFLICT (installation_id,scope,key_hash) DO UPDATE SET
       attempts=CASE WHEN web_auth_attempts.expires_at<=now() THEN 1 ELSE web_auth_attempts.attempts+1 END,
       expires_at=CASE WHEN web_auth_attempts.expires_at<=now() THEN now()+interval '15 minutes' ELSE web_auth_attempts.expires_at END
     WHERE web_auth_attempts.expires_at<=now() OR web_auth_attempts.attempts<$4
     RETURNING attempts`,
    [authInstallationId(env), scope, tokenDigest(key), maximum], options(),
  );
  return rows.length === 1;
}

export async function consumeInstallationAttempt(scope: string, maximum: number, env = process.env): Promise<boolean> {
  // Bounded housekeeping uses the same database; no background service is needed.
  await db().query(
    `DELETE FROM web_auth_attempts WHERE ctid IN (
       SELECT ctid FROM web_auth_attempts WHERE installation_id=$1
       AND expires_at<now()-interval '1 day' LIMIT 100
     )`, [authInstallationId(env)], options(),
  );
  return consumeAuthAttempt(scope, "all", maximum, env);
}

export function authClientKey(request: Request): string {
  // Vercel overwrites this header at its trusted edge. Do not trust client-supplied X-Forwarded-For.
  return process.env.VERCEL ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    : "local";
}

export async function issuePasswordReset(ownerId: string, env = process.env): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const rows = await db().query(
    `INSERT INTO web_password_resets (installation_id,owner_id,token_hash,credential_version,expires_at)
     SELECT installation_id,owner_id,$3,version,now()+interval '15 minutes'
     FROM web_password_credentials WHERE installation_id=$1 AND owner_id=$2
     ON CONFLICT (installation_id,owner_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,
       credential_version=EXCLUDED.credential_version,expires_at=EXCLUDED.expires_at RETURNING owner_id`,
    [authInstallationId(env), ownerId, tokenDigest(token)], options(),
  );
  if (!rows.length) throw new Error("Sign in once to initialize this installation's password before issuing recovery.");
  return token;
}

export async function resetPassword(token: string, password: string, env = process.env): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const hash = await hashPassword(password);
  try {
  const rows = await db().query(
    `WITH used AS (
       DELETE FROM web_password_resets WHERE installation_id=$1 AND token_hash=$2 AND expires_at>now()
       RETURNING installation_id,owner_id,credential_version
     ), changed AS (
       UPDATE web_password_credentials c SET password_hash=$3,password_fingerprint=$4,version=c.version+1,updated_at=now()
       FROM used WHERE c.installation_id=used.installation_id AND c.owner_id=used.owner_id
         AND c.version=used.credential_version RETURNING c.owner_id
     ) SELECT owner_id FROM changed`,
    [authInstallationId(env), tokenDigest(token), hash, passwordFingerprint(password, env)], options(),
  );
  return rows.length === 1;
  } catch (error) { if (duplicatePassword(error)) return false; throw error; }
}

export async function passwordResetOwner(token: string, env = process.env): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const rows = await db().query(
    `SELECT r.owner_id FROM web_password_resets r JOIN web_password_credentials c
     ON c.installation_id=r.installation_id AND c.owner_id=r.owner_id AND c.version=r.credential_version
     WHERE r.installation_id=$1 AND r.token_hash=$2 AND r.expires_at>now()`,
    [authInstallationId(env), tokenDigest(token)], options(),
  );
  return rows.length ? String(rows[0].owner_id) : null;
}
