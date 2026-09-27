// Only authenticated owner routes import this module. It is never a dependency
// of projection.ts, which cannot reach canonical Knowledge or owner credentials.
import { randomUUID, createPublicKey } from "node:crypto";
import { z } from "zod";
import { getAgent } from "../agents.ts";
import { getKnowledge } from "../knowledge.ts";
import {
  capabilitySchema,
  grantSchema,
  viewSchema,
  recordSchema,
} from "./contracts.ts";
import { connectRelayOwner, RelayClient, RelayOperationError, relayOrigin } from "./client.ts";
import { FederationStore } from "./store.ts";
import { decryptSecret, digest, encryptSecret } from "./transport.ts";

const selectionSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    references: z.array(z.string().max(255)).min(1).max(50),
    visibility: z
      .enum(["PRIVATE", "SHARED", "UNLISTED", "PUBLIC"])
      .default("PRIVATE"),
    audience: z
      .array(
        z
          .object({
            ownerId: z.string().min(1),
            agentId: z.string().optional(),
          })
          .strict(),
      )
      .max(100),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();
export async function connectOwner(store: FederationStore, value: unknown) {
  const input = z
    .object({
      email: z.string().email(),
      password: z.string().min(1).max(1000),
      localAgentId: z.string(),
      relayAgentId: z.string().optional(),
    })
    .strict()
    .parse(value);
  const local = await getAgent(store.ownerId, input.localAgentId);
  if (!local || local.status !== "active")
    throw new Error("Select your active MyEve Agent.");
  const [existing] = await store.database.query(
    "SELECT relay_agent_id,relay_owner_id,local_agent_id FROM myeve_relay_connections WHERE owner_id=$1",
    [store.ownerId],
  );
  if (
    existing &&
    input.relayAgentId &&
    input.relayAgentId !== existing.relay_agent_id
  )
    throw new Error(
      "Reconnect the existing Relay Agent; replacement needs a separate identity migration.",
    );
  if (existing && existing.local_agent_id !== local.id)
    throw new Error("Reconnect the same local Agent.");
  const publicKey = process.env.MYEVE_RELAY_PUBLIC_KEY;
  const keyId = process.env.MYEVE_RELAY_KEY_ID;
  if (
    !publicKey ||
    !keyId ||
    createPublicKey(publicKey).asymmetricKeyType !== "ed25519"
  )
    throw new Error("A pinned Relay signing key is required.");
  const owner = await connectRelayOwner(input.email, input.password);
  if (existing && existing.relay_owner_id !== owner.relayOwnerId)
    throw new Error("Reconnect the same Relay owner.");
  const ownerClient = new RelayClient("", owner.ownerSession);
  const selectedId = existing?.relay_agent_id ?? input.relayAgentId;
  let agentId: string;
  let credential: string;
  if (selectedId) {
    // Relay checks owner access when rotating; no caller-supplied owner identity.
    const rotated = await ownerClient.request(
      `/api/agents/${encodeURIComponent(selectedId)}/credentials`,
      {},
      true,
    );
    agentId = selectedId;
    credential = rotated.credential;
  } else {
    const created = await ownerClient.request(
      "/api/agents",
      {
        name: local.name,
        description: "MyEve personal Agent",
        capabilities: [],
      },
      true,
    );
    agentId = created.agentId;
    credential = created.credential;
  }
  const registered = await ownerClient.owner({
    operation: "register",
    input: {
      agentId,
      platform: "myeve",
      capabilities: capabilitySchema.options.map((name) => ({
        name,
        version: "1.0",
      })),
      discovery: "HIDDEN",
      publicName: local.name,
      primary: local.isPrimary,
    },
  });
  if (
    registered.ownerId !== owner.relayOwnerId ||
    registered.agentId !== agentId ||
    registered.address !== `relay://${owner.relayOwnerId}/${agentId}`
  )
    throw new Error("Relay registration identity mismatch.");
  await store.database.query(
    `INSERT INTO myeve_relay_connections(owner_id,local_agent_id,relay_owner_id,relay_agent_id,address,issuer,signing_key_id,signing_public_key,agent_credential_encrypted,owner_session_encrypted)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(owner_id) DO UPDATE SET agent_credential_encrypted=EXCLUDED.agent_credential_encrypted,owner_session_encrypted=EXCLUDED.owner_session_encrypted,status='active',updated_at=now()
    WHERE myeve_relay_connections.relay_owner_id=EXCLUDED.relay_owner_id AND myeve_relay_connections.relay_agent_id=EXCLUDED.relay_agent_id AND myeve_relay_connections.local_agent_id=EXCLUDED.local_agent_id`,
    [
      store.ownerId,
      local.id,
      owner.relayOwnerId,
      agentId,
      registered.address,
      relayOrigin(),
      keyId,
      publicKey,
      encryptSecret(store.ownerId, credential),
      encryptSecret(store.ownerId, owner.ownerSession),
    ],
  );
  await ownerClient.owner({
    operation: "availability",
    id: agentId,
    input: "ONLINE",
  });
  await store.activity("connected", null, {
    address: registered.address,
    localAgentId: local.id,
  });
  return { address: registered.address, agentId, localAgentId: local.id };
}

export async function previewPublication(
  store: FederationStore,
  value: unknown,
) {
  const input = selectionSchema.parse(value);
  const connection = await store.connection();
  if (
    Date.parse(input.expiresAt) <= Date.now() ||
    Date.parse(input.expiresAt) > Date.now() + 30 * 86400000
  )
    throw new Error("Choose a publication expiry within 30 days.");
  if (new Set(input.references).size !== input.references.length)
    throw new Error("Duplicate Knowledge selection.");
  if (
    input.visibility !== "PRIVATE" &&
    input.visibility !== "PUBLIC" &&
    !input.audience.length
  )
    throw new Error("Select an allowed audience.");
  const records = [];
  for (const reference of input.references) {
    const record = await getKnowledge(store.ownerId, reference);
    if (
      !record ||
      record.supersededById ||
      ["archived", "retracted", "superseded", "invalidated"].includes(
        record.status,
      )
    )
      throw new Error(
        "A selected Knowledge record is unavailable; refresh the preview.",
      );
    // External provenance is a bounded reference, never a private source URI,
    // source snapshot, conversation, Goal, or the record's internal rationale.
    records.push(
      recordSchema.parse({
        reference: record.id,
        revision: digest({
          statement: record.statement,
          kind: record.kind,
          updatedAt: record.updatedAt,
        }),
        recordType: record.kind,
        content: record.statement,
        sourceReferences: [`myeve-knowledge:${record.id}`],
        provenance: "Explicit owner publication of a MyEve Knowledge record",
        updatedAt: record.updatedAt,
        confidence: record.confidence,
      }),
    );
  }
  if (Buffer.byteLength(JSON.stringify(records)) > 100 * 1024)
    throw new Error(
      "Select a smaller publication; the response must fit Relay’s bounded delivery.",
    );
  const id = `myeve_view_${randomUUID()}`;
  const document = viewSchema.parse({
    id,
    publisherAgentId: connection.agentId,
    name: input.name,
    description: "Explicit owner-selected MyEve Knowledge",
    topics: [],
    recordTypes: [...new Set(records.map((r) => r.recordType))],
    visibility: input.visibility,
    allowedAudience: input.audience,
    mode: "SNAPSHOT",
    entries: records.map((r) => ({
      reference: r.reference,
      revision: r.revision,
      recordType: r.recordType,
      eligibility: "OWNER_SELECTED",
      topics: [],
    })),
    provenancePolicy: "SOURCE_REFERENCES_REQUIRED",
    expiresAt: input.expiresAt,
    expectedVersion: 0,
  });
  const previewHash = digest({ document, records });
  const previewExpiresAt = new Date(Date.now() + 600000).toISOString();
  await store.database.query(
    `INSERT INTO myeve_relay_publications(id,owner_id,relay_view_id,name,visibility,audience,preview_hash,preview_expires_at,expires_at,document)
    VALUES($1,$2,$1,$3,$4,$5::jsonb,$6,$7,$8,$9::jsonb)`,
    [
      id,
      store.ownerId,
      input.name,
      input.visibility,
      JSON.stringify(input.audience),
      previewHash,
      previewExpiresAt,
      input.expiresAt,
      JSON.stringify(document),
    ],
  );
  for (const record of records)
    await store.database.query(
      "INSERT INTO myeve_relay_projection(owner_id,publication_id,reference,revision,record) VALUES($1,$2,$3,$4,$5::jsonb)",
      [
        store.ownerId,
        id,
        record.reference,
        record.revision,
        JSON.stringify(record),
      ],
    );
  return {
    id,
    name: input.name,
    audience: input.audience,
    expiresAt: input.expiresAt,
    previewHash,
    previewExpiresAt,
    visibility: input.visibility,
    records,
    count: records.length,
    excluded: [
      "Private Memory",
      "Conversations",
      "Goals",
      "Private source content",
      "Workspace",
      "Unselected Knowledge",
    ],
  };
}

export async function confirmPublication(
  store: FederationStore,
  id: string,
  previewHash: string,
) {
  const connection = await store.connection();
  const [publication] = await store.database.query(
    "SELECT * FROM myeve_relay_publications WHERE owner_id=$1 AND id=$2 AND status='draft' AND preview_hash=$3 AND preview_expires_at>now()",
    [store.ownerId, id, previewHash],
  );
  if (!publication)
    throw new Error(
      "Preview expired or changed. Preview again before publishing.",
    );
  const rows = await store.database.query(
    "SELECT record FROM myeve_relay_projection WHERE owner_id=$1 AND publication_id=$2 ORDER BY reference",
    [store.ownerId, id],
  );
  for (const { record } of rows) {
    const current = await getKnowledge(store.ownerId, record.reference);
    if (
      !current ||
      current.supersededById ||
      digest({
        statement: current.statement,
        kind: current.kind,
        updatedAt: current.updatedAt,
      }) !== record.revision
    )
      throw new Error("Selected Knowledge changed. Preview again.");
  }
  const claimed = await store.database.query(
    "UPDATE myeve_relay_publications SET status='sync_required' WHERE owner_id=$1 AND id=$2 AND status='draft' AND preview_hash=$3 RETURNING id",
    [store.ownerId, id, previewHash],
  );
  if (!claimed.length) throw new Error("Publication was already submitted.");
  const result = await new RelayClient(
    connection.credential,
    connection.ownerSession,
  ).owner({ operation: "publish", input: publication.document });
  if (result.viewId !== id || result.version !== 1)
    throw new Error("Unexpected Relay publication version.");
  const activated = await store.database.query(
    "UPDATE myeve_relay_publications SET status='active',version=$3,updated_at=now() WHERE owner_id=$1 AND id=$2 AND status='sync_required' RETURNING id",
    [store.ownerId, id, result.version],
  );
  if (!activated.length)
    throw new Error(
      "Publication changed while publishing; local access remains disabled.",
    );
  await store.activity("publication-confirmed", null, {
    viewId: id,
    version: result.version,
    count: rows.length,
    visibility: publication.visibility,
  });
  return result;
}

export async function publicationStatus(
  store: FederationStore,
  id: string,
  status: "PAUSED" | "REVOKED",
) {
  const connection = await store.connection();
  const rows = await store.database.query(
    "UPDATE myeve_relay_publications SET status=$3,updated_at=now() WHERE owner_id=$1 AND id=$2 AND status<>'revoked' RETURNING relay_view_id",
    [store.ownerId, id, status.toLowerCase()],
  );
  if (!rows[0]) throw new Error("Publication not found or already revoked.");
  // Local retrieval is disabled before the remote operation; failures stay closed.
  await new RelayClient(connection.credential, connection.ownerSession).owner({
    operation: "publication-status",
    id: rows[0].relay_view_id,
    input: status,
  });
  await store.activity("publication-status", null, { viewId: id, status });
}
export async function grantPeer(store: FederationStore, value: unknown) {
  const connection = await store.connection();
  const grant = grantSchema.parse(value);
  if (grant.grantorAgentId !== connection.agentId)
    throw new Error("Grant must be scoped to your connected Agent.");
  const delegation = await messageDelegation(store, connection, grant);
  const result = delegation
    ? await new RelayClient(delegation).delegatedOwner({ operation: "grant", input: grant })
    : await new RelayClient(connection.credential, connection.ownerSession).owner({ operation: "grant", input: grant });
  await store.database.query(
    "INSERT INTO myeve_relay_grants(id,owner_id,document) VALUES($1,$2,$3::jsonb)",
    [result.grantId, store.ownerId, JSON.stringify(grant)],
  );
  return result;
}
export async function revokeGrant(store: FederationStore, id: string) {
  const connection = await store.connection();
  const [grant] = await store.database.query(
    "SELECT id,document FROM myeve_relay_grants WHERE owner_id=$1 AND id=$2",
    [store.ownerId, id],
  );
  if (!grant) throw new Error("Grant not found.");
  const delegation = await savedMessageDelegation(store, connection, grantSchema.parse(grant.document));
  if (delegation)
    await new RelayClient(delegation).delegatedOwner({ operation: "revoke-grant", id });
  else
    await new RelayClient(connection.credential, connection.ownerSession).owner({ operation: "revoke-grant", id });
  await store.database.query(
    "UPDATE myeve_relay_grants SET status='revoked' WHERE owner_id=$1 AND id=$2",
    [store.ownerId, id],
  );
}

async function savedMessageDelegation(store: FederationStore, connection: Awaited<ReturnType<FederationStore["connection"]>>, grant: z.infer<typeof grantSchema>) {
  if (grant.capability !== "message.send" || !grant.granteeAgentId || !grant.conditions.expiresAt ||
      grant.resource !== connection.address || grant.grantorAgentId !== connection.agentId ||
      grant.conditions.rateLimit.calls > 20 || grant.conditions.rateLimit.windowSeconds < 3600) return null;
  const [row] = await store.database.query(
    "SELECT credential_encrypted,expires_at FROM myeve_relay_message_delegations WHERE owner_id=$1 AND agent_id=$2 AND grantee_owner_id=$3 AND grantee_agent_id=$4 AND expires_at>now()",
    [store.ownerId, connection.agentId, grant.granteeOwnerId, grant.granteeAgentId],
  );
  if (!row || Date.parse(String(row.expires_at)) < Date.parse(grant.conditions.expiresAt)) return null;
  return decryptSecret<string>(store.ownerId, row.credential_encrypted);
}

async function messageDelegation(store: FederationStore, connection: Awaited<ReturnType<FederationStore["connection"]>>, grant: z.infer<typeof grantSchema>) {
  if (grant.capability !== "message.send" || !grant.granteeAgentId || !grant.conditions.expiresAt ||
      grant.resource !== connection.address || grant.grantorAgentId !== connection.agentId ||
      grant.conditions.rateLimit.calls > 20 || grant.conditions.rateLimit.windowSeconds < 3600) return null;
  const saved = await savedMessageDelegation(store, connection, grant);
  if (saved) return saved;
  const issued = z.object({ delegationId: z.string(), credential: z.string(), expiresAt: z.string().datetime({ offset: true }) }).parse(
    await new RelayClient("", connection.ownerSession).request(
      "/api/v2/operator/message-delegations",
      { agentId: connection.agentId, granteeOwnerId: grant.granteeOwnerId, granteeAgentId: grant.granteeAgentId },
      true,
    ),
  );
  if (Date.parse(grant.conditions.expiresAt) > Date.parse(issued.expiresAt))
    throw new Error("Choose a message grant expiry within seven days and retry.");
  await store.database.query(
    `INSERT INTO myeve_relay_message_delegations(owner_id,agent_id,grantee_owner_id,grantee_agent_id,relay_delegation_id,credential_encrypted,expires_at)
     VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(owner_id,agent_id,grantee_owner_id,grantee_agent_id)
     DO UPDATE SET relay_delegation_id=EXCLUDED.relay_delegation_id,credential_encrypted=EXCLUDED.credential_encrypted,expires_at=EXCLUDED.expires_at`,
    [store.ownerId, connection.agentId, grant.granteeOwnerId, grant.granteeAgentId, issued.delegationId, encryptSecret(store.ownerId, issued.credential), issued.expiresAt],
  );
  return issued.credential;
}
export async function rotateOrRevoke(store: FederationStore, revoke = false) {
  const connection = await store.connection();
  const client = new RelayClient(
    connection.credential,
    connection.ownerSession,
  );
  if (revoke) {
    await store.database.query(
      "UPDATE myeve_relay_connections SET status='paused' WHERE owner_id=$1",
      [store.ownerId],
    );
    await revokeSavedDelegations(store);
    await client.request(
      `/api/agents/${encodeURIComponent(connection.agentId)}/credentials`,
      {},
      true,
      "DELETE",
    );
    await store.database.query(
      "UPDATE myeve_relay_connections SET status='revoked',agent_credential_encrypted='',owner_session_encrypted='' WHERE owner_id=$1",
      [store.ownerId],
    );
  } else {
    const result = await client.request(
      `/api/agents/${encodeURIComponent(connection.agentId)}/credentials`,
      {},
      true,
    );
    await store.database.query(
      "UPDATE myeve_relay_connections SET agent_credential_encrypted=$2,updated_at=now() WHERE owner_id=$1",
      [store.ownerId, encryptSecret(store.ownerId, result.credential)],
    );
  }
  await store.activity(
    revoke ? "credential-revoked" : "credential-rotated",
    null,
    { address: connection.address },
  );
  return { address: connection.address };
}

/** Fence local access first, then retire the exact Relay identity for owner-authorized deletion. */
export async function retireOwnerConnection(store: FederationStore) {
  const [row] = await store.database.query(
    "SELECT relay_owner_id,relay_agent_id,address,status,owner_session_encrypted FROM myeve_relay_connections WHERE owner_id=$1",
    [store.ownerId],
  );
  if (!row) return { connected: false, retired: true };
  if (row.status === "revoked") return { connected: true, retired: true, address: row.address };
  if (row.status !== "active" && row.status !== "paused") throw new Error("Relay connection is not in a retireable state.");
  await store.database.query(
    "UPDATE myeve_relay_connections SET status='paused',updated_at=now() WHERE owner_id=$1 AND status='active'",
    [store.ownerId],
  );
  const client = new RelayClient("", decryptSecret(store.ownerId, row.owner_session_encrypted));
  const grants = await store.database.query(
    "SELECT id FROM myeve_relay_grants WHERE owner_id=$1 AND status<>'revoked' ORDER BY id",
    [store.ownerId],
  );
  for (const grant of grants) {
    await client.owner({ operation: "revoke-grant", id: grant.id });
    await store.database.query(
      "UPDATE myeve_relay_grants SET status='revoked' WHERE owner_id=$1 AND id=$2",
      [store.ownerId, grant.id],
    );
  }
  await revokeSavedDelegations(store);
  await client.request(`/api/agents/${encodeURIComponent(row.relay_agent_id)}`,
    { status: "DISABLED" }, true, "PATCH");
  await client.request(`/api/agents/${encodeURIComponent(row.relay_agent_id)}/credentials`,
    {}, true, "DELETE");
  await store.database.query(
    "UPDATE myeve_relay_connections SET status='revoked',agent_credential_encrypted='',owner_session_encrypted='',updated_at=now() WHERE owner_id=$1 AND relay_owner_id=$2 AND relay_agent_id=$3",
    [store.ownerId, row.relay_owner_id, row.relay_agent_id],
  );
  await store.activity("agent-retired", null, { address: row.address });
  return { connected: true, retired: true, address: row.address };
}

async function revokeSavedDelegations(store: FederationStore) {
  const rows = await store.database.query(
    "SELECT credential_encrypted,expires_at FROM myeve_relay_message_delegations WHERE owner_id=$1",
    [store.ownerId],
  );
  for (const row of rows) {
    if (Date.parse(String(row.expires_at)) > Date.now()) {
      try {
        await new RelayClient(decryptSecret<string>(store.ownerId, row.credential_encrypted)).revokeDelegation();
      } catch (error) {
        // Relay's 401 means the credential is already expired or revoked.
        if (!(error instanceof RelayOperationError && error.status === 401)) throw error;
      }
    }
  }
  await store.database.query("DELETE FROM myeve_relay_message_delegations WHERE owner_id=$1", [store.ownerId]);
}
