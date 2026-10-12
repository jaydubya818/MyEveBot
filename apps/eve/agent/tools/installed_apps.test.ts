import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  enabled: true,
  owner: "owner-a",
  catalog: vi.fn(),
  operate: vi.fn(),
  sofie: vi.fn(),
}));
vi.mock("eve/tools", () => ({
  defineDynamic: (value: unknown) => value,
  defineTool: (value: unknown) => value,
}));
vi.mock("../../lib/myapps/hosting.ts", () => ({
  localAppsAllowed: () => state.enabled,
  localApps: () => {
    if (!state.enabled) throw Error("APP_UNAVAILABLE");
    return {
      apps: { sofie: state.sofie },
      alphaTasks: { catalog: state.catalog, operate: state.operate },
      policy: async () => ({
        ownerId: state.owner,
        actorId: state.owner,
        kind: "human",
        allowedOperations: [
          "apps.read",
          "apps.run",
          "apps.manage",
          "apps.install",
        ],
      }),
    };
  },
}));
import definition from "./installed_apps.ts";
const context = () => ({
  session: {
    id: "session-a",
    parent: null,
    auth: {
      current: {
        principalType: "user",
        principalId: "owner-a",
        attributes: { owner: "true" },
      },
    },
  },
});
const tool = async (ctx = context()) =>
  (definition as any).events["step.started"]({}, ctx);
const id = "11111111-1111-4111-8111-111111111111",
  appId = "app_" + "a".repeat(32);
beforeEach(() => {
  vi.clearAllMocks();
  state.enabled = true;
  state.owner = "owner-a";
  state.catalog.mockResolvedValue([]);
  state.operate.mockResolvedValue({ status: "COMPLETED" });
});
it("uses the canonical task adapter with the current owner and strips installation permission", async () => {
  const t = await tool(),
    ctx = context();
  const catalog = t.inputSchema.parse({
    profile: "alpha-tasks",
    operation: "catalog",
    requestId: id,
  });
  expect(await t.execute(catalog, ctx)).toEqual({
    result: { apps: [] },
    url: "/apps/installed",
  });
  expect(state.catalog.mock.calls[0][0]).toMatchObject({
    ownerId: "owner-a",
    actorId: "sofie:session-a",
    kind: "agent",
  });
  expect(state.catalog.mock.calls[0][0].allowedOperations).not.toContain(
    "apps.install",
  );
  const command = t.inputSchema.parse({
    profile: "alpha-tasks",
    operation: "create",
    appId,
    version: 3,
    digest: "sha256:" + "b".repeat(64),
    requestId: id,
    input: { title: "Saved through Sofie", priority: "High" },
  });
  await t.execute(command, ctx);
  expect(state.operate.mock.calls[0].slice(1)).toEqual([
    appId,
    3,
    "sha256:" + "b".repeat(64),
    "create",
    { title: "Saved through Sofie", priority: "High" },
    id,
  ]);
});
it("rejects identity changes, role/guest/subagent callers, disabled hosts and foreign policy", async () => {
  const t = await tool(),
    input = t.inputSchema.parse({
      profile: "alpha-tasks",
      operation: "catalog",
      requestId: id,
    });
  for (const changed of [
    { ...context(), session: { ...context().session, parent: "parent" } },
    {
      ...context(),
      session: {
        ...context().session,
        auth: {
          current: {
            ...context().session.auth.current,
            principalId: "foreign",
          },
        },
      },
    },
    {
      ...context(),
      session: {
        ...context().session,
        auth: {
          current: {
            ...context().session.auth.current,
            attributes: { owner: "true", role: "guest" },
          },
        },
      },
    },
    {
      ...context(),
      session: {
        ...context().session,
        auth: {
          current: {
            ...context().session.auth.current,
            attributes: { owner: "true", myeveRoleId: "role" },
          },
        },
      },
    },
  ])
    await expect(t.execute(input, changed)).rejects.toThrow("APP_UNAVAILABLE");
  state.owner = "foreign";
  await expect(t.execute(input, context())).rejects.toThrow("APP_UNAVAILABLE");
  state.enabled = false;
  expect(await tool()).toBe(null);
  await expect(t.execute(input, context())).rejects.toThrow("APP_UNAVAILABLE");
  expect(state.catalog).not.toHaveBeenCalled();
});
it("allows no install decision, arbitrary package or body-authored owner and preserves CRM requests", async () => {
  const t = await tool();
  for (const operation of [
    "install",
    "decideInstall",
    "prepare",
    "exec",
    "setEnabled",
  ])
    expect(() =>
      t.inputSchema.parse({
        profile: "alpha-tasks",
        operation,
        appId,
        requestId: id,
      }),
    ).toThrow();
  expect(() =>
    t.inputSchema.parse({
      profile: "alpha-tasks",
      operation: "catalog",
      requestId: id,
      ownerId: "foreign",
    }),
  ).toThrow();
  state.sofie.mockResolvedValue({ status: "COMPLETED" });
  await t.execute(
    t.inputSchema.parse({ request: "Show me my CRM.", requestId: id }),
    context(),
  );
  expect(state.sofie.mock.calls[0].slice(1)).toEqual([id, "Show me my CRM."]);
});
