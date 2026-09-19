import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionGateway } from "../action-gateway.ts";
import { executeExternalWork } from "./work.ts";
import type { FederationStore } from "./store.ts";
import type { Envelope } from "./transport.ts";
const mocks = vi.hoisted(() => ({ model: vi.fn() }));
vi.mock("ai", () => ({
  generateText: mocks.model,
  gateway: Object.assign(vi.fn(), {
    getAvailableModels: async () => ({
      models: [
        {
          id: "anthropic/claude-sonnet-5",
          pricing: { input: "0.000003", output: "0.000015" },
        },
      ],
    }),
  }),
}));
vi.mock("../agents.ts", () => ({
  getAgent: async () => ({
    id: "local-sofie",
    status: "active",
    limits: { maxRuntimeSeconds: 600, maxEstimatedCostUsd: 1 },
  }),
}));
vi.mock("./transport.ts", async (original) => ({
  ...(await original<object>()),
  decryptSecret: () => "Published source context",
  encryptSecret: () => "encrypted",
}));
afterEach(() => vi.restoreAllMocks());
describe("federated model executor authority boundary", () => {
  it("rejects a forged gateway handle before Relay acceptance or model invocation", async () => {
    const before = vi.fn();
    mocks.model.mockRejectedValue(new Error("model must not be reached"));
    vi.spyOn(ActionGateway.prototype, "execute").mockImplementation(
      async (action, adapter) => {
        return adapter.execute(action.parameters, {
          idempotencyKey: "forged",
          authorityId: "forged",
          executor: action.executor,
          expiresAt: Date.now() + 30000,
          target: await adapter.resolveTarget(action.parameters),
          capabilityId: action.capabilityId,
        }) as never;
      },
    );
    const store = {
      ownerId: "jay",
      connection: async () => ({
        localAgentId: "local-sofie",
        localWorkPolicy: { analysis: "accept" },
      }),
      database: {
        query: async (sql: string) =>
          sql.includes("SELECT a.*")
            ? [
                {
                  content_encrypted: "encrypted",
                  metadata: { checksum: "sha256:source" },
                },
              ]
            : [{ local_run_id: "local-run" }],
      },
    } as unknown as FederationStore;
    const envelope = {
      id: "request",
      target: { address: "relay://jay/sofie" },
      resource: "analysis",
      capability: "work.request",
      idempotencyKey: "work-one",
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      caller: { ownerId: "sarah", agentId: "ava" },
      payload: {
        category: "analysis",
        task: "Analyze the source",
        expectedOutput: "A brief summary",
        context: ["source-request"],
        deadline: new Date(Date.now() + 600000).toISOString(),
        budget: {
          delegatedWorkers: 0,
          runtimeSeconds: 60,
          modelSteps: 1,
          cost: "0.1",
        },
      },
    } as Envelope;
    await expect(
      executeExternalWork(store, envelope, before),
    ).resolves.toMatchObject({
      status: "REJECTED",
      reason: "MYEVE_ACTION_GATEWAY_DENIED",
    });
    expect(before).not.toHaveBeenCalled();
    expect(mocks.model).not.toHaveBeenCalled();
  });
});
