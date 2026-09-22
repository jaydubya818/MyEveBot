import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluatePeerPermission, inspectionSchema, inspectPeerAuthority, permissionCommandSchema, peerPolicySchema, type PeerPermission } from "./peer-permissions.ts";
import { RelayClient } from "./client.ts";
import type { Connection } from "./store.ts";
import type { Submission } from "./contracts.ts";

const binding = { ownerId: "owner", localAgentId: "sofie", origin: "https://relay.example", localAccountId: "account",
  localRelayAgentId: "agent", peer: "relay://atlas/research", capability: "message.send" as const, resource: "relay://atlas/research" };
const row = (): PeerPermission => ({ id: "permission", owner_id: binding.ownerId, local_agent_id: binding.localAgentId,
  relay_origin: binding.origin, local_relay_account_id: binding.localAccountId, local_relay_agent_id: binding.localRelayAgentId,
  peer_account_id: "atlas", peer_agent_id: "research", display_name: "Atlas", policies: [{ capability: "message.send", resource: binding.resource,
    policy: "REQUIRE_APPROVAL", recordTypes: [], topics: [] }], expires_at: null, revoked_at: null, revision: 1,
  mutation_id: "test", mutation_hash: "test", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("durable peer policy identity and scope", () => {
  it("until revoked retains the exact Action approval floor", () => {
    expect(evaluatePeerPermission(row(), binding)).toMatchObject({ policy: "REQUIRE_APPROVAL" });
  });
  it.each(["ownerId", "localAgentId", "origin", "localAccountId", "localRelayAgentId", "peer", "resource", "capability"])("does not inherit across %s", key => {
    const changed = { ...binding, [key]: key === "peer" ? "relay://atlas/spoof" : "different" };
    expect(evaluatePeerPermission(row(), changed as typeof binding).policy).toBe("DENY");
  });
  it("does not bind display names", () => {
    const original = row(); original.display_name = "Different name";
    expect(evaluatePeerPermission(original, binding).policy).toBe("REQUIRE_APPROVAL");
  });
  it("distinguishes revoked, expired, changed and missing", () => {
    expect(evaluatePeerPermission(undefined, binding).code).toBe("PEER_PERMISSION_MISSING");
    expect(evaluatePeerPermission({ ...row(), revoked_at: "2026-01-01T00:00:00Z" }, binding).code).toBe("PEER_PERMISSION_REVOKED");
    expect(evaluatePeerPermission({ ...row(), expires_at: "2026-01-01T00:00:00Z" }, binding, Date.parse("2026-01-01T00:00:00Z")).code).toBe("PEER_PERMISSION_EXPIRED");
    expect(evaluatePeerPermission(row(), { ...binding, revision: 2 }).code).toBe("PEER_PERMISSION_CHANGED");
  });
  it("fails closed on corrupt timestamps, invalid policies and duplicate scopes", () => {
    expect(evaluatePeerPermission({ ...row(), expires_at: "invalid" }, binding).policy).toBe("DENY");
    const invalid = row(); invalid.policies[0].policy = "ALLOW";
    expect(evaluatePeerPermission(invalid, binding).policy).toBe("DENY");
    const duplicate = row(); duplicate.policies.push(duplicate.policies[0]);
    expect(evaluatePeerPermission(duplicate, binding).policy).toBe("DENY");
  });
  it.each(["message.send", "work.request", "artifact.share", "artifact.receive"])("forbids unconditional %s", capability => {
    expect(peerPolicySchema.safeParse({ capability, resource: "exact", policy: "ALLOW" }).success).toBe(false);
  });
  it("requires explicit published types and rejects blanket scopes", () => {
    expect(peerPolicySchema.safeParse({ capability: "knowledge.query", resource: "view", policy: "ALLOW" }).success).toBe(false);
    for (const resource of ["*", "all-resources", "all-knowledge", "all-peers"]) expect(peerPolicySchema.safeParse({ capability: "message.receive", resource, policy: "ALLOW" }).success).toBe(false);
  });
  it("rejects authority extension fields and duplicate scope commands", () => {
    const command = { localAgentId: "sofie", peer: binding.peer, displayName: "Atlas", policies: row().policies,
      expiresAt: null, expectedRevision: 1, mutationId: "96799d45-a81d-4f7e-a144-dee2185b36ee" };
    expect(permissionCommandSchema.safeParse(command).success).toBe(true);
    expect(permissionCommandSchema.safeParse({ ...command, trustAll: true }).success).toBe(false);
    expect(permissionCommandSchema.safeParse({ ...command, policies: [...command.policies, ...command.policies] }).success).toBe(false);
  });
});

describe("Relay observations confer no executable authority", () => {
  const request: Submission = { target: binding.peer, resource: binding.resource, capability: "message.send", idempotencyKey: "inspection",
    expiresAt: "2099-01-01T00:00:00Z", payload: { body: "Exact message" } };
  const connection = { credential: "private-test-credential" } as Connection;
  const observation = (status: string) => ({ authorized: status === "ACTIVE", status, expiresAt: "2099-01-01T00:00:00Z",
    approvalRequired: true, observedAt: new Date().toISOString(), executionRecheckRequired: true });
  it.each(["ACTIVE", "MISSING", "EXPIRED", "REVOKED", "RESOURCE_NOT_AUTHORIZED", "CAPABILITY_NOT_AUTHORIZED"])("preserves safe %s state using only inspection", async status => {
    vi.stubEnv("MYEVE_RELAY_ENABLED", "true"); vi.stubEnv("MYEVE_RELAY_ORIGIN", binding.origin);
    const command = vi.spyOn(RelayClient.prototype, "command").mockResolvedValue(observation(status));
    expect(await inspectPeerAuthority(connection, request)).toMatchObject({ status, authorized: status === "ACTIVE" });
    expect(command).toHaveBeenCalledExactlyOnceWith({ operation: "authority.inspect", input: request });
  });
  it("fails closed on network failure, inconsistent results and unexpected authority fields", async () => {
    vi.stubEnv("MYEVE_RELAY_ENABLED", "true"); vi.stubEnv("MYEVE_RELAY_ORIGIN", binding.origin);
    const command = vi.spyOn(RelayClient.prototype, "command").mockRejectedValue(new Error("private-test-credential"));
    expect(await inspectPeerAuthority(connection, request)).toMatchObject({ authorized: false, status: "UNAVAILABLE" });
    command.mockResolvedValue({ ...observation("ACTIVE"), authorized: false });
    expect(await inspectPeerAuthority(connection, request)).toMatchObject({ authorized: false });
    expect(inspectionSchema.safeParse({ ...observation("ACTIVE"), token: "not-authority" }).success).toBe(false);
  });
});
