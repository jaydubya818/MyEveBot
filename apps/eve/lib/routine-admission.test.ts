import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  evaluateRoutineAdmission,
  snapshotRoutineConfiguration,
  type AdmissionDependencies,
  type AdmissionSubject,
} from "./routine-admission.ts";
import { routineConfigurationSchema } from "./execution-types.ts";
import { getCapability } from "./capability-registry.ts";
import { capabilityAvailability } from "./routine-availability.ts";
import { INITIAL_ROUTINES, ROUTINE_TOOLS } from "./routine-capabilities.ts";
import { effectiveCapability } from "./agents.ts";
import type { AgentView } from "./agents.ts";
let deps: AdmissionDependencies;
const subject = (
  required = [
    "tool.list_goals",
    "tool.search_knowledge",
    "tool.record_observation",
  ],
): AdmissionSubject => ({
  ownerId: "sarah",
  id: "daily",
  version: 1,
  status: "active",
  approved: true,
  agentId: "ava",
  configuration: snapshotRoutineConfiguration(
    routineConfigurationSchema.parse({
      instructions: "Prepare owner review",
      authority: { allowedCapabilities: required, maximumRisk: "high" },
      deliveryChannel: "telegram",
    }),
  ),
});
beforeEach(() => {
  deps = {
    agent: vi.fn(
      async () =>
        ({
          id: "ava",
          ownerId: "sarah",
          status: "active",
          limits: {
            maxSteps: 100,
            maxRuntimeSeconds: 3600,
            maxEstimatedCostUsd: 10,
          },
        }) as AgentView,
    ),
    capability: (id) => {
      const c = getCapability(id, {
        NODE_ENV: "test",
        DATABASE_URL: "fixture",
      });
      return c
        ? { ...c, availability: { status: "available", configured: true } }
        : undefined;
    },
    permission: () => true,
    availability: vi.fn(async () => ({ status: "AVAILABLE" as const })),
    executionEnabled: () => true,
  };
});
describe("capability-aware Routine admission", () => {
  it("admits only the explicit reviewed ceiling; optional delivery can degrade", async () => {
    deps.availability = async (i) =>
      i.capability.id === "notification.send"
        ? { status: "UNAVAILABLE", reasonCode: "provider_missing" }
        : { status: "AVAILABLE" };
    const r = await evaluateRoutineAdmission(subject(), deps);
    expect(r.state).toBe("READY");
    expect(r.optionalUnavailable).toBe(1);
    expect(r.canRun).toBe(true);
  });
  it("requires the optional delivery fallback to be explicit in the reviewed manifest", async () => {
    const s = subject();
    s.configuration.manifest!.optional = [];
    expect(
      (await evaluateRoutineAdmission(s, deps)).issues.some(
        (i) => i.code === "manifest_invalid",
      ),
    ).toBe(true);
  });
  it("separates missing email configuration from exact-action approval", async () => {
    deps.availability = async () => ({
      status: "UNAVAILABLE",
      reasonCode: "account_missing",
    });
    const s = subject(["tool.send_email"]);
    s.configuration.authority.requiresApprovalFor = ["tool.send_email"];
    const r = await evaluateRoutineAdmission(s, deps);
    expect(r.state).toBe("NEEDS_CONFIGURATION");
    expect(r.capabilities[0].permission).toBe("REQUIRE_APPROVAL");
    expect(r.canRun).toBe(false);
  });
  it.each([
    "provider_missing",
    "account_missing",
    "dependency_unavailable",
  ] as const)("fails required %s before execution", async (reasonCode) => {
    deps.availability = async () => ({ status: "UNAVAILABLE", reasonCode });
    expect((await evaluateRoutineAdmission(subject(), deps)).state).toBe(
      "NEEDS_CONFIGURATION",
    );
  });
  it.each([
    "provider_unqualified",
    "profile_grant_missing",
    "federation_disabled",
  ] as const)("blocks %s", async (reasonCode) => {
    deps.availability = async () => ({ status: "UNQUALIFIED", reasonCode });
    expect((await evaluateRoutineAdmission(subject(), deps)).state).toBe(
      "BLOCKED",
    );
  });
  it.each(["paused", "disabled", "archived"])(
    "honors lifecycle %s",
    async (status) => {
      expect(
        (await evaluateRoutineAdmission({ ...subject(), status }, deps)).state,
      ).toBe("DISABLED");
    },
  );
  it("preserves auto-pause independently from configuration failure", async () => {
    expect(
      (
        await evaluateRoutineAdmission(
          { ...subject(), status: "auto_paused" },
          deps,
        )
      ).state,
    ).toBe("AUTO_PAUSED");
  });
  it("requires manifest review for legacy versions", async () => {
    const s = subject();
    delete s.configuration.manifest;
    expect((await evaluateRoutineAdmission(s, deps)).state).toBe(
      "NEEDS_APPROVAL",
    );
  });
  it("does not let new approval satisfy an old occurrence", async () => {
    expect(
      (
        await evaluateRoutineAdmission(
          { ...subject(), expectedVersion: 2 },
          deps,
        )
      ).state,
    ).toBe("BLOCKED");
  });
  it("does not let connected providers grant Agent authority", async () => {
    deps.permission = () => false;
    expect((await evaluateRoutineAdmission(subject(), deps)).state).toBe(
      "BLOCKED",
    );
  });
  it("isolates owners and inactive Agents", async () => {
    deps.agent = async () =>
      ({ ownerId: "other", status: "active", limits: {} }) as AgentView;
    expect((await evaluateRoutineAdmission(subject(), deps)).state).toBe(
      "BLOCKED",
    );
  });
  it("blocks unknown capabilities and tools", async () => {
    for (const s of [subject(["unknown"]), subject()]) {
      if (s.configuration.manifest!.required[0] !== "unknown")
        s.configuration.manifest!.tools.push("opaque_mcp");
      expect((await evaluateRoutineAdmission(s, deps)).state).toBe("BLOCKED");
    }
  });
  it("rejects expanded Skill/Role/tool manifests without changing the snapshot", async () => {
    const s = subject();
    const original = structuredClone(s);
    s.configuration.manifest!.tools.push("send_email");
    expect((await evaluateRoutineAdmission(s, deps)).state).toBe("BLOCKED");
    expect(original.configuration.authority.allowedCapabilities).not.toContain(
      "tool.send_email",
    );
  });
  it("cannot broaden authority through model/harness or primary identity", async () => {
    const s = subject();
    const baseline = await evaluateRoutineAdmission(s, deps);
    expect(
      (
        await evaluateRoutineAdmission(
          { ...s, ...{ model: "other", harness: "other" } },
          deps,
        )
      ).state,
    ).toBe(baseline.state);
    deps.permission = () => false;
    expect((await evaluateRoutineAdmission(s, deps)).state).toBe("BLOCKED");
  });
  it.each(["capability", "permission", "availability", "agent"] as const)(
    "fails closed when %s lookup throws",
    async (key) => {
      Object.assign(deps, {
        [key]: () => {
          throw new Error("private diagnostic");
        },
      });
      const r = await evaluateRoutineAdmission(subject(), deps);
      expect(r.canRun).toBe(false);
      expect(JSON.stringify(r)).not.toContain("private diagnostic");
    },
  );
  it("reports all blockers deterministically with policy before configuration before review", async () => {
    deps.availability = async () => ({
      status: "UNAVAILABLE",
      reasonCode: "account_missing",
    });
    const r = await evaluateRoutineAdmission(
      { ...subject(), approved: false, spent: 99 },
      deps,
    );
    expect(r.state).toBe("BLOCKED");
    expect(r.issues[0].code).toBe("budget_exceeded");
    expect(r.issues.map((i) => i.code)).toContain("routine_not_approved");
  });
  it("keeps readiness READY while global execution is disabled", async () => {
    deps.executionEnabled = () => false;
    const r = await evaluateRoutineAdmission(subject(), deps);
    expect(r.state).toBe("READY");
    expect(r.canRun).toBe(false);
  });
  it.each([
    "provider",
    "authority",
    "agent",
    "budget",
    "global",
    "profile",
  ] as const)("rechecks %s race using current state", async (cause) => {
    const s = subject();
    expect((await evaluateRoutineAdmission(s, deps)).canRun).toBe(true);
    if (cause === "provider")
      deps.availability = async () => ({
        status: "UNAVAILABLE",
        reasonCode: "account_missing",
      });
    if (cause === "authority") deps.permission = () => false;
    if (cause === "agent") deps.agent = async () => null;
    if (cause === "budget") s.spent = 2;
    if (cause === "global") deps.executionEnabled = () => false;
    if (cause === "profile")
      deps.availability = async () => ({
        status: "MISCONFIGURED",
        reasonCode: "profile_grant_missing",
      });
    expect((await evaluateRoutineAdmission(s, deps)).canRun).toBe(false);
  });
  it("recomputes on reconnect without granting standing authority", async () => {
    const s = subject();
    deps.availability = async () => ({
      status: "UNAVAILABLE",
      reasonCode: "account_missing",
    });
    expect((await evaluateRoutineAdmission(s, deps)).state).toBe(
      "NEEDS_CONFIGURATION",
    );
    deps.availability = async () => ({ status: "AVAILABLE" as const });
    expect(
      (await evaluateRoutineAdmission({ ...s, approved: false }, deps)).state,
    ).toBe("NEEDS_APPROVAL");
  });
});
describe("safe provider metadata", () => {
  const input = (id: string) => ({
    ownerId: "sarah",
    agentId: "ava",
    capability: getCapability(id)!,
    targets: [],
    deliveryChannel: "in_app" as const,
  });
  it("does not treat a credential as an authenticated account", async () => {
    const query = vi.fn(async (sql: string) =>
      sql.includes("to_regclass")
        ? [{ present: true }]
        : [{ configured: true }],
    );
    expect(
      (
        await capabilityAvailability(
          input("tool.send_email"),
          { query },
          { NODE_ENV: "test", MYEVE_OWNER_ID: "sarah" },
        )
      ).reasonCode,
    ).toBe("account_missing");
    expect(query.mock.calls[0][0]).not.toMatch(/SELECT value/i);
  });
  it("does not inspect another owner account", async () => {
    const query = vi.fn();
    expect(
      (
        await capabilityAvailability(
          input("tool.send_email"),
          { query },
          { NODE_ENV: "test", MYEVE_OWNER_ID: "other" },
        )
      ).reasonCode,
    ).toBe("account_missing");
    expect(query).not.toHaveBeenCalled();
  });
  it("does not infer email readiness from Composio credentials", async () => {
    expect(
      (
        await capabilityAvailability(
          input("tool.send_email"),
          { query: async () => [{ configured: false }] },
          {
            NODE_ENV: "test",
            MYEVE_OWNER_ID: "sarah",
            COMPOSIO_API_KEY: "fixture",
          },
        )
      ).status,
    ).toBe("UNAVAILABLE");
  });
  it("supports local delivery without a provider", async () => {
    expect(
      (
        await capabilityAvailability(
          input("notification.send"),
          { query: vi.fn() },
          { NODE_ENV: "test" },
        )
      ).status,
    ).toBe("AVAILABLE");
  });
});

describe("independent provider gates and profile scope", () => {
  it.each(["tool.agentphone", "federation.request"])(
    "keeps %s blocked independently",
    async (id) => {
      const s = subject([id]);
      deps.availability = (i) =>
        capabilityAvailability(i, { query: vi.fn() }, { NODE_ENV: "test" });
      const r = await evaluateRoutineAdmission(s, deps);
      expect(r.state).toBe("BLOCKED");
      expect(
        r.issues.some(
          (i) =>
            i.code ===
            (id === "tool.agentphone"
              ? "provider_unqualified"
              : "federation_disabled"),
        ),
      ).toBe(true);
    },
  );
  it.each([
    [null, "account_missing"],
    [{ status: "ready", granted: false }, "profile_grant_missing"],
    [{ status: "ready", granted: true }, "provider_unqualified"],
  ] as const)(
    "checks profile existence, Agent grant and qualification: %j",
    async (row, reason) => {
      const query = vi.fn(async (_sql: string, _params?: unknown[]) =>
        row ? [row] : [],
      );
      const result = await capabilityAvailability(
        {
          ownerId: "sarah",
          agentId: "ava",
          capability: getCapability("browser.click")!,
          targets: [
            {
              capabilityId: "browser.click",
              provider: "orgo",
              account: "personal",
              resource: "profile",
            },
          ],
          deliveryChannel: "in_app",
        },
        { query },
        { NODE_ENV: "test" },
      );
      expect(result.reasonCode).toBe(reason);
      expect(query.mock.calls[0][1]).toEqual(["sarah", "profile", "ava"]);
    },
  );
});

describe("provider-free local deployment class inventory", () => {
  it.each(Object.entries(INITIAL_ROUTINES))(
    "evaluates %s with canonical availability",
    async (name, tools) => {
      const environment = {
        NODE_ENV: "test" as const,
        DATABASE_URL: "local-fixture",
        MYEVE_OWNER_ID: "sarah",
      };
      const s = subject([
        ...new Set(tools.map((tool) => ROUTINE_TOOLS[tool].capability)),
      ]);
      s.configuration.manifest!.tools = [...tools];
      deps.capability = (id) => getCapability(id, environment) ?? undefined;
      deps.availability = (input) =>
        capabilityAvailability(input, { query: async () => [] }, environment);
      const agent = {
        ...(await deps.agent("sarah", "ava")),
        isPrimary: true,
      } as AgentView;
      deps.agent = async () => agent;
      deps.permission = (current, id) =>
        effectiveCapability(current, id, { checkAvailability: false }).allowed;
      deps.executionEnabled = () => false;
      const r = await evaluateRoutineAdmission(s, deps);
      const expected = name.includes("Follow-Up")
        ? "NEEDS_CONFIGURATION"
        : name === "Campaign Performance Review"
          ? "BLOCKED"
          : "READY";
      expect(r.state).toBe(expected);
      expect(r.canRun).toBe(false);
      expect(r.optionalUnavailable).toBe(1);
      if (name === "External Follow-Up Send")
        expect(
          r.capabilities.find((c) => c.id === "tool.send_email")?.permission,
        ).toBe("REQUIRE_APPROVAL");
    },
  );
});

it("rejects an unknown explicitly selected provider before execution", async () => {
  const s = subject();
  s.configuration.authority.allowedTargets = [
    {
      capabilityId: "tool.list_goals",
      provider: "unknown-provider",
      account: "sarah",
      resource: "goals",
    },
  ];
  deps.availability = (input) =>
    capabilityAvailability(input, { query: vi.fn() }, { NODE_ENV: "test" });
  const r = await evaluateRoutineAdmission(s, deps);
  expect(r.state).toBe("NEEDS_CONFIGURATION");
  expect(r.canRun).toBe(false);
  expect(r.issues.some((issue) => issue.code === "provider_missing")).toBe(
    true,
  );
});
