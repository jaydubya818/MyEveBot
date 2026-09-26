import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RelayClient } from "./client.ts";
import { retireOwnerConnection } from "./owner.ts";
import { FederationStore } from "./store.ts";
import { encryptSecret } from "./transport.ts";

const original = {
  key: process.env.MYEVE_RELAY_ENCRYPTION_KEY,
  enabled: process.env.MYEVE_RELAY_ENABLED,
  origin: process.env.MYEVE_RELAY_ORIGIN,
};

beforeEach(() => {
  process.env.MYEVE_RELAY_ENCRYPTION_KEY = "a".repeat(64);
  process.env.MYEVE_RELAY_ENABLED = "true";
  process.env.MYEVE_RELAY_ORIGIN = "https://relay.example.test";
});
afterEach(() => {
  for (const [key, value] of [
    ["MYEVE_RELAY_ENCRYPTION_KEY", original.key],
    ["MYEVE_RELAY_ENABLED", original.enabled],
    ["MYEVE_RELAY_ORIGIN", original.origin],
  ] as const) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  vi.restoreAllMocks();
});

function fixture() {
  let status = "active";
  let grantStatus = "active";
  const order: string[] = [];
  const query = vi.fn(async (sql: string) => {
    if (sql.startsWith("SELECT relay_owner_id")) return [{
      relay_owner_id: "account-one", relay_agent_id: "agent-one",
      address: "relay://account-one/agent-one", status,
      owner_session_encrypted: encryptSecret("owner-one", "session-cookie"),
    }];
    if (sql.includes("SET status='paused'")) { status = "paused"; order.push("fence"); return []; }
    if (sql.startsWith("SELECT id FROM myeve_relay_grants")) return grantStatus === "revoked" ? [] : [{ id: "grant-one" }];
    if (sql.includes("SET status='revoked' WHERE owner_id=$1 AND id=$2")) {
      grantStatus = "revoked"; order.push("grant-recorded"); return [];
    }
    if (sql.includes("SET status='revoked',agent_credential_encrypted")) {
      status = "revoked"; order.push("retired-recorded"); return [];
    }
    if (sql.startsWith("INSERT INTO myeve_relay_activity")) return [];
    throw new Error(`Unexpected query: ${sql}`);
  });
  const store = new FederationStore("owner-one", { query });
  const owner = vi.spyOn(RelayClient.prototype, "owner").mockImplementation(async () => {
    order.push("grant-revoked"); return {} as never;
  });
  const request = vi.spyOn(RelayClient.prototype, "request").mockImplementation(async (path, _body, _owner, method) => {
    order.push(`${method}:${path}`); return {} as never;
  });
  return { store, order, owner, request, status: () => status };
}

it("fences Eve, revokes grants, disables the exact Relay Agent, and clears credentials", async () => {
  const x = fixture();
  await expect(retireOwnerConnection(x.store)).resolves.toEqual({
    connected: true, retired: true, address: "relay://account-one/agent-one",
  });
  expect(x.order).toEqual([
    "fence", "grant-revoked", "grant-recorded",
    "PATCH:/api/agents/agent-one", "DELETE:/api/agents/agent-one/credentials",
    "retired-recorded",
  ]);
  expect(x.status()).toBe("revoked");
  await retireOwnerConnection(x.store);
  expect(x.request).toHaveBeenCalledTimes(2);
});

it("keeps the connection fenced and retryable if Relay refuses retirement", async () => {
  const x = fixture();
  x.request.mockRejectedValueOnce(new Error("Relay unavailable"));
  await expect(retireOwnerConnection(x.store)).rejects.toThrow("Relay unavailable");
  expect(x.status()).toBe("paused");
  expect(x.order).not.toContain("retired-recorded");
  await expect(retireOwnerConnection(x.store)).resolves.toMatchObject({ retired: true });
  expect(x.status()).toBe("revoked");
});
