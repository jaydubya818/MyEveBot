/** Installation audit only: no HTTP, authentication helper, credential reseal,
 * database mutation, runtime fallback, route or model entry point. */
import { createDecipheriv, createHash } from "node:crypto";
import { z } from "zod";
import { digest } from "./transport.ts";
const sha = z.string().regex(/^[a-f0-9]{64}$/), id = z.string().min(1).max(255);
export const relayReusePlanSchema = z.object({
  kind: z.literal("RELAY_READ_ONLY_REUSE_PLAN_V1"), expiresAt: z.string().datetime(),
  source: z.object({ databaseRefSha256: sha, ownerId: id, localAgentId: id, connectionSha256: sha,
    credentialCiphertextSha256: sha, ownerSessionCiphertextSha256: sha, encryptionKeySha256: sha }).strict(),
  relay: z.object({ databaseRefSha256: sha, accountId: id, operatorId: id, principalId: id, agentId: id,
    credentialId: id, origin: z.string().url(), address: id, scopeSha256: sha }).strict(),
  target: z.object({ databaseRefSha256: sha, slot: z.enum(["1","2"]), projectId: id, ownerId: id, localAgentId: id }).strict(),
}).strict();
export type RelayReusePlan = z.infer<typeof relayReusePlanSchema>;
interface Client { query(sql: string, params?: unknown[]): Promise<{rows: any[]}>; release(): void; }
interface Pool { connect(): Promise<Client>; }
export interface RelayReadOnlyInstallationAudit {
  mode: "INSTALLATION_READ_ONLY"; expectedPlanSha256: string;
  source: { pool: Pool; databaseReference: string; encryptionKey: Buffer };
  relay: { pool: Pool; databaseReference: string };
  target: { pool: Pool; databaseReference: string; projectId: string; ownerId: string; localAgentId: string };
}
const hash = (v: string) => createHash("sha256").update(v).digest("hex"); // Relay lib/crypto hashSecret
const deny = (code: string): never => { throw Error("RELAY_REUSE_" + code); };
async function readonly<T>(pool: Pool, run: (client: Client) => Promise<T>): Promise<T> {
  let client: Client | undefined;
  try {
    client = await pool.connect(); await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout='5000'");
    if ((await client.query("SELECT current_setting('transaction_read_only') AS mode")).rows[0]?.mode !== "on") deny("NOT_READ_ONLY");
    const result = await run(client); await client.query("COMMIT"); return result;
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    if (error instanceof Error && /^RELAY_REUSE_[A-Z_]+$/.test(error.message)) throw error;
    return deny("READ_UNAVAILABLE");
  } finally { client?.release(); }
}
function open(owner: string, sealed: string, key: Buffer): string {
  try {
    const parts = sealed.split(".");
    if (key.length !== 32 || parts.length !== 3 || parts.some(p => !/^[A-Za-z0-9_-]+$/.test(p))) deny("SEALED_SECRET_INVALID");
    const [iv,tag,data] = parts.map(p => Buffer.from(p,"base64url"));
    if (iv.length !== 12 || tag.length !== 16 || data.length > 65536 || [iv,tag,data].some((b,i) => b.toString("base64url") !== parts[i])) deny("SEALED_SECRET_INVALID");
    const cipher = createDecipheriv("aes-256-gcm",key,iv); cipher.setAAD(Buffer.from(owner)); cipher.setAuthTag(tag);
    const value: unknown = JSON.parse(Buffer.concat([cipher.update(data),cipher.final()]).toString());
    if (typeof value !== "string") return deny("SEALED_SECRET_INVALID");
    if (value.length > 16000 || /[\r\n]/.test(value)) return deny("SEALED_SECRET_INVALID");
    return value;
  } catch { return deny("SEALED_SECRET_INVALID"); }
}
/** Immutable identity/policy projection excludes secret ciphertext and timestamps. */
export function relayConnectionBinding(row: any) {
  return { ownerId: row.owner_id, localAgentId: row.local_agent_id, accountId: row.relay_owner_id, agentId: row.relay_agent_id,
    address: row.address, origin: row.issuer, signingKeyId: row.signing_key_id, signingPublicKey: row.signing_public_key,
    status: row.status, localWorkPolicy: row.local_work_policy };
}

export async function validateRelayReusePlan(value: unknown, audit: RelayReadOnlyInstallationAudit) {
  try {
    const p = relayReusePlanSchema.parse(value), s = p.source, r = p.relay, t = p.target;
    if (audit.mode !== "INSTALLATION_READ_ONLY" || digest(p) !== audit.expectedPlanSha256 || Date.parse(p.expiresAt) <= Date.now()) deny("PLAN_INVALID");
    const origin = new URL(r.origin);
    if (origin.protocol !== "https:" || origin.origin !== r.origin || r.address !== `relay://${r.accountId}/${r.agentId}`) deny("IDENTITY_BINDING");
    if (s.ownerId === t.ownerId || s.databaseRefSha256 === t.databaseRefSha256 || hash(audit.source.databaseReference) !== s.databaseRefSha256
      || hash(audit.relay.databaseReference) !== r.databaseRefSha256 || hash(audit.target.databaseReference) !== t.databaseRefSha256
      || audit.target.ownerId !== t.ownerId || audit.target.localAgentId !== t.localAgentId || audit.target.projectId !== t.projectId
      || audit.source.encryptionKey.length !== 32 || hash(audit.source.encryptionKey.toString("hex")) !== s.encryptionKeySha256) deny("INSTALLATION_BINDING");
    const row = await readonly(audit.source.pool,async c => {
      const rows = (await c.query(`SELECT c.* FROM myeve_relay_connections c JOIN agents a ON a.id=c.local_agent_id
        AND a.owner_id=c.owner_id AND a.status='active' WHERE c.owner_id=$1 AND c.status='active'`,[s.ownerId])).rows;
      if (rows.length !== 1) deny("SOURCE_UNAVAILABLE"); return rows[0];
    });
    if (row.local_agent_id !== s.localAgentId || row.relay_owner_id !== r.accountId || row.relay_agent_id !== r.agentId || row.address !== r.address || row.issuer !== r.origin
      || digest(relayConnectionBinding(row)) !== s.connectionSha256 || hash(row.agent_credential_encrypted) !== s.credentialCiphertextSha256 || hash(row.owner_session_encrypted ?? "") !== s.ownerSessionCiphertextSha256) deny("SOURCE_CHANGED");
    const credential = open(s.ownerId,row.agent_credential_encrypted,audit.source.encryptionKey);
    if (!credential) deny("AGENT_AUTH_INVALID");
    const ownerSession = row.owner_session_encrypted ? open(s.ownerId,row.owner_session_encrypted,audit.source.encryptionKey) : "";
    const ownerSessionStatus = await readonly(audit.relay.pool,async c => {
      const agents = (await c.query(`SELECT c.id,f.registration,f.availability,f.address,c.revoked_at,
        c.expires_at IS NULL OR c.expires_at>clock_timestamp() AS unexpired FROM agent_credentials c
        JOIN agents a ON a.id=c.agent_id AND a.account_id=c.account_id JOIN accounts x ON x.id=a.account_id AND x.retired_at IS NULL
        JOIN federation_agents f ON f.agent_id=a.id AND f.account_id=a.account_id
        WHERE c.secret_hash=$1 AND c.id=$2 AND a.id=$3 AND a.account_id=$4 AND a.status='ACTIVE'`,[hash(credential),r.credentialId,r.agentId,r.accountId])).rows;
      if (agents.length !== 1 || agents[0].revoked_at || !agents[0].unexpired || agents[0].availability === "REVOKED" || agents[0].address !== r.address) deny("AGENT_AUTH_INVALID");
      const operators = (await c.query(`SELECT p.id FROM users u JOIN principals p ON p.user_id=u.id AND p.status='ACTIVE' AND p.type='HUMAN'
        JOIN account_memberships m ON m.principal_id=p.id AND m.account_id=u.account_id AND m.status='ACTIVE' AND m.role='OWNER'
        WHERE u.id=$1 AND u.account_id=$2 AND u.role='OWNER' AND p.id=$3`,[r.operatorId,r.accountId,r.principalId])).rows;
      if (operators.length !== 1) deny("OPERATOR_AUTH_INVALID");
      const grants = (await c.query(`SELECT g.capability,g.effect,c.enabled,c.status FROM capability_grants g LEFT JOIN capabilities c ON c.name=g.capability
        WHERE g.account_id=$1 AND g.agent_id=$2 ORDER BY g.capability LIMIT 1001`,[r.accountId,r.agentId])).rows;
      const federationGrants = (await c.query(`SELECT id,account_id,grantee_account_id,capability,resource,document,status FROM federation_grants
        WHERE (account_id=$1 OR grantee_account_id=$1) AND (document->>'grantorAgentId'=$2 OR document->>'granteeAgentId'=$2) ORDER BY id LIMIT 1001`,[r.accountId,r.agentId])).rows;
      const delegations = (await c.query(`SELECT id,account_id,user_id,agent_id,grantee_account_id,grantee_agent_id,expires_at::text,revoked_at::text
        FROM federation_message_delegations WHERE (account_id=$1 AND agent_id=$2) OR (grantee_account_id=$1 AND grantee_agent_id=$2) ORDER BY id LIMIT 1001`,[r.accountId,r.agentId])).rows;
      if ([grants,federationGrants,delegations].some(rows => rows.length > 1000)) deny("SCOPE_TOO_LARGE");
      if (digest({registration: agents[0].registration,availability: agents[0].availability,grants,federationGrants,delegations}) !== r.scopeSha256) deny("LIVE_SCOPE_CHANGED");
      if (!ownerSession) return "ABSENT" as const;
      const cookie = /^(?:__Host-)?relay_session=([A-Za-z0-9_-]+)$/.exec(ownerSession);
      if (!cookie) return "INVALID" as const;
      const sessions = (await c.query(`SELECT u.id,t.revoked_at,t.expires_at>clock_timestamp() AS unexpired FROM user_sessions t JOIN users u ON u.id=t.user_id AND u.account_id=t.account_id
        WHERE t.token_hash=$1 AND u.id=$2 AND u.account_id=$3`,[hash(cookie[1]),r.operatorId,r.accountId])).rows;
      if (sessions.length !== 1 || sessions[0].revoked_at) return "INVALID" as const;
      return sessions[0].unexpired ? "VALID" as const : "EXPIRED" as const;
    });
    await readonly(audit.target.pool,async c => {
      const agents = (await c.query("SELECT id FROM agents WHERE id=$1 AND owner_id=$2 AND status='active'",[t.localAgentId,t.ownerId])).rows;
      const existing = (await c.query("SELECT 1 FROM myeve_relay_connections WHERE owner_id=$1",[t.ownerId])).rows;
      if (agents.length !== 1 || existing.length) deny("TARGET_UNAVAILABLE");
    });
    return { credentialStatus: "VALID" as const, ownerSessionStatus, ownerAuthentication: ownerSessionStatus === "VALID" ? "VALID" as const : "OWNER_AUTH_REQUIRED" as const,
      identity: { accountId: r.accountId, operatorId: r.operatorId, agentId: r.agentId, origin: r.origin },
      planSha256: audit.expectedPlanSha256, scopeSha256: r.scopeSha256, mutationPerformed: false as const, activationPerformed: false as const, scopeAuthorizationEstablished: false as const };
  } catch (error) {
    if (error instanceof Error && /^RELAY_REUSE_[A-Z_]+$/.test(error.message)) throw error;
    return deny("VALIDATION_FAILED");
  }
}
