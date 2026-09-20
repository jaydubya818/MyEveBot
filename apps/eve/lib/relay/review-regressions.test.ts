import { beforeEach, describe, expect, it, vi } from "vitest";
import { confirmPublication, publicationStatus } from "./owner.ts";
import { executeExternalWork } from "./work.ts";
import { decideExternalWork, pollRelay } from "./inbox.ts";
import type { FederationStore } from "./store.ts";
import type { Envelope } from "./transport.ts";
const m = vi.hoisted(() => ({
  owner: vi.fn(),
  command: vi.fn(),
  model: vi.fn(),
  prices: vi.fn(),
  record: vi.fn(),
  transition: vi.fn(),
  decide: vi.fn(),
  consume: vi.fn(),
}));
vi.mock("./client.ts", () => ({
  RelayClient: class {
    owner = m.owner;
    command = m.command;
  },
  relayOrigin: vi.fn(),
  connectRelayOwner: vi.fn(),
}));
vi.mock("../knowledge.ts", () => ({ getKnowledge: vi.fn() }));
vi.mock("../agents.ts", () => ({
  getAgent: async () => ({
    id: "sofie",
    status: "active",
    limits: { maxRuntimeSeconds: 600, maxEstimatedCostUsd: 1 },
  }),
}));
vi.mock("ai", () => ({
  generateText: m.model,
  gateway: Object.assign(vi.fn(), { getAvailableModels: m.prices }),
}));
vi.mock("../task-runs.ts", () => ({
  createDelegatedTask: vi.fn(),
  completeDelegatedTask: vi.fn(),
  recordTaskModelStep: m.record,
  transitionTask: m.transition,
}));
vi.mock("../approvals.ts", () => ({ decideApproval: m.decide }));
vi.mock("./transport.ts", async (original) => ({
  ...(await original<object>()),
  encryptSecret: (_: unknown, v: unknown) => v,
  decryptSecret: (_: unknown, v: unknown) => v,
}));
// Isolate orchestration after the real gateway boundary. The separate authority
// regression tests exercise actual handle consumption and forged-handle refusal.
vi.mock("../action-gateway.ts", () => ({
  consumeActionAuthority: m.consume,
  localAuthorityProvider: { evaluate: vi.fn() },
  ActionBlocked: class extends Error {},
  ActionGateway: class {
    async execute(action: any, adapter: any) {
      return {
        receipt: await adapter.execute(action.parameters, {}),
        actionId: "action",
      };
    }
  },
}));
const envelope = (): Envelope =>
  ({
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
      expectedOutput: "Summary",
      context: ["source"],
      deadline: new Date(Date.now() + 600000).toISOString(),
      budget: {
        delegatedWorkers: 0,
        runtimeSeconds: 60,
        modelSteps: 1,
        cost: "0.1",
      },
    },
  }) as Envelope;
beforeEach(() => {
  vi.clearAllMocks();
  m.prices.mockResolvedValue({
    models: [
      {
        id: "anthropic/claude-sonnet-5",
        pricing: { input: "0.000003", output: "0.000015" },
      },
    ],
  });
  m.model.mockResolvedValue({
    text: "Evidence [source]",
    providerMetadata: { gateway: { cost: "0.02" } },
    response: { id: "receipt" },
  });
  m.command.mockResolvedValue({ deliveries: [] });
});
describe("publication confirmation races", () => {
  it.each(["PAUSED", "REVOKED"] as const)(
    "preserves concurrent %s even when remote status fails",
    async (status) => {
      let state = "draft";
      let release!: () => void;
      let publishing!: () => void;
      const entered = new Promise<void>((resolve) => (publishing = resolve));
      m.owner.mockImplementation(async ({ operation }) => {
        if (operation === "publish") {
          publishing();
          await new Promise<void>((resolve) => (release = resolve));
          return { viewId: "view", version: 1 };
        }
        throw new Error("not created yet");
      });
      const activity = vi.fn();
      const store = {
        ownerId: "jay",
        connection: async () => ({}),
        activity,
        database: {
          query: async (sql: string, args: any[]) => {
            if (sql.startsWith("SELECT *"))
              return [{ document: {}, visibility: "SHARED" }];
            if (sql.startsWith("SELECT record")) return [];
            if (sql.includes("SET status='sync_required'")) {
              state = "sync_required";
              return [{ id: "view" }];
            }
            if (sql.includes("SET status=$3")) {
              state = args[2];
              return [{ relay_view_id: "view" }];
            }
            if (sql.includes("SET status='active'")) {
              if (
                sql.includes("AND status='sync_required'") &&
                state !== "sync_required"
              )
                return [];
              state = "active";
              return [{ id: "view" }];
            }
            return [];
          },
        },
      } as unknown as FederationStore;
      const confirmation = confirmPublication(store, "view", "hash");
      await entered;
      await expect(publicationStatus(store, "view", status)).rejects.toThrow(
        "not created",
      );
      release();
      await expect(confirmation).rejects.toThrow(
        "local access remains disabled",
      );
      expect(state).toBe(status.toLowerCase());
      expect(activity).not.toHaveBeenCalled();
    },
  );
});
function workStore(initial = "awaiting_approval") {
  let state = initial;
  m.transition.mockImplementation(async () => {
    state = "running";
  });
  m.record.mockImplementation(async () => {
    expect(state).toBe("running");
  });
  return {
    ownerId: "jay",
    connection: async () => ({
      localAgentId: "sofie",
      localWorkPolicy: { analysis: "approval" },
      ownerId: "jay",
      agentId: "sofie",
    }),
    activity: vi.fn(),
    database: {
      query: async (sql: string) =>
        sql.includes("SELECT a.*")
          ? [
              {
                content_encrypted: "Published context",
                metadata: { checksum: "hash" },
              },
            ]
          : sql.includes("SELECT status")
            ? [{ status: state }]
            : [{ local_run_id: "run" }],
    },
  } as unknown as FederationStore;
}
describe("paid work admission and accounting", () => {
  it("records usage after resuming an approved Run", async () => {
    await expect(
      executeExternalWork(workStore(), envelope(), vi.fn()),
    ).resolves.toMatchObject({ status: "COMPLETED" });
    expect(m.transition).toHaveBeenCalled();
    expect(m.record).toHaveBeenCalledWith("relay-session-request", 0.02);
  });
  it("denies tiny budgets before paid execution", async () => {
    const e = envelope();
    (e.payload as any).budget.cost = "0.000000001";
    await expect(executeExternalWork(workStore(), e, vi.fn())).rejects.toThrow(
      "estimated call",
    );
    expect(m.model).not.toHaveBeenCalled();
  });
  it("denies missing pricing before paid execution", async () => {
    m.prices.mockResolvedValue({ models: [] });
    await expect(
      executeExternalWork(workStore(), envelope(), vi.fn()),
    ).rejects.toThrow("pricing unavailable");
    expect(m.model).not.toHaveBeenCalled();
  });
  it.each([
    { text: "no citation", cost: "0.02" },
    { text: "[source]", cost: "0.2" },
  ])(
    "records incurred usage for rejected output %j",
    async ({ text, cost }) => {
      m.model.mockResolvedValue({
        text,
        providerMetadata: { gateway: { cost } },
        response: { id: "receipt" },
      });
      await expect(
        executeExternalWork(workStore(), envelope(), vi.fn()),
      ).rejects.toThrow();
      expect(m.record).toHaveBeenCalledWith(
        "relay-session-request",
        Number(cost),
      );
    },
  );
});
describe("work expiration after pricing lookup", () => {
  it("never invokes the provider if pricing arrives after expiry", async () => {
    const e = envelope();
    m.prices.mockImplementationOnce(async () => {
      e.expiresAt = new Date(Date.now() - 1000).toISOString();
      return {
        models: [
          {
            id: "anthropic/claude-sonnet-5",
            pricing: { input: "0.000003", output: "0.000015" },
          },
        ],
      };
    });
    await expect(executeExternalWork(workStore(), e, vi.fn())).rejects.toThrow(
      "Work expired",
    );
    expect(m.model).not.toHaveBeenCalled();
  });
});
describe("exact Approval Center reconciliation", () => {
  function store(status: string) {
    return {
      ownerId: "jay",
      connection: async () => ({}),
      purge: vi.fn(),
      begin: vi.fn().mockResolvedValue(null),
      database: {
        query: vi.fn(async (sql: string) =>
          sql.includes("SELECT * FROM myeve_relay_requests")
            ? [{ local_run_id: "run", envelope_encrypted: envelope() }]
            : sql.includes("SELECT p.id")
              ? [{ id: "approval", binding_hash: "binding", status }]
              : sql.includes("SELECT r.request_id")
                ? [{ request_id: "request", status }]
                : sql.includes("SET state='accepted'")
                  ? [{ request_id: "request" }]
                  : [],
        ),
      },
    } as unknown as FederationStore;
  }
  it("resumes an existing approved exact action without deciding twice", async () => {
    const s = store("approved");
    await decideExternalWork(s, "request", true);
    expect(m.decide).not.toHaveBeenCalled();
    expect(s.begin).toHaveBeenCalledWith("request");
  });
  it("does not override an existing denial", async () => {
    const s = store("denied");
    await expect(decideExternalWork(s, "request", true)).rejects.toThrow(
      "does not match",
    );
    expect(s.begin).not.toHaveBeenCalled();
  });
  it("poll resumes untouched accepted claims after a crash", async () => {
    const s = store("approved");
    vi.mocked(s.database.query).mockImplementation(async (sql: string) =>
      sql.includes("state='accepted'") && sql.startsWith("SELECT")
        ? [{ envelope_encrypted: envelope() }]
        : [],
    );
    await pollRelay(s);
    expect(s.begin).toHaveBeenCalledWith("request");
  });
  it("poll reconciles canonical approvals after restart", async () => {
    const s = store("approved");
    await pollRelay(s);
    expect(s.begin).toHaveBeenCalledWith("request");
    expect(m.decide).not.toHaveBeenCalled();
  });
});
