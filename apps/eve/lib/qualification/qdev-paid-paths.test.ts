import { afterEach, beforeEach, expect, it, vi } from "vitest";

const probe = vi.hoisted(() => ({ provider: 0, legacy: [] as { name: string; args: unknown[] }[],
  queries: [] as { sql: string; params: unknown[] }[], agentLookups: 0, ownerRecoveries: 0,
  // What the message hook records for the turn (agent/lib/qdev-turn.ts) and what the host answers for a received message.
  recorded: null as null | { route: "JOURNEY" | "CHAT"; fingerprint: string; turnId?: string }, messageRoute: null as null | "JOURNEY" | "CHAT", routed: [] as unknown[] }));
vi.mock("../../agent/lib/qdev-turn.ts", () => ({ recordedQdevTurn: () => probe.recorded, qdevChatTurn: () => probe.recorded?.route === "CHAT",
  recordQdevTurn: (record: typeof probe.recorded) => { probe.recorded = record; } }));
vi.mock("./ingress.ts", async (original) => { const actual = await original<typeof import("./ingress.ts")>(); return { ...actual,
  qdevMessageRoute: async (session: never, text: string | undefined) => { probe.routed.push(text);
    return probe.messageRoute ? { route: probe.messageRoute, fingerprint: "fp" } : actual.qdevMessageRoute(session, text); } }; });
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
  probe.queries = []; probe.agentLookups = 0; probe.ownerRecoveries = 0; probe.recorded = null; probe.messageRoute = null; probe.routed = [];
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

// ---- A QDEV turn positively recorded as ordinary chat is budgeted and accounted like any other chat turn ----
it("QDEV chat turn: the run budget is asserted before the step and its cost is recorded after it", async () => {
  probe.recorded = { route: "CHAT", fingerprint: "fp" };
  await event("step.started");
  await event("step.completed", { usage: { costUsd: 0.42 } });
  expect(probe.legacy).toEqual([
    { name: "assertTaskBudget", args: [ctx.session.id] },
    { name: "recordTaskModelStep", args: [ctx.session.id, 0.42] },
  ]);
  await runAgentEvents();
  expect(probe.queries).toHaveLength(5);
  expect(probe.queries[1].params).toEqual([ctx.session.id, 0.42]);
});
it("QDEV chat turn: delegation and auxiliary compaction stay closed", async () => {
  probe.recorded = { route: "CHAT", fingerprint: "fp" };
  await expect(event("subagent.called", { sessionId: ctx.session.id, childSessionId: "child", callId: "call", name: "coder" })).rejects.toThrow("QDEV_DELEGATION_DISABLED");
  await expect(event("compaction.requested")).rejects.toThrow("PAID_PATH_DENIED:context-compaction");
  expect(probe.legacy).toEqual([]); expect(probe.provider).toBe(0);
});
it("QDEV journey turn after a chat turn: the ledger is isolated again", async () => {
  probe.recorded = { route: "JOURNEY", fingerprint: "fp" };
  await event("step.started"); await event("step.completed", { usage: { costUsd: 0.42 } }); await runAgentEvents();
  expect(probe.legacy).toEqual([]); expect(probe.queries).toEqual([]);
});
it("QDEV message received as chat: the route is recorded with its turn and the owner chat run is bound as in an ordinary installation", async () => {
  probe.messageRoute = "CHAT";
  await (ownerChat.events!["message.received"] as any)({ data: { message: "hello - what model is this?", turnId: "turn-7" } }, ctx);
  expect(probe.recorded).toEqual({ route: "CHAT", fingerprint: "fp", turnId: "turn-7" });
  expect(probe.routed).toEqual(["hello - what model is this?"]);
  expect(probe.agentLookups).toBe(1); expect(probe.ownerRecoveries).toBe(1);
});
it("QDEV message received as a journey message: the route is recorded and no legacy agent or owner chat run is touched", async () => {
  probe.recorded = { route: "CHAT", fingerprint: "old" };                       // a previous chat turn
  probe.messageRoute = "JOURNEY";
  await (ownerChat.events!["message.received"] as any)({ data: { message: "Build me a React dashboard", turnId: "turn-8" } }, ctx);
  expect(probe.recorded).toEqual({ route: "JOURNEY", fingerprint: "fp", turnId: "turn-8" });
  expect(probe.agentLookups).toBe(0); expect(probe.ownerRecoveries).toBe(0); expect(probe.queries).toEqual([]);
});
it("QDEV message with a file attachment is routed as a non-text message", async () => {
  probe.messageRoute = "CHAT";
  await (ownerChat.events!["message.received"] as any)({ data: { message: "build a habit tracker", parts: [{ type: "file" }], turnId: "turn-9" } }, ctx);
  expect(probe.routed).toEqual([undefined]);
});
it("QDEV message in an unconfigured installation is recorded as JOURNEY by the real host admission (fail closed)", async () => {
  await receiveMessage();
  expect(probe.recorded?.route).toBe("JOURNEY");
  expect(probe.agentLookups).toBe(0); expect(probe.ownerRecoveries).toBe(0);
});
