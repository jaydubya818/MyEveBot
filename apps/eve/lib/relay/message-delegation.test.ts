import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RelayClient } from "./client.ts";
import { grantPeer, revokeGrant } from "./owner.ts";
import { encryptSecret } from "./transport.ts";
import type { FederationStore } from "./store.ts";

const ownerId = "local-owner";
const sourceAgentId = "agt_source";
const peerOwnerId = "acct_peer";
const peerAgentId = "agt_peer";
const address = `relay://acct_source/${sourceAgentId}`;
const expiresAt = new Date(Date.now() + 3600000).toISOString();
const grant = { grantorAgentId: sourceAgentId, granteeOwnerId: peerOwnerId, granteeAgentId: peerAgentId, capability: "message.send", resource: address, conditions: { expiresAt, rateLimit: { calls: 10, windowSeconds: 3600 }, allowedTopics: [], approvalRequired: false } };

beforeEach(() => {
  vi.stubEnv("MYEVE_RELAY_ENABLED", "true");
  vi.stubEnv("MYEVE_RELAY_ORIGIN", "https://relay.example.test");
  vi.stubEnv("MYEVE_RELAY_ENCRYPTION_KEY", "a".repeat(64));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

function fixture(saved = false) {
  const query = vi.fn(async (sql: string) => {
    if (sql.startsWith("SELECT credential_encrypted,expires_at FROM myeve_relay_message_delegations"))
      return saved ? [{ credential_encrypted: encryptSecret(ownerId, "scoped-bearer"), expires_at: new Date(Date.now() + 86400000).toISOString() }] : [];
    if (sql.startsWith("INSERT INTO myeve_relay_message_delegations") || sql.startsWith("INSERT INTO myeve_relay_grants") || sql.startsWith("UPDATE myeve_relay_grants")) return [];
    if (sql.startsWith("SELECT id,document FROM myeve_relay_grants")) return [{ id: "grant-one", document: grant }];
    throw new Error(`Unexpected query: ${sql}`);
  });
  const store = { ownerId, database: { query }, connection: async () => ({ ownerId: "acct_source", agentId: sourceAgentId, address, credential: "agent-bearer", ownerSession: "owner-cookie" }) } as unknown as FederationStore;
  const request = vi.spyOn(RelayClient.prototype, "request").mockResolvedValue({ delegationId: "delegation-one", credential: "scoped-bearer", expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() });
  const delegatedOwner = vi.spyOn(RelayClient.prototype, "delegatedOwner").mockResolvedValue({ grantId: "grant-one" });
  const owner = vi.spyOn(RelayClient.prototype, "owner").mockResolvedValue({ grantId: "grant-one" });
  return { store, query, request, delegatedOwner, owner };
}

it("mints one exact-peer message delegation and uses it for the grant", async () => {
  const x = fixture();
  await expect(grantPeer(x.store, grant)).resolves.toEqual({ grantId: "grant-one" });
  expect(x.request).toHaveBeenCalledWith("/api/v2/operator/message-delegations", { agentId: sourceAgentId, granteeOwnerId: peerOwnerId, granteeAgentId: peerAgentId }, true);
  expect(x.delegatedOwner).toHaveBeenCalledWith({ operation: "grant", input: grant });
  expect(x.owner).not.toHaveBeenCalled();
  expect(x.query.mock.calls.some(([sql]) => sql.startsWith("INSERT INTO myeve_relay_message_delegations"))).toBe(true);
});

it("keeps granting and revoking the exact peer after the owner cookie expires", async () => {
  const x = fixture(true);
  await grantPeer(x.store, grant);
  await revokeGrant(x.store, "grant-one");
  expect(x.request).not.toHaveBeenCalled();
  expect(x.delegatedOwner).toHaveBeenCalledWith({ operation: "grant", input: grant });
  expect(x.delegatedOwner).toHaveBeenCalledWith({ operation: "revoke-grant", id: "grant-one" });
  expect(x.owner).not.toHaveBeenCalled();
});

it("does not use a message delegation for Knowledge access", async () => {
  const x = fixture(true);
  await grantPeer(x.store, { ...grant, capability: "knowledge.query", resource: "private-record" });
  expect(x.request).not.toHaveBeenCalled();
  expect(x.delegatedOwner).not.toHaveBeenCalled();
  expect(x.owner).toHaveBeenCalledWith({ operation: "grant", input: { ...grant, capability: "knowledge.query", resource: "private-record" } });
});
