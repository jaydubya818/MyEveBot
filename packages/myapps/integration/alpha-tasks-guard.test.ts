import { afterEach, expect, it, vi } from "vitest";
import { composeLocalAlphaTasks } from "../../../apps/eve/lib/myapps/alpha-tasks-host.ts";
import { alphaTasksCommands } from "../../../apps/eve/lib/myapps/alpha-tasks-api.ts";
// @ts-ignore Public synthetic source/profile fixture.
import { fixture } from "../test/alpha-tasks/fixtures.mjs";
const f = fixture(),
  local = { NODE_ENV: "test", MYAPPS_LOCAL_INTEGRATION: "1" };
const input = {
  runtimeId: "synthetic",
  target: "offline",
  installationId: "synthetic",
  agentId: "synthetic",
  custody: {} as any,
  profiles: [f.runtime],
  source: async () => f.closure,
  env: local,
};
afterEach(() => vi.unstubAllEnvs());
it.each(["production", "hosted"] as const)(
  "the real %s host cannot be bypassed by a caller-supplied local env",
  (mode) => {
    vi.stubEnv("NODE_ENV", mode === "production" ? "production" : "test");
    vi.stubEnv("VERCEL", mode === "hosted" ? "1" : "");
    expect(() => composeLocalAlphaTasks({} as any, input)).toThrow(
      "APP_PRODUCTION_DISABLED",
    );
  },
);
it("disabled local composition fails before touching custody or candidate source", () => {
  expect(() =>
    composeLocalAlphaTasks({} as any, { ...input, env: { NODE_ENV: "test" } }),
  ).toThrow("APP_PRODUCTION_DISABLED");
});
it("the shared command adapter accepts no body-authored principal, descriptor, execution command or install approval", async () => {
  const dispatch = alphaTasksCommands({} as any),
    p = {
      ownerId: "owner",
      actorId: "owner",
      kind: "human" as const,
      allowedOperations: [],
    };
  for (const input of [
    { operation: "list", appId: f.pkg.appId, principal: p },
    { operation: "prepare", appId: f.pkg.appId, package: f.pkg },
    { operation: "exec", appId: f.pkg.appId, input: { command: "anything" } },
    { operation: "install", appId: f.pkg.appId, approved: true },
  ])
    await expect(dispatch(p, input)).rejects.toThrow();
});
