import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { digest } from "./contract.ts";
import { FactorySubscriptionSettlementUnsupported, LiveFactoryAdapter } from "./factory-live-adapter.ts";
import { isWorkSpend, isWorkSpendV2, subscriptionSpendSchema, validateSpendBinding } from "./factory-spend.ts";

const h = (c: string) => c.repeat(64);
const sourceDigest = h("1"), configurationDigest = h("2");
const connection = (mode: string) => ({ origin: "http://127.0.0.1:8792", token: h("a"), factoryId: "myfactory-local-v4-owner-sub", sourceDigest, configurationDigest,
  factoryVersion: digest({ sourceDigest, configurationDigest }), repositoryPath: "/tmp/repo",
  keys: [{ factoryId: "myfactory-local-v4-owner-sub", keyId: "k", publicKey: "pem", activeFrom: "2026-01-01T00:00:00Z", notAfter: "2099-01-01T00:00:00Z" }],
  spendContract: { version: "WORK_LEDGER_V2", sourceDigest },
  qualification: { scopeId: "owner", profileHash: h("3"), evidenceRef: "ev", qualifiedAt: "2026-01-01T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z", mode, spendEnforced: true } } as never);
const actions = (mode: string) => async () => Response.json({ client: "myeve", actions: [], controls: ["factory.prepare", "factory.dispatch", "factory.observe", "factory.stop"],
  execution: { mode, spendEnforced: true, metering: "SUBSCRIPTION_UNMETERED", ownerOnly: true } });

/** The exact shape MyFactory's `subscriptionSummary` (packages/storage/src/spend-policy.ts) returns. */
export function subscriptionSpend(ids: { workId: string; requestId: string; workOrderId: string; runId: string }, states: string[], deadline = "2026-11-04T23:00:00.000Z") {
  const ops = states.map((state, i) => ({ operationId: `op-${i}`, workId: ids.workId, workGeneration: 1, dispatchIdentity: "d", requestId: ids.requestId, workOrderId: ids.workOrderId,
    factoryVersion: h("4"), runId: ids.runId, model: "gpt-5.5", pricingRevision: "owner-subscription-local.operations-v1", reservedMicrousd: null, actualMicrousd: null,
    providerRequestId: null, usage: null, state, phase: i === 2 ? "completion" : "productive", metering: "SUBSCRIPTION_UNMETERED",
    spendStatus: state === "settled" ? "SUBSCRIPTION_UNMETERED" : state === "released" ? "RELEASED" : "UNKNOWN" }));
  const unknown = ops.filter(o => o.state === "unknown").length;
  return { status: unknown ? "UNKNOWN" : "SUBSCRIPTION_UNMETERED", metering: "SUBSCRIPTION_UNMETERED", costKnown: false, currency: null, unit: "OPERATION",
    workId: ids.workId, workGeneration: 1, requestId: ids.requestId, workOrderId: ids.workOrderId, deadline,
    ceilingMicrousd: null, settledMicrousd: null, retainedMicrousd: null, availableMicrousd: null, unknownExposureMicrousd: null,
    unknownOperations: unknown, inFlightOperations: ops.filter(o => o.state === "reserved" || o.state === "dispatched").length,
    operationsUsed: ops.filter(o => o.state !== "released").length, maxOperations: 3, paidOperationsUsed: ops.length, maxPaidOperations: 3,
    plannedProductiveOperations: 2, plannedCompletionOperations: 1, completionOperationsUsed: ops.filter(o => o.phase === "completion").length,
    completionOperationSlotsRemaining: 1 - ops.filter(o => o.phase === "completion").length, contractVersion: "WORK_LEDGER_V2", pricingRevision: "owner-subscription-local.operations-v1",
    pricingQualified: false, routeQualified: true, authorityState: "active", accountingComplete: ops.every(o => ["settled", "released"].includes(o.state)), phase: "productive", cancelled: false, operations: ops };
}
const ids = () => ({ workId: randomUUID(), requestId: randomUUID(), workOrderId: randomUUID(), runId: randomUUID() });
const readback = (i: ReturnType<typeof ids>, spend: unknown, state = "COMPLETED") =>
  ({ requestId: i.requestId, workOrderId: i.workOrderId, runId: i.runId, snapshot: null, identity: null, state, quiescent: true, evidenceRef: "ev-1", spend, blocker: null });

it("OWNER_SUBSCRIPTION_LOCAL is healthy only when it is exactly the pinned mode; it is never accepted as LIVE or vice versa", async () => {
  expect(await new LiveFactoryAdapter(connection("OWNER_SUBSCRIPTION_LOCAL"), actions("OWNER_SUBSCRIPTION_LOCAL") as never).healthy()).toBe(true);
  expect(await new LiveFactoryAdapter(connection("LIVE"), actions("OWNER_SUBSCRIPTION_LOCAL") as never).healthy()).toBe(false);
  expect(await new LiveFactoryAdapter(connection("OWNER_SUBSCRIPTION_LOCAL"), actions("LIVE") as never).healthy()).toBe(false);
});

it("under the pinned subscription mode an operations-only readback is accepted with null money accounting, never $0", async () => {
  const i = ids(), spend = subscriptionSpend(i, ["settled", "settled"]);
  const adapter = new LiveFactoryAdapter(connection("OWNER_SUBSCRIPTION_LOCAL"), (async () => Response.json(readback(i, spend))) as never);
  const rb = await (adapter as any).request("/" + i.requestId);
  expect(rb.accounting).toMatchObject({ metering: "SUBSCRIPTION_UNMETERED", operationsUsed: 2, maxOperations: 3, settledMicrousd: null, activeMicrousd: null, unknownMicrousd: null });
  expect(JSON.stringify(rb.accounting)).not.toMatch(/"settledMicrousd":0/);
  // It is never a priced WorkSpend, so no money reader treats it as one.
  expect(isWorkSpend(rb.spend)).toBe(false); expect(isWorkSpendV2(rb.spend)).toBe(false);
});

it("outside the pinned mode, or with a malformed or money-bearing readback, the subscription readback is refused", async () => {
  const i = ids(), spend = subscriptionSpend(i, ["settled"]);
  for (const mode of ["LIVE", "LOCAL_SPEND_FIXTURE"]) {
    const adapter = new LiveFactoryAdapter(connection(mode), (async () => Response.json(readback(i, spend))) as never);
    await expect((adapter as any).request("/x")).rejects.toBeInstanceOf(FactorySubscriptionSettlementUnsupported);
  }
  const adapter = (s: unknown) => new LiveFactoryAdapter(connection("OWNER_SUBSCRIPTION_LOCAL"), (async () => Response.json(readback(i, s))) as never);
  for (const bad of [{ ...spend, settledMicrousd: 0 }, { ...spend, currency: "USD" }, { ...spend, operationsUsed: 9 },
    { ...spend, operations: spend.operations.map(o => ({ ...o, actualMicrousd: 0 })) }, { ...spend, status: "KNOWN" }])
    await expect((adapter(bad) as any).request("/x")).rejects.toThrow();
  expect(subscriptionSpendSchema.safeParse({ ...spend, unknownOperations: 1 }).success).toBe(false);
});

it("binding and approved operation plan are still checked exactly for an unmetered readback", () => {
  const i = ids(), spend = subscriptionSpendSchema.parse(subscriptionSpend(i, ["settled"]));
  const plan = { version: "WORK_LEDGER_V2", pricingRevision: "owner-subscription-local.operations-v1", plannedProductiveOperations: 2, plannedCompletionOperations: 1, maxPaidOperations: 3, completionReserveMicrousd: 1 } as const;
  const binding = { ...i, workGeneration: 1, deadline: spend.deadline };
  expect(() => validateSpendBinding(spend, binding, 0.65, plan)).not.toThrow();
  expect(() => validateSpendBinding(spend, { ...binding, workId: randomUUID() }, 0.65, plan)).toThrow();
  expect(() => validateSpendBinding(spend, binding, 0.65, { ...plan, plannedProductiveOperations: 1, maxPaidOperations: 2 })).toThrow();
});

it("refuses future generations, duplicate operations, phase-count forgery and incomplete execution identity", () => {
  const i = ids();
  for (const mutate of [
    (s: any) => { s.operations[0].workGeneration = 2; s.operations[0].requestId = randomUUID(); },
    (s: any) => { s.operations[1].operationId = s.operations[0].operationId; },
    (s: any) => { s.completionOperationsUsed = 1; },
    (s: any) => { s.operations[0].phase = "completion"; },
    (s: any) => { s.maxOperations = 4; },
    (s: any) => { delete s.operations[0].dispatchIdentity; },
    (s: any) => { delete s.operations[0].factoryVersion; },
    (s: any) => { s.operations[0].runId = null; },
  ]) {
    const s = subscriptionSpend(i, ["settled", "settled"]);
    mutate(s);
    expect(subscriptionSpendSchema.safeParse(s).success).toBe(false);
  }
});

it("checks current-generation dispatch identity, Factory version and run against the exact attempt", () => {
  const i = ids(), spend = subscriptionSpendSchema.parse(subscriptionSpend(i, ["settled"]));
  const binding = { ...i, workGeneration: 1, deadline: spend.deadline, dispatchIdentity: "d", factoryVersion: h("4"), remoteRunId: i.runId };
  expect(() => validateSpendBinding(spend, binding)).not.toThrow();
  for (const key of ["dispatchIdentity", "factoryVersion", "remoteRunId", "requestId", "workOrderId"] as const)
    expect(() => validateSpendBinding(spend, { ...binding, [key]: key === "factoryVersion" ? h("5") : randomUUID() })).toThrow();
});
