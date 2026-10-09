import { beforeEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  active: vi.fn(),
  generate: vi.fn(),
  catalog: vi.fn(),
  admit: vi.fn(),
  reserve: vi.fn(),
  settle: vi.fn(),
  unknown: vi.fn(),
  agent: vi.fn(),
  policy: vi.fn(),
}));
vi.mock("ai", () => ({
  gateway: Object.assign(() => ({ doGenerate: mocks.generate }), {
    getAvailableModels: mocks.catalog,
  }),
}));
vi.mock("./policy.ts", () => ({ externalAlphaPolicy: mocks.policy }));
vi.mock("./allowance.ts", () => ({
  ExternalAlphaAllowance: class {
    assertActive = mocks.active;
    admit = mocks.admit;
    reserve = mocks.reserve;
    settle = mocks.settle;
    unknown = mocks.unknown;
  },
}));
vi.mock("../../agent/lib/receipts-db.ts", () => ({ db: () => ({}) }));
vi.mock("../../agent/lib/session-settings.ts", () => ({
  resolveSessionAgent: mocks.agent,
}));
import { externalAlphaModel, externalAlphaPrompt } from "./model.ts";
const identity = () => ({
  ownerId: "owner-a",
  sessionId: "session-a",
  stepKey: "turn-a:0",
  auth: {
    current: {
      authenticator: "myeve-web-session",
      principalType: "user",
      principalId: "owner-a",
      attributes: { owner: "true" },
    },
    initiator: {
      authenticator: "myeve-web-session",
      principalType: "user",
      principalId: "owner-a",
      attributes: { owner: "true" },
    },
  },
  primaryFallback: true,
});
const options = () => ({
  prompt: [
    {
      role: "user" as const,
      content: [{ type: "text" as const, text: "Explain my private notes." }],
    },
  ],
  tools: [
    { type: "function" as const, name: "list_agents", inputSchema: {} },
    { type: "function" as const, name: "bash", inputSchema: {} },
  ],
  providerOptions: { gateway: { models: ["unapproved"], byok: { bad: true } } },
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.policy.mockReturnValue({
    ownerId: "owner-a",
    model: "openai/gpt-5.4-mini",
  });
  mocks.agent.mockResolvedValue({
    id: "agent-a",
    ownerId: "owner-a",
    status: "active",
  });
  mocks.catalog.mockResolvedValue({
    models: [
      {
        id: "openai/gpt-5.4-mini",
        pricing: { input: "0.00000075", output: "0.0000045" },
      },
    ],
  });
  mocks.admit.mockResolvedValue({
    id: "allowance",
    deadline: new Date(Date.now() + 180000).toISOString(),
  });
  mocks.reserve.mockResolvedValue({
    id: "op",
    state: "DISPATCHED",
    allowance_id: "allowance",
    reserved_microusd: "100000",
  });
  mocks.generate.mockResolvedValue({
    content: [{ type: "text", text: "Owner-private response" }],
    providerMetadata: { gateway: { cost: "0.001" } },
    usage: {},
    finishReason: { unified: "stop", raw: "stop" },
    warnings: [],
  });
});
it("requires exact owner, canonical authentication and active Agent before any provider selection", async () => {
  for (const modify of [
    (i: any) => (i.auth.current.principalId = "owner-b"),
    (i: any) => (i.auth.initiator.authenticator = "untrusted"),
    (i: any) => (i.auth.current.attributes.myeveRoleId = "guest"),
  ]) {
    const input = identity();
    modify(input);
    await expect(
      externalAlphaModel(input).doGenerate(options()),
    ).rejects.toThrow("OWNER_REQUIRED");
  }
  expect(mocks.generate).not.toHaveBeenCalled();
  expect(mocks.catalog).not.toHaveBeenCalled();
});
it("strips unsupported tools and fallback options and reserves before the sole provider dispatch", async () => {
  const result = await externalAlphaModel(identity()).doGenerate(options());
  expect(result.content).toHaveLength(1);
  expect(mocks.generate).toHaveBeenCalledTimes(1);
  expect(mocks.generate.mock.invocationCallOrder[0]).toBeGreaterThan(
    mocks.reserve.mock.invocationCallOrder[0],
  );
  const sent = mocks.generate.mock.calls[0][0];
  expect(sent.tools.map((t: any) => t.name)).toEqual(["list_agents"]);
  expect(sent.providerOptions).toEqual({ gateway: { only: ["openai"] } });
  expect(sent.maxOutputTokens).toBe(1024);
  expect(mocks.settle).toHaveBeenCalledWith(
    expect.anything(),
    1000,
    expect.anything(),
  );
});
it("replays only a settled durable response without another provider call", async () => {
  mocks.reserve.mockResolvedValue({
    state: "SETTLED",
    result: { content: [{ type: "text", text: "retained" }] },
  });
  expect(await externalAlphaModel(identity()).doGenerate(options())).toEqual({
    content: [{ type: "text", text: "retained" }],
  });
  expect(mocks.generate).not.toHaveBeenCalled();
});
it("fails closed when allowance is inactive or exhausted", async () => {
  mocks.admit.mockRejectedValue(Error("inactive"));
  await expect(
    externalAlphaModel(identity()).doGenerate(options()),
  ).rejects.toThrow("inactive");
  expect(mocks.generate).not.toHaveBeenCalled();
});
it("records ambiguity without a retry or fallback on transport failure", async () => {
  mocks.generate.mockRejectedValue(Error("connection lost"));
  await expect(
    externalAlphaModel(identity()).doGenerate(options()),
  ).rejects.toThrow("connection lost");
  expect(mocks.generate).toHaveBeenCalledTimes(1);
  expect(mocks.unknown).toHaveBeenCalledTimes(1);
});
it("retains UNKNOWN when usage is missing and charges invalid tool output before denial", async () => {
  mocks.generate.mockResolvedValue({ content: [], providerMetadata: {} });
  await expect(
    externalAlphaModel(identity()).doGenerate(options()),
  ).rejects.toThrow("USAGE_UNKNOWN");
  expect(mocks.unknown).toHaveBeenCalledTimes(1);
  mocks.generate.mockResolvedValue({
    content: [{ type: "tool-call", toolName: "bash", input: "{}" }],
    providerMetadata: { gateway: { cost: 0.001 } },
  });
  await expect(
    externalAlphaModel(identity()).doGenerate(options()),
  ).rejects.toThrow("TOOL_DENIED");
  expect(mocks.settle).toHaveBeenCalledWith(
    expect.anything(),
    1000,
    expect.objectContaining({ content: [] }),
  );
});
it("rejects overlarge context and non-text owner content before pricing/dispatch", () => {
  expect(() =>
    externalAlphaPrompt({
      ...options(),
      prompt: [
        { role: "user", content: [{ type: "text", text: "a".repeat(33000) }] },
      ],
    }),
  ).toThrow("CONTEXT_BOUND");
  expect(() =>
    externalAlphaPrompt({
      ...options(),
      prompt: [
        {
          role: "user",
          content: [
            {
              type: "file",
              mediaType: "image/png",
              data: { type: "url", url: new URL("https://invalid") },
            },
          ],
        },
      ],
    }),
  ).toThrow("TEXT_CONTEXT");
});

it("does not dispatch after reservation latency consumes the original deadline", async () => {
  mocks.admit.mockResolvedValue({
    id: "allowance",
    deadline: new Date(Date.now() + 20).toISOString(),
  });
  mocks.reserve.mockImplementation(async () => {
    await new Promise((r) => setTimeout(r, 40));
    return { state: "DISPATCHED", id: "op" };
  });
  await expect(
    externalAlphaModel(identity()).doGenerate(options()),
  ).rejects.toThrow("DEADLINE");
  expect(mocks.generate).not.toHaveBeenCalled();
});
it("settles usage but returns no actionable output after revocation during the provider call", async () => {
  mocks.generate.mockImplementation(async () => {
    mocks.active.mockRejectedValue(Error("revoked"));
    return {
      content: [{ type: "tool-call", toolName: "manage_agent", input: "{}" }],
      providerMetadata: { gateway: { cost: 0.001 } },
    };
  });
  await expect(
    externalAlphaModel(identity()).doGenerate(options()),
  ).rejects.toThrow("revoked");
  expect(mocks.settle).toHaveBeenCalled();
});

it("does not dispatch if the Agent pauses while reservation is pending", async () => {
  mocks.reserve.mockImplementation(async () => {
    mocks.agent.mockResolvedValue({
      id: "agent-a",
      ownerId: "owner-a",
      status: "paused",
    });
    return { state: "DISPATCHED", id: "op" };
  });
  await expect(
    externalAlphaModel(identity()).doGenerate(options()),
  ).rejects.toThrow("AGENT_REVOKED");
  expect(mocks.generate).not.toHaveBeenCalled();
});

it("never exposes Memory or Knowledge tools to the released model", () => {
  const names = ["list_memories", "inspect_owner_knowledge", "get_knowledge", "record_fact", "record_preference", "record_observation", "remember", "search_memory"];
  const scoped = externalAlphaPrompt({ ...options(), tools: names.map(name => ({ type: "function" as const, name, inputSchema: {} })) });
  expect(scoped.tools).toEqual([]);
});
