import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { LiveFactoryPort, type SubscriptionUsage } from "./factory-live-port.ts";
import { SUBSCRIPTION_USAGE_SQL_SHA256, subscriptionUsageRecorder } from "./subscription-usage.ts";
import { presentJourney } from "./presentation.ts";
import { qualificationConversation } from "./conversation-model.ts";
import { JourneyHalted } from "./journey.ts";

it("the owner-local usage SQL is separately pinned and has no money column", () => {
  const sql = readFileSync(new URL("./subscription-usage.sql", import.meta.url), "utf8");
  expect(createHash("sha256").update(sql).digest("hex")).toBe(SUBSCRIPTION_USAGE_SQL_SHA256);
  expect(sql.split("\n").filter(line => !line.startsWith("--")).join("\n")).not.toMatch(/microusd|_usd|amount|price|cost/i);
  expect(sql).toMatch(/CHECK \(metering = 'SUBSCRIPTION_UNMETERED'\)/);
  // The hash-pinned cohort accounting SQL is untouched by this change.
  expect(createHash("sha256").update(readFileSync(new URL("../external-alpha/qualification-accounting.sql", import.meta.url), "utf8")).digest("hex"))
    .toBe("f52677729d9e50ad7361273bfa8732b33fbe091ca77ce522736599081957671d");
});

function port(accounting: Record<string, unknown> | null, record?: (u: SubscriptionUsage) => Promise<void>) {
  const binding = { operationId: "op" } as never, identity = { requestId: "r", workOrderId: "w", remoteRunId: "run" } as never;
  const p = new LiveFactoryPort({ enabled: true, retained: async () => ({}) as never, pollMs: 1, settleTimeoutMs: 50, recordSubscriptionUsage: record,
    live: { prepared: async () => ({}) as never, dispatch: async () => undefined, result: async () => null,
      read: async () => ({ requestId: "r", workOrderId: "w", runId: "run", state: "COMPLETED", quiescent: true, evidenceRef: "ev", accounting }) as never } });
  (p as any).ready_.set(1, { binding, identity, admitted: {}, ceilingMicrousd: 650000 });
  return { p, binding };
}
const unmetered = (over: Record<string, unknown> = {}) => ({ metering: "SUBSCRIPTION_UNMETERED", status: "SUBSCRIPTION_UNMETERED", unit: "OPERATION", operationsUsed: 2, maxOperations: 3,
  inFlightOperations: 0, unknownOperations: 0, completionOperationsUsed: 0, accountingComplete: true, settledMicrousd: null, activeMicrousd: null, unknownMicrousd: null, ceilingMicrousd: null, ...over });

it("an unmetered run settles only after its operation units are durably recorded; doubt or a missing recorder fences", async () => {
  const recorded: SubscriptionUsage[] = [];
  const ok = port(unmetered(), async u => { recorded.push(u); });
  const out = await ok.p.dispatch(ok.binding, 650000);
  expect(out).toEqual({ known: true, value: { state: "COMPLETED", evidenceRef: "ev", metering: "SUBSCRIPTION_UNMETERED", operationsUsed: 2, settledMicrousd: null } });
  expect(recorded).toEqual([expect.objectContaining({ metering: "SUBSCRIPTION_UNMETERED", operationsUsed: 2, requestId: "r", runId: "run" })]);
  expect(ok.p.subscriptionUsage()).toEqual({ metering: "SUBSCRIPTION_UNMETERED", operations: 2, runs: 1 });
  for (const [acc, rec] of [[unmetered(), undefined], [unmetered({ unknownOperations: 1, status: "UNKNOWN" }), async () => undefined],
    [unmetered({ inFlightOperations: 1 }), async () => undefined], [unmetered({ accountingComplete: false }), async () => undefined],
    [unmetered(), async () => { throw Error("db down"); }]] as const) {
    const f = port(acc, rec as never);
    expect(await f.p.dispatch(f.binding, 650000)).toEqual({ known: false });
    expect(f.p.subscriptionUsage()).toBeNull();
  }
});

it("the recorder refuses without the operator-applied table and refuses a conflicting readback for the same run", async () => {
  await expect(subscriptionUsageRecorder({ query: async () => [{ t: null }] } as never, "a".repeat(64))).rejects.toThrow(/SCHEMA/);
  const rows = new Map<string, Record<string, unknown>>();
  const db = { query: vi.fn(async (sql: string, p: unknown[] = []) => {
    if (sql.includes("to_regclass")) return [{ t: "qdev_subscription_usage" }];
    if (sql.startsWith("INSERT")) { if (!rows.has(String(p[1]))) rows.set(String(p[1]), { w: p[2], r: p[3], state: p[4], n: p[5], m: p[6], e: p[8] }); return []; }
    return [rows.get(String(p[1]))];
  }) };
  const record = await subscriptionUsageRecorder(db as never, "a".repeat(64));
  const u: SubscriptionUsage = { metering: "SUBSCRIPTION_UNMETERED", requestId: randomUUID(), workOrderId: randomUUID(), runId: randomUUID(), state: "COMPLETED",
    operationsUsed: 2, maxOperations: 3, completionOperationsUsed: 0, evidenceRef: "ev" };
  await record(u); await record(u);
  await expect(record({ ...u, operationsUsed: 3 })).rejects.toThrow(/CONFLICT/);
  await expect(record({ ...u, operationsUsed: 4 })).rejects.toThrow(/INVALID/);
  expect(db.query.mock.calls.some(([sql]) => /usd|amount/i.test(String(sql)))).toBe(false);
});

it("Sofie reports unmetered usage in operations, never as a money amount or $0, for both completion and halt", async () => {
  const usage = { metering: "SUBSCRIPTION_UNMETERED" as const, operations: 5, runs: 3 };
  const done = presentJourney({ stages: [1, 2, 3, 4].map(stage => ({ stage, candidate: { commit: "a".repeat(40) } })), verdictSha256: "b".repeat(64), deliverySha256: "c".repeat(64),
    assurance: "PRIVATE_BETA_LOCAL" } as never, usage);
  const halted = presentJourney(new JourneyHalted(2, "QDEV_FENCED", [] as never) as never, usage);
  const derive = (text: string) => ({ request: text, requestSha256: "d".repeat(64), planSha256: "e".repeat(64), repository: "local/dashboard", environment: "env", cohortId: "c", planningInFactory: true });
  const model = qualificationConversation({ ownerId: "o", revalidate: async () => true, ownerRequest: { derive }, deliveryUrl: "http://127.0.0.1:8796/" }).model({ sessionId: "s", stepKey: "k" });
  const textOf = (r: any) => r.content.map((p: any) => p.text ?? "").join("");
  const req = "Build a React dashboard showing GitHub repository health.";
  const proposal = textOf(await model.doGenerate({ prompt: [{ role: "user", content: [{ type: "text", text: req }] }], tools: [] } as never));
  expect(proposal).toContain("planning and coding in one MyFactory run");
  const user = { role: "user", content: [{ type: "text", text: req }] }, proposed = { role: "assistant", content: [{ type: "text", text: proposal }] };
  const confirm = { role: "user", content: [{ type: "text", text: "confirm eeeeeeeeeeee" }] };
  const tools = [{ type: "function", name: "qualification_journey", inputSchema: { type: "object" } }];
  const started = await model.doGenerate({ prompt: [user, proposed, confirm], tools } as never);
  const call = started.content[0];
  expect(call.type).toBe("tool-call");
  for (const value of [done, halted]) {
    expect(value.usage).toEqual(usage);
    const text = textOf(await model.doGenerate({ prompt: [user, proposed, confirm, { role: "assistant", content: [call] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: call.toolCallId, toolName: "qualification_journey", output: { type: "json", value } }] }], tools } as never));
    expect(text).toContain("Subscription usage: 5 operations across 3 Factory runs (unmetered; no cost is recorded).");
    expect(text).not.toMatch(/\$\s*0|0\.00|USD/);
  }
  // The owner-local delivery link may be the loopback preview.
  expect(textOf(await model.doGenerate({ prompt: [user, proposed, confirm, { role: "assistant", content: [call] },
    { role: "tool", content: [{ type: "tool-result", toolCallId: call.toolCallId, toolName: "qualification_journey", output: { type: "json", value: done } }] }], tools } as never)))
    .toContain("(http://127.0.0.1:8796/)");
  // A non-owner-local conversation still refuses a non-https delivery link.
  expect(() => qualificationConversation({ ownerId: "o", revalidate: async () => true, approvedRequest: "x", deliveryUrl: "http://127.0.0.1:8796/" })).toThrow(/DELIVERY_URL/);
});
