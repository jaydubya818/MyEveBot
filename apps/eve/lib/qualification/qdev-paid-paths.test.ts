import { afterEach, beforeEach, expect, it, vi } from "vitest";

const probe = vi.hoisted(() => ({ provider: 0, legacy: [] as { name: string; args: unknown[] }[] }));
vi.mock("ai", () => ({
  experimental_evaluate: async () => { probe.provider++; throw Error("FAKE_PROVIDER_REACHED"); },
  gateway: { evaluationModel: () => ({}) },
}));
vi.mock("eve/hooks", () => ({ defineHook: (value: unknown) => value }));
vi.mock("../relay/owner/runtime.ts", () => ({ ownerRuntimeFromAuth: () => null, resolveOwnerRuntime: () => null }));
vi.mock("../task-runs.ts", () => Object.fromEntries([
  "assertTaskBudget", "completeTaskSubagent", "failTaskSubagent", "recordTaskModelStep", "registerTaskSubagent",
].map(name => [name, async (...args: unknown[]) => { probe.legacy.push({ name, args }); }])));

import { JevDecisionProvider } from "../decision-intelligence/jev-provider.ts";
import ledger from "../../agent/hooks/task-ledger.ts";

const saved = { ...process.env };
beforeEach(() => {
  process.env.MYEVE_QDEV_ENABLED = "true";
  delete process.env.EVE_PROJECT_NAME;
  delete process.env.MYEVE_EXTERNAL_ALPHA_POLICY;
  delete process.env.MYEVE_ALPHA_OWNER_BINDING;
  probe.provider = 0;
  probe.legacy = [];
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
