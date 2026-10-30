import { afterEach, beforeEach, expect, it, vi } from "vitest";

const probe = vi.hoisted(() => ({ provider: 0, legacy: [] as { name: string; args: unknown[] }[],
  queries: [] as { sql: string; params: unknown[] }[], agentLookups: 0, ownerRecoveries: 0 }));
vi.mock("ai", () => ({
  experimental_evaluate: async () => { probe.provider++; throw Error("FAKE_PROVIDER_REACHED"); },
  gateway: { evaluationModel: () => ({}) },
}));
vi.mock("eve/hooks", () => ({ defineHook: (value: unknown) => value }));
vi.mock("../relay/owner/runtime.ts", () => ({ ownerRuntimeFromAuth: () => null, resolveOwnerRuntime: () => null }));
vi.mock("../task-runs.ts", () => Object.fromEntries([
  "assertTaskBudget", "completeTaskSubagent", "failTaskSubagent", "recordTaskModelStep", "registerTaskSubagent",
].map(name => [name, async (...args: unknown[]) => { probe.legacy.push({ name, args }); }])));
vi.mock("../../agent/lib/receipts-db.ts", () => ({ db: () => ({ query: async (sql: string, params: unknown[]) => {
  probe.queries.push({ sql, params }); return [];
} }) }));
vi.mock("../../agent/lib/session-settings.ts", () => ({ resolveSessionAgent: async () => { probe.agentLookups++; return { id: "legacy-agent" }; } }));
vi.mock("../../agent/lib/action-context.ts", () => ({ ownerChatRun: async () => { probe.ownerRecoveries++; } }));
vi.mock("../execution-auth.ts", () => ({ executionIdentityFromAuth: () => null }));

import { JevDecisionProvider } from "../decision-intelligence/jev-provider.ts";
import ledger from "../../agent/hooks/task-ledger.ts";
import agentRuns from "../../agent/hooks/agent-runs.ts";
import ownerChat from "../../agent/hooks/owner-chat-run.ts";

const saved = { ...process.env };
beforeEach(() => {
  process.env.MYEVE_QDEV_ENABLED = "true";
  delete process.env.EVE_PROJECT_NAME;
  delete process.env.MYEVE_EXTERNAL_ALPHA_POLICY;
  delete process.env.MYEVE_ALPHA_OWNER_BINDING;
  probe.provider = 0;
  probe.legacy = [];
  probe.queries = []; probe.agentLookups = 0; probe.ownerRecoveries = 0;
});
afterEach(() => { process.env = { ...saved }; });

const ctx = { session: { id: "synthetic-qdev-session", auth: { current: {
  principalType: "user", principalId: "synthetic-q2", authenticator: "myeve-web-session", attributes: { owner: "true" },
} } } };
const evaluate = () => new JevDecisionProvider({ configured: () => true, model: () => ({} as never) }).evaluate(
  { state: {}, question: "q", definitions: {}, outcomes: ["a"] } as never, new AbortController().signal,
);
const event = (name: keyof NonNullable<typeof ledger.events>, data: unknown = {}) => (ledger.events![name] as any)({ data }, ctx);

it("QDEV denies separately configured auxiliary evaluation before the provider", async () => {
  await expect(evaluate()).rejects.toThrow("PAID_PATH_DENIED:decision-intelligence-jev");
  expect(probe.provider).toBe(0);
});

it("QDEV framework steps never read or mutate the original task accounting", async () => {
  await event("step.started");
  await event("step.completed", { usage: { costUsd: 0.42 } });
  expect(probe.legacy).toEqual([]);
});

it("QDEV refuses auxiliary compaction before inference", async () => {
  await expect(event("compaction.requested")).rejects.toThrow("PAID_PATH_DENIED:context-compaction");
  expect(probe.provider).toBe(0);
  expect(probe.legacy).toEqual([]);
});

it("QDEV denies framework delegation and ignores late child accounting events", async () => {
  await expect(event("subagent.called", { sessionId: ctx.session.id, childSessionId: "child", callId: "call", name: "coder" }))
    .rejects.toThrow("QDEV_DELEGATION_DISABLED");
  await event("subagent.completed", { callId: "call", subagentName: "coder", output: "done" });
  await event("action.result", { status: "failed", result: { kind: "subagent-result", subagentName: "coder", output: "failed" } });
  expect(probe.legacy).toEqual([]);
});

it("QDEV still permits the root journey tool action without framework ledger writes", async () => {
  await event("actions.requested", { actions: [{ toolName: "qualification_journey" }] });
  await event("action.result", { status: "succeeded", result: { kind: "tool-result", toolName: "qualification_journey" } });
  expect(probe.legacy).toEqual([]);
});

it("ordinary installations retain task accounting and auxiliary behavior", async () => {
  delete process.env.MYEVE_QDEV_ENABLED;
  await event("step.started");
  await event("step.completed", { usage: { costUsd: 0.42 } });
  await event("compaction.requested");
  expect(probe.legacy).toEqual([
    { name: "assertTaskBudget", args: [ctx.session.id] },
    { name: "recordTaskModelStep", args: [ctx.session.id, 0.42] },
  ]);
  await expect(evaluate()).rejects.toThrow("GATEWAY_FAILURE");
  expect(probe.provider).toBe(1);
});

const agentEvents = ["step.started", "step.completed", "turn.completed", "turn.failed", "turn.cancelled"] as const;
const runAgentEvents = async () => {
  for (const name of agentEvents) await (agentRuns.events![name] as any)({ data: { usage: { costUsd: 0.42 } } }, ctx);
};
const receiveMessage = () => (ownerChat.events!["message.received"] as any)({ data: { message: "Run approved qualification" } }, ctx);

it("QDEV agent-run lifecycle events never read or mutate the original agent_runs ledger", async () => {
  await runAgentEvents();
  expect(probe.queries).toEqual([]);
});

it("QDEV messages never look up legacy agents or recover an original owner chat run", async () => {
  await receiveMessage();
  expect(probe.agentLookups).toBe(0); expect(probe.ownerRecoveries).toBe(0); expect(probe.queries).toEqual([]);
});

it("ordinary installations retain all agent-run lifecycle events and owner chat recovery", async () => {
  delete process.env.MYEVE_QDEV_ENABLED;
  await runAgentEvents(); await receiveMessage();
  expect(probe.queries).toHaveLength(5);
  expect(probe.queries.every(q => q.sql.includes("agent_runs"))).toBe(true);
  expect(probe.queries[1].params).toEqual([ctx.session.id, 0.42]);
  expect(probe.agentLookups).toBe(1); expect(probe.ownerRecoveries).toBe(1);
});
