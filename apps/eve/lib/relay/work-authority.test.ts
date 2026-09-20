import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionGateway, ActionBlocked, localAuthorityProvider, type AuthorityProvider } from "../action-gateway.ts";
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
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });
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


describe("Federation preserves current local Action Gateway decisions", () => {
  it.each(["ALLOW", "REQUIRE_APPROVAL", "DENY"] as const)(
    "Relay work admission cannot upgrade local %s", async (decision) => {
      vi.spyOn(localAuthorityProvider, "evaluate").mockResolvedValue({decision,source:"local-fixture",reason:"current owner policy"});
      const execute=vi.spyOn(ActionGateway.prototype,"execute").mockImplementation(async function(this:ActionGateway,action,adapter) {
        expect(action.trigger).toEqual({kind:"relay_request",id:"matrix-request"});
        expect(action.occurrence).toBeUndefined();
        // Exercise the actual authority wrapper passed by executeExternalWork.
        const authority=(this as unknown as {authority:AuthorityProvider}).authority;
        const target=await adapter.resolveTarget(action.parameters);
        const result=await authority.evaluate(action,target);
        expect(result.decision).toBe(decision);
        expect(localAuthorityProvider.evaluate).toHaveBeenCalledWith(action,target,expect.objectContaining({allowedCapabilities:["files.read"],maximumRisk:"low"}));
        throw new ActionBlocked(result.decision==="REQUIRE_APPROVAL"?"awaiting_approval":"denied","fixture");
      });
      const store={ownerId:"jay",connection:async()=>({localAgentId:"local-sofie",localWorkPolicy:{analysis:"accept"}}),database:{query:async(sql:string)=>sql.includes("SELECT a.*")?[{content_encrypted:"fixture",metadata:{checksum:"fixture"}}]:[{local_run_id:"run"}]}} as unknown as FederationStore;
      const envelope={id:"matrix-request",target:{address:"relay://jay/sofie"},resource:"analysis",capability:"work.request",idempotencyKey:"matrix-request",expiresAt:new Date(Date.now()+600000).toISOString(),caller:{ownerId:"external",agentId:"agent"},payload:{category:"analysis",task:"Analyze source",expectedOutput:"Summary",context:["source"],deadline:new Date(Date.now()+600000).toISOString(),budget:{delegatedWorkers:0,runtimeSeconds:60,modelSteps:1,cost:"0.1"}}} as Envelope;
      const before=vi.fn();
      const result=await executeExternalWork(store,envelope,before);
      expect(result.status).toBe(decision==="REQUIRE_APPROVAL"?"REQUIRE_APPROVAL":"REJECTED");
      expect(execute).toHaveBeenCalledOnce();expect(before).not.toHaveBeenCalled();expect(mocks.model).not.toHaveBeenCalled();
    },
  );
});
