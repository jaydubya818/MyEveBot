import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { inTransaction, managedDb } from "./db";
import { managedProjectName, normalizeInviteEmail } from "./state";

export interface ManagedInvite {
  id: string;
  url: string;
  email: string;
  expiresAt: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function inviteKey(): Buffer {
  const raw = process.env.MANAGED_EVE_INVITE_KEY;
  if (!raw) throw new Error("Managed Eve invitation encryption is not configured");
  const key = Buffer.from(raw, "base64url");
  if (key.length !== 32) throw new Error("Managed Eve invitation key must be 32 bytes");
  return key;
}

export function encryptRelayInvite(url: string): string {
  const parsed = new URL(url);
  const fragment = new URLSearchParams(parsed.hash.slice(1));
  const token = fragment.get("invite");
  if (parsed.origin !== "https://relay-sage-nine.vercel.app" || parsed.pathname !== "/signup" ||
      parsed.search || fragment.size !== 1 || !token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new Error("Relay invitation must be the approved production signup URL");
  }
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", inviteKey(), nonce);
  const encrypted = Buffer.concat([cipher.update(url, "utf8"), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function decryptRelayInvite(value: string): string {
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length < 29) throw new Error("Invalid Relay invitation record");
  const decipher = createDecipheriv("aes-256-gcm", inviteKey(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
}

export async function issueManagedInvite(input: {
  email: string;
  relayInviteUrl: string;
  builderOrigin: string;
  monthlyModelBudgetUsd: number;
}): Promise<ManagedInvite> {
  const email = normalizeInviteEmail(input.email);
  const token = randomBytes(32).toString("base64url");
  const encryptedRelayInvite = encryptRelayInvite(input.relayInviteUrl);
  if (!Number.isFinite(input.monthlyModelBudgetUsd) || input.monthlyModelBudgetUsd < 1 || input.monthlyModelBudgetUsd > 1000) {
    throw new Error("A valid model budget is required");
  }
  const id = `inv_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
  const expiresAt = new Date(Date.now() + 7 * 86400_000).toISOString();
  await inTransaction(async (client) => {
    // Serialize admission checks across concurrent operator requests.
    await client.query("SELECT pg_advisory_xact_lock(670101)");
    await client.query(
      "UPDATE managed_beta_invites SET revoked_at=now() WHERE claimed_at IS NULL AND revoked_at IS NULL AND expires_at <= now()",
    );
    const activeLimit = Number(process.env.MANAGED_EVE_MAX_ACTIVE ?? "5");
    if (!Number.isSafeInteger(activeLimit) || activeLimit < 1 || activeLimit > 100) {
      throw new Error("MANAGED_EVE_MAX_ACTIVE must be between 1 and 100");
    }
    const count = await client.query<{ total: string }>(
      `SELECT (
         (SELECT count(*) FROM managed_eve_environments WHERE state <> 'retired') +
         (SELECT count(*) FROM managed_beta_invites WHERE claimed_at IS NULL AND revoked_at IS NULL AND expires_at > now())
       )::text AS total`,
    );
    if (Number(count.rows[0]?.total ?? 0) >= activeLimit) throw new Error("Managed beta capacity reached");
    const existing = await client.query(
      "SELECT 1 FROM managed_eve_environments WHERE lower(email)=lower($1) AND state <> 'retired' LIMIT 1",
      [email],
    );
    if (existing.rowCount) throw new Error("This tester already has a managed Eve");
    await client.query(
      "INSERT INTO managed_beta_invites (id,email,token_hash,relay_invite_ciphertext,monthly_model_budget_usd,expires_at) VALUES ($1,$2,$3,$4,$5,$6)",
      [id, email, hashToken(token), encryptedRelayInvite, input.monthlyModelBudgetUsd, expiresAt],
    );
  });
  return { id, url: `${new URL(input.builderOrigin).origin}/join?invite=${token}`, email, expiresAt };
}

export async function revokeManagedInvite(id: string): Promise<boolean> {
  if (!/^inv_[a-f0-9]{24}$/.test(id)) return false;
  return inTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(670101)");
    const result = await client.query(
      "UPDATE managed_beta_invites SET revoked_at=now() WHERE id=$1 AND claimed_at IS NULL AND revoked_at IS NULL RETURNING id",
      [id],
    );
    return result.rowCount === 1;
  });
}

export async function lookupManagedInvite(token: string): Promise<{
  id: string;
  email: string;
  relayInviteUrl: string;
  expiresAt: string;
  claimed: boolean;
} | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const result = await managedDb().query<{
    id: string; email: string; relay_invite_ciphertext: string; expires_at: Date; claimed_at: Date | null;
  }>(
    "SELECT id,email,relay_invite_ciphertext,expires_at,claimed_at FROM managed_beta_invites WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at > now()",
    [hashToken(token)],
  );
  const row = result.rows[0];
  if (!row?.relay_invite_ciphertext) return null;
  return {
    id: row.id,
    email: row.email,
    relayInviteUrl: decryptRelayInvite(row.relay_invite_ciphertext),
    expiresAt: row.expires_at.toISOString(),
    claimed: row.claimed_at !== null,
  };
}

export async function claimManagedInvite(input: {
  token: string;
  ownerName: string;
  agentName: string;
}): Promise<{ environmentId: string; projectName: string; monthlyModelBudgetUsd: number }> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.token)) throw new Error("Invalid invitation");
  const ownerName = input.ownerName.trim();
  const agentName = input.agentName.trim();
  if (!ownerName || ownerName.length > 100 || !agentName || agentName.length > 100) throw new Error("Enter a name for yourself and your Eve");
  return inTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(670101)");
    const invite = await client.query<{ id: string; email: string; monthly_model_budget_usd: string }>(
      "SELECT id,email,monthly_model_budget_usd FROM managed_beta_invites WHERE token_hash=$1 AND claimed_at IS NULL AND revoked_at IS NULL AND expires_at > now() FOR UPDATE",
      [hashToken(input.token)],
    );
    const row = invite.rows[0];
    if (!row) throw new Error("Invitation is invalid, expired, or already used");
    const activeLimit = Number(process.env.MANAGED_EVE_MAX_ACTIVE ?? "5");
    if (!Number.isSafeInteger(activeLimit) || activeLimit < 1 || activeLimit > 100) {
      throw new Error("MANAGED_EVE_MAX_ACTIVE must be between 1 and 100");
    }
    const active = await client.query<{ total: string }>(
      "SELECT count(*)::text AS total FROM managed_eve_environments WHERE state <> 'retired'",
    );
    if (Number(active.rows[0]?.total ?? 0) >= activeLimit) throw new Error("Managed beta capacity reached");
    const environmentId = `env_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
    const projectName = managedProjectName(environmentId);
    await client.query(
      "INSERT INTO managed_eve_environments (id,invite_id,email,owner_name,agent_name,project_name,state,monthly_model_budget_usd) VALUES ($1,$2,$3,$4,$5,$6,'approved',$7)",
      [environmentId, row.id, row.email, ownerName, agentName, projectName, row.monthly_model_budget_usd],
    );
    await client.query("UPDATE managed_beta_invites SET claimed_at=now() WHERE id=$1", [row.id]);
    await client.query(
      "INSERT INTO managed_eve_events (id,environment_id,kind) VALUES ($1,$2,'invite_claimed')",
      [`evt_${randomUUID().replaceAll("-", "").slice(0, 24)}`, environmentId],
    );
    return { environmentId, projectName, monthlyModelBudgetUsd: Number(row.monthly_model_budget_usd) };
  });
}
