import { randomUUID } from "node:crypto";
import { z } from "zod";
import { capabilitySchema, type Capability, type Submission } from "./contracts.ts";
import { RelayClient, relayOrigin } from "./client.ts";
import { digest } from "./transport.ts";
import { FederationStore, type Connection } from "./store.ts";
import { effectiveCapability, getAgent } from "../agents.ts";

const reference = z.string().min(1).max(255).refine(value => !["*", "all-peers", "all-resources", "all-knowledge"].includes(value));
export const peerAddressSchema = z.string().max(520).regex(/^relay:\/\/[^/?#\s]+\/[^/?#\s]+$/);
export function peerIdentity(address: string) {
  const [accountId, agentId] = peerAddressSchema.parse(address).slice(8).split("/");
  return { accountId: accountId!, agentId: agentId! };
}
export const peerPolicySchema = z.object({
  capability: capabilitySchema,
  resource: reference,
  policy: z.enum(["DENY", "ALLOW", "REQUIRE_APPROVAL"]),
  recordTypes: z.array(reference).max(30).default([]),
  topics: z.array(z.string().min(1).max(100)).max(30).default([]),
}).strict().superRefine((policy, ctx) => {
  if (["message.send", "work.request", "artifact.share", "artifact.receive"].includes(policy.capability) && policy.policy === "ALLOW")
    ctx.addIssue({ code: "custom", message: "Consequential peer actions require exact approval." });
  if (policy.capability === "knowledge.query" && policy.policy !== "DENY" && !policy.recordTypes.length)
    ctx.addIssue({ code: "custom", message: "Select the published record types explicitly." });
  if (policy.capability !== "knowledge.query" && (policy.recordTypes.length || policy.topics.length))
    ctx.addIssue({ code: "custom", message: "Knowledge scope applies only to published reads." });
});
export type PeerPolicy = z.infer<typeof peerPolicySchema>;
export const permissionCommandSchema = z.object({
  permissionId: z.string().min(1).max(255).optional(),
  localAgentId: reference,
  peer: peerAddressSchema,
  displayName: z.string().min(1).max(100),
  policies: z.array(peerPolicySchema).max(50),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
  expectedRevision: z.number().int().nonnegative(),
  mutationId: z.string().uuid(),
  revoke: z.boolean().default(false),
}).strict().superRefine((input, ctx) => {
  const keys = input.policies.map(p => JSON.stringify([p.capability, p.resource]));
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", message: "Capability and resource scopes must be unique." });
});
export interface PeerPermission {
  id: string; owner_id: string; local_agent_id: string; relay_origin: string;
  local_relay_account_id: string; local_relay_agent_id: string;
  peer_account_id: string; peer_agent_id: string; display_name: string;
  policies: PeerPolicy[]; expires_at: string | null; revoked_at: string | null;
  revision: number; mutation_id: string; mutation_hash: string;
  created_at: string; updated_at: string;
}
export class PeerPermissionError extends Error {
  constructor(readonly code: string, message: string, readonly status = 403) { super(message); }
}
export async function listPeerPermissions(store: FederationStore, localAgentId?: string): Promise<PeerPermission[]> {
  return store.database.query(`SELECT * FROM myeve_peer_permissions WHERE owner_id=$1
    AND ($2::text IS NULL OR local_agent_id=$2) ORDER BY display_name,id LIMIT 100`, [store.ownerId, localAgentId ?? null]);
}

/** Owner API only. Saving desired policy never creates or renews Relay authority. */
export async function savePeerPermission(store: FederationStore, value: unknown) {
  const input = permissionCommandSchema.parse(value);
  if (!input.revoke && input.expiresAt && Date.parse(input.expiresAt) <= Date.now())
    throw new PeerPermissionError("INVALID_EXPIRY", "Choose a future expiration or Until revoked.", 400);
  const peer = peerIdentity(input.peer);
  // Read metadata only: offline revocation must not depend on decrypting a Relay session.
  const [existing] = input.permissionId ? await store.database.query("SELECT * FROM myeve_peer_permissions WHERE owner_id=$1 AND id=$2 AND local_agent_id=$3", [store.ownerId, input.permissionId, input.localAgentId]) : [];
  if (input.permissionId && (!existing || existing.peer_account_id !== peer.accountId || existing.peer_agent_id !== peer.agentId))
    throw new PeerPermissionError("PEER_PERMISSION_MISSING", "This peer relationship does not exist for this owner and Agent.", 404);
  const [connection] = await store.database.query(`SELECT c.relay_owner_id,c.relay_agent_id FROM myeve_relay_connections c JOIN agents a
    ON a.id=c.local_agent_id AND a.owner_id=c.owner_id WHERE c.owner_id=$1 AND c.local_agent_id=$2`, [store.ownerId, input.localAgentId]);
  if (!connection && !(input.revoke && existing)) throw new PeerPermissionError("PEER_CONNECTION_MISSING", "No Relay connection for this Agent.", 404);
  const origin = input.revoke && existing ? existing.relay_origin : relayOrigin();
  const account = input.revoke && existing ? existing.local_relay_account_id : connection.relay_owner_id;
  const relayAgent = input.revoke && existing ? existing.local_relay_agent_id : connection.relay_agent_id;
  if (existing && (existing.relay_origin !== origin || existing.local_relay_account_id !== account || existing.local_relay_agent_id !== relayAgent))
    throw new PeerPermissionError("PEER_CONNECTION_CHANGED", "The Relay identity changed. Establish a new explicit relationship.", 409);
  const policies = input.policies.slice().sort((a, b) => JSON.stringify([a.capability, a.resource]).localeCompare(JSON.stringify([b.capability, b.resource])));
  const hash = digest({ ...input, policies });
  const bindings = [store.ownerId, input.localAgentId, origin, account, relayAgent, peer.accountId, peer.agentId];
  const key = "owner_id=$1 AND local_agent_id=$2 AND relay_origin=$3 AND local_relay_account_id=$4 AND local_relay_agent_id=$5 AND peer_account_id=$6 AND peer_agent_id=$7";
  const [replay] = await store.database.query(`SELECT * FROM myeve_peer_permissions WHERE ${key} AND mutation_id=$8`, [...bindings, input.mutationId]);
  if (replay) {
    if (replay.mutation_hash !== hash) throw new PeerPermissionError("PERMISSION_CONFLICT", "This save changed. Reload permissions before retrying.", 409);
    return replay as PeerPermission;
  }
  const rows = await store.database.query(`WITH previous AS MATERIALIZED (
    SELECT * FROM myeve_peer_permissions WHERE ${key} FOR UPDATE
  ), changed AS (
    INSERT INTO myeve_peer_permissions(id,owner_id,local_agent_id,relay_origin,local_relay_account_id,local_relay_agent_id,peer_account_id,peer_agent_id,display_name,policies,expires_at,revoked_at,mutation_id,mutation_hash)
    SELECT $8,$1,$2,$3,$4,$5,$6,$7,$9,$10::jsonb,$11,CASE WHEN $12 THEN now() ELSE NULL END,$13,$14
    WHERE ($15=0 AND NOT $12) OR EXISTS(SELECT 1 FROM previous WHERE revision=$15)
    ON CONFLICT(owner_id,local_agent_id,relay_origin,local_relay_account_id,local_relay_agent_id,peer_account_id,peer_agent_id)
    DO UPDATE SET display_name=EXCLUDED.display_name,policies=EXCLUDED.policies,expires_at=EXCLUDED.expires_at,
      revoked_at=EXCLUDED.revoked_at,revision=myeve_peer_permissions.revision+1,mutation_id=EXCLUDED.mutation_id,
      mutation_hash=EXCLUDED.mutation_hash,updated_at=now() WHERE myeve_peer_permissions.revision=$15
    RETURNING *
  ), audited AS (
    INSERT INTO myeve_relay_activity(id,owner_id,request_id,kind,metadata)
    SELECT $16,$1,NULL,'peer-permission-changed',jsonb_build_object('actor',$1,'localAgentId',$2,'peer',$17::text,
      'previous',(SELECT jsonb_build_object('revision',revision,'policies',policies,'expiresAt',expires_at,'revokedAt',revoked_at) FROM previous),
      'current',jsonb_build_object('id',id,'revision',revision,'policies',policies,'expiresAt',expires_at,'revokedAt',revoked_at),'source','owner-api') FROM changed
    RETURNING id
  ) SELECT changed.* FROM changed JOIN audited ON true`, [...bindings, `peer_permission_${randomUUID()}`, input.displayName,
    JSON.stringify(policies), input.expiresAt, input.revoke, input.mutationId, hash, input.expectedRevision, `relay_event_${randomUUID()}`, input.peer]);
  if (!rows[0]) throw new PeerPermissionError("PERMISSION_CONFLICT", "Permissions changed in another session. Reload before saving.", 409);
  return rows[0] as PeerPermission;
}

export function evaluatePeerPermission(row: PeerPermission | undefined, binding: {
  ownerId: string; localAgentId: string; origin: string; localAccountId: string; localRelayAgentId: string;
  peer: string; capability: Capability; resource: string; revision?: number;
}, now = Date.now()) {
  const deny = (code: string) => ({ policy: "DENY" as const, code });
  const peer = peerIdentity(binding.peer);
  if (!row || row.owner_id !== binding.ownerId || row.local_agent_id !== binding.localAgentId || row.relay_origin !== binding.origin ||
    row.local_relay_account_id !== binding.localAccountId || row.local_relay_agent_id !== binding.localRelayAgentId ||
    row.peer_account_id !== peer.accountId || row.peer_agent_id !== peer.agentId) return deny("PEER_PERMISSION_MISSING");
  if (row.revoked_at) return deny("PEER_PERMISSION_REVOKED");
  if (row.expires_at && (!Number.isFinite(Date.parse(row.expires_at)) || Date.parse(row.expires_at) <= now)) return deny("PEER_PERMISSION_EXPIRED");
  if (binding.revision !== undefined && row.revision !== binding.revision) return deny("PEER_PERMISSION_CHANGED");
  const parsed = z.array(peerPolicySchema).safeParse(row.policies);
  if (!parsed.success) return deny("PEER_PERMISSION_INVALID");
  const matches = parsed.data.filter(p => p.capability === binding.capability && p.resource === binding.resource);
  const policy = matches.length === 1 ? matches[0] : undefined;
  if (!policy || policy.policy === "DENY") return deny("PEER_PERMISSION_DENIED");
  return { policy: policy.policy, code: "PEER_PERMISSION_ACTIVE", scope: policy };
}
export async function currentPeerPermission(store: FederationStore, connection: Connection, peer: string, capability: Capability, resource: string, revision?: number) {
  const identity = peerIdentity(peer);
  const [row] = await store.database.query(`SELECT * FROM myeve_peer_permissions WHERE owner_id=$1 AND local_agent_id=$2
    AND relay_origin=$3 AND local_relay_account_id=$4 AND local_relay_agent_id=$5 AND peer_account_id=$6 AND peer_agent_id=$7`,
  [store.ownerId, connection.localAgentId, relayOrigin(), connection.ownerId, connection.agentId, identity.accountId, identity.agentId]);
  const agent = await getAgent(store.ownerId, connection.localAgentId, store.database);
  const decision = !agent || agent.status !== "active" || !effectiveCapability(agent, "federation.request").allowed
    ? { policy: "DENY" as const, code: "PEER_LOCAL_AUTHORITY_DENIED" }
    : evaluatePeerPermission(row, { ownerId: store.ownerId, localAgentId: connection.localAgentId, origin: relayOrigin(),
    localAccountId: connection.ownerId, localRelayAgentId: connection.agentId, peer, capability, resource, revision });
  return { ...decision, row: row as PeerPermission | undefined };
}
export const inspectionSchema = z.object({
  authorized: z.boolean(), status: z.enum(["ACTIVE", "MISSING", "EXPIRED", "REVOKED", "NOT_YET_ACTIVE", "PEER_UNAVAILABLE", "RESOURCE_NOT_AUTHORIZED", "CAPABILITY_NOT_AUTHORIZED", "DENIED"]),
  expiresAt: z.string().datetime({ offset: true }).nullable(), approvalRequired: z.boolean(), observedAt: z.string().datetime({ offset: true }), executionRecheckRequired: z.literal(true),
}).strict();
export async function inspectPeerAuthority(connection: Connection, request: Submission) {
  try {
    const result = inspectionSchema.parse(await new RelayClient(connection.credential).command({ operation: "authority.inspect", input: request }));
    if (result.authorized !== (result.status === "ACTIVE")) throw new Error("Inconsistent inspection.");
    return result;
  } catch { return { authorized: false as const, status: "UNAVAILABLE" as const, expiresAt: null, approvalRequired: false }; }
}
export async function effectivePeerPermission(store: FederationStore, connection: Connection, request: Submission, revision?: number) {
  const local = await currentPeerPermission(store, connection, request.target, request.capability, request.resource, revision);
  if (local.policy === "DENY") return { ...local, relay: null, effective: "DENY" as const, reason: local.code };
  if (request.capability === "knowledge.query" && (!local.scope || request.payload.requestedTypes.some(t => !local.scope!.recordTypes.includes(t)) ||
    (local.scope.topics.length && (!request.payload.topics.length || request.payload.topics.some(t => !local.scope!.topics.includes(t))))))
    return { ...local, relay: null, effective: "DENY" as const, reason: "PEER_RESOURCE_SCOPE_DENIED" };
  const relay = await inspectPeerAuthority(connection, request);
  return { ...local, relay, effective: relay.authorized ? (request.capability !== "knowledge.query" || local.policy === "REQUIRE_APPROVAL" || relay.approvalRequired ? "REQUIRE_APPROVAL" as const : "ALLOW" as const) : "DENY" as const,
    reason: relay.authorized ? "PEER_PERMISSION_ACTIVE" : `RELAY_${relay.status === "UNAVAILABLE" ? "UNAVAILABLE" : `GRANT_${relay.status}`}` };
}
export function requireEffectivePermission(result: Awaited<ReturnType<typeof effectivePeerPermission>>) {
  const reasons: Record<string, string> = {
    PEER_PERMISSION_MISSING: "No MyEve permission exists for this exact Agent and peer.",
    PEER_PERMISSION_EXPIRED: "The MyEve peer permission has expired.",
    PEER_PERMISSION_REVOKED: "The MyEve peer permission was revoked.",
    PEER_PERMISSION_CHANGED: "The peer permission changed after this Action was proposed.",
    PEER_PERMISSION_DENIED: "MyEve policy does not allow this capability and resource.",
    RELAY_GRANT_EXPIRED: "MyEve policy permits this request, but Relay authorization has expired.",
    RELAY_GRANT_REVOKED: "MyEve policy permits this request, but Relay authorization was revoked.",
    RELAY_GRANT_MISSING: "MyEve policy permits this request, but the required Relay authorization is missing.",
    RELAY_UNAVAILABLE: "Relay is unavailable, so current authority cannot be verified.",
  };
  if (result.effective === "DENY") throw new PeerPermissionError(result.reason,
    `${reasons[result.reason] ?? "Current authority does not allow this exact request."} Nothing was sent. Review Manage → Relay → Peer permissions.`);
  return result;
}
export async function bindPeerAction(store: FederationStore, runId: string, actionKey: string, permission: PeerPermission, request: Submission) {
  const hash = digest(request);
  await store.database.query(`INSERT INTO myeve_peer_action_bindings(owner_id,run_id,action_key,permission_id,permission_revision,request_hash)
    SELECT $1,$2,$3,p.id,p.revision,$6 FROM myeve_peer_permissions p JOIN task_runs r ON r.owner_id=p.owner_id AND r.agent_id=p.local_agent_id
    WHERE p.owner_id=$1 AND p.id=$4 AND p.revision=$5 AND r.id=$2 AND p.revoked_at IS NULL AND (p.expires_at IS NULL OR p.expires_at>now())
    ON CONFLICT DO NOTHING`, [store.ownerId, runId, actionKey, permission.id, permission.revision, hash]);
  const [bound] = await store.database.query("SELECT * FROM myeve_peer_action_bindings WHERE owner_id=$1 AND run_id=$2 AND action_key=$3", [store.ownerId, runId, actionKey]);
  if (!bound || bound.permission_id !== permission.id || bound.permission_revision !== permission.revision || bound.request_hash !== hash)
    throw new PeerPermissionError("PEER_PERMISSION_CHANGED", "This Action belongs to an older or changed peer permission. Propose a new Action; nothing was sent.");
}

export async function peerReadModel(store: FederationStore, localAgentId?: string, selectedId?: string) {
  const rows = await listPeerPermissions(store, localAgentId);
  let connection: Connection | undefined;
  try { const connected = await store.connection(); relayOrigin(); connection = connected; } catch { /* Desired policy remains inspectable offline. */ }
  let inspections = 0;
  const relationships = [];
  for (const row of rows) {
    const peer = `relay://${row.peer_account_id}/${row.peer_agent_id}`;
    const capabilities = [];
    for (const scope of row.policies) {
      const local = connection ? evaluatePeerPermission(row, { ownerId: store.ownerId, localAgentId: connection.localAgentId,
        origin: relayOrigin(), localAccountId: connection.ownerId, localRelayAgentId: connection.agentId, peer,
        capability: scope.capability, resource: scope.resource }) : { policy: "DENY" as const, code: "RELAY_UNAVAILABLE" };
      let relayStatus = "NOT_INSPECTED", relayExpiresAt: string | null = null, effective: string = "DENY", reason = local.code;
      if (local.policy !== "DENY" && connection && (!selectedId || row.id === selectedId) && inspections < 20) {
        const base = { target: peer, resource: scope.resource, idempotencyKey: `inspection-${randomUUID()}`, expiresAt: new Date(Date.now() + 60_000).toISOString() };
        const request: Submission | undefined = scope.capability === "message.send" ? { ...base, capability: "message.send", payload: { body: "Permission status inspection only" } }
          : scope.capability === "knowledge.query" ? { ...base, capability: "knowledge.query", payload: { mode: "RECORD_RETRIEVAL", query: "Permission status inspection only", requestedTypes: scope.recordTypes, topics: scope.topics, maxRecords: 1 } } : undefined;
        if (request) {
          inspections++;
          const result = await effectivePeerPermission(store, connection, request);
          effective = result.effective; reason = result.reason;
          relayStatus = result.relay?.status ?? "NOT_INSPECTED"; relayExpiresAt = result.relay?.expiresAt ?? null;
        } else { relayStatus = "EXACT_REQUEST_REQUIRED"; reason = "Current Relay authority is checked for the exact incoming or proposed request."; }
      }
      capabilities.push({ ...scope, effective, relayStatus, relayExpiresAt, reason });
    }
    const status = row.revoked_at ? "REVOKED" : row.expires_at && Date.parse(row.expires_at) <= Date.now() ? "EXPIRED"
      : capabilities.some(p => p.effective !== "DENY") ? (capabilities.some(p => p.policy !== "DENY" && p.effective === "DENY") ? "PARTIALLY_AVAILABLE" : "ACTIVE")
      : connection ? "RELAY_AUTH_REQUIRED" : "RELAY_UNAVAILABLE";
    relationships.push({ id: row.id, localAgentId: row.local_agent_id, peer, displayName: row.display_name, revision: row.revision,
      policies: capabilities, expiresAt: row.expires_at, revokedAt: row.revoked_at, updatedAt: row.updated_at, status });
  }
  return { relationships, managePath: "/manage/relay", navigation: "Manage → Relay → Peer permissions", privateKnowledge: "DENY",
    note: "Relay observations do not grant authority. Every execution rechecks current policy and Relay authority. Exact consequential actions always require approval." };
}
