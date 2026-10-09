import { createHash } from "node:crypto";
import { db } from "../agent/lib/receipts-db.ts";

const digest = (token: string) => createHash("sha256").update(token).digest("hex");
const options = () => ({ fetchOptions: { signal: AbortSignal.timeout(5_000), cache: "no-store" } });

export async function sessionRevoked(ownerId: string, token: string): Promise<boolean> {
  const rows = await db().query(
    "SELECT 1 FROM web_session_revocations WHERE owner_id = $1 AND token_sha256 = $2",
    [ownerId, digest(token)], options(),
  );
  return rows.length > 0;
}

export async function revokeSession(ownerId: string, token: string, expiresAt: Date): Promise<void> {
  await db().query(
    `INSERT INTO web_session_revocations (owner_id, token_sha256, expires_at)
     VALUES ($1, $2, $3) ON CONFLICT (owner_id, token_sha256) DO NOTHING`,
    [ownerId, digest(token), expiresAt.toISOString()], options(),
  );
}
