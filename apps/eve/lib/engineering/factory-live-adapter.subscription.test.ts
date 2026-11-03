import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { digest } from "./contract.ts";
import { FactorySubscriptionSettlementUnsupported, LiveFactoryAdapter } from "./factory-live-adapter.ts";

const h = (c: string) => c.repeat(64);
const connection = (mode: string) => {
  const sourceDigest = h("1"), configurationDigest = h("2");
  return { origin: "http://127.0.0.1:8792", token: h("a"), factoryId: "myfactory-local-v4-owner-sub", sourceDigest, configurationDigest,
    factoryVersion: digest({ sourceDigest, configurationDigest }), repositoryPath: "/tmp/repo",
    keys: [{ factoryId: "myfactory-local-v4-owner-sub", keyId: "k", publicKey: "pem", activeFrom: "2026-01-01T00:00:00Z", notAfter: "2099-01-01T00:00:00Z" }],
    spendContract: { version: "WORK_LEDGER_V2", sourceDigest },
    qualification: { scopeId: "owner", profileHash: h("3"), evidenceRef: "ev", qualifiedAt: "2026-01-01T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z", mode, spendEnforced: true } } as never;
};
const actions = (mode: string) => async () => Response.json({ client: "myeve", actions: [], controls: ["factory.prepare", "factory.dispatch", "factory.observe", "factory.stop"],
  execution: { mode, spendEnforced: true, metering: "SUBSCRIPTION_UNMETERED", ownerOnly: true } });

it("OWNER_SUBSCRIPTION_LOCAL is healthy only when it is exactly the pinned mode; it is never accepted as LIVE or vice versa", async () => {
  expect(await new LiveFactoryAdapter(connection("OWNER_SUBSCRIPTION_LOCAL"), actions("OWNER_SUBSCRIPTION_LOCAL") as never).healthy()).toBe(true);
  expect(await new LiveFactoryAdapter(connection("LIVE"), actions("OWNER_SUBSCRIPTION_LOCAL") as never).healthy()).toBe(false);
  expect(await new LiveFactoryAdapter(connection("OWNER_SUBSCRIPTION_LOCAL"), actions("LIVE") as never).healthy()).toBe(false);
});

it("an unmetered subscription readback (null amounts) is refused with a named error, never parsed or settled as $0", async () => {
  const requestId = randomUUID(), workOrderId = randomUUID();
  for (const status of ["SUBSCRIPTION_UNMETERED", "UNKNOWN"]) {
    const spend = { status, metering: "SUBSCRIPTION_UNMETERED", costKnown: false, currency: null, unit: "OPERATION", settledMicrousd: null, retainedMicrousd: null,
      availableMicrousd: null, ceilingMicrousd: null, unknownExposureMicrousd: null, operationsUsed: 1, maxOperations: 3, operations: [{ actualMicrousd: null, reservedMicrousd: null, spendStatus: status }] };
    const fetcher = async () => Response.json({ requestId, workOrderId, runId: null, snapshot: null, identity: null, state: "RUNNING", quiescent: false, evidenceRef: null, spend, blocker: null });
    const adapter = new LiveFactoryAdapter(connection("OWNER_SUBSCRIPTION_LOCAL"), fetcher as never);
    await expect(adapter.read({ requestId } as never)).rejects.toBeInstanceOf(FactorySubscriptionSettlementUnsupported);
  }
});
