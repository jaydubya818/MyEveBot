import { afterEach, expect, it, vi } from "vitest";
import work from "./engineering_work.ts";
import direct from "./engineering_direct.ts";
import { checkCapabilityAvailability } from "../../lib/capability-registry.ts";
afterEach(() => vi.unstubAllEnvs());
const ctx = () => ({
  session: {
    id: "test",
    auth: {
      current: {
        principalId: "owner",
        principalType: "user",
        attributes: {
          owner: "true",
          myeveEngineeringIntent: "continue",
          myeveEngineeringWorkId: "11111111-1111-4111-8111-111111111111",
        },
      },
    },
  },
});
function enabled() {
  vi.stubEnv("MYEVE_ENGINEERING_MODE", "dogfood");
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("DATABASE_URL", "postgres://unused");
  vi.stubEnv("MYEVE_ENGINEERING_CONFIG", "/tmp/unused");
}
for (const [name, definition] of [
  ["engineering_work", work],
  ["engineering_direct", direct],
] as const) {
  it(`${name} is available only in configured isolated mode`, async () => {
    enabled();
    expect(checkCapabilityAvailability("tool." + name)?.status).toBe(
      "available",
    );
    const tool = (await definition.events["step.started"]!(
      {},
      ctx() as never,
    )) as any;
    expect(tool).toBeTruthy();
    expect(tool.availableInSubagents).toBe(false);
    vi.stubEnv("VERCEL_ENV", "production");
    expect(
      await definition.events["step.started"]!({}, ctx() as never),
    ).toBeNull();
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("MYEVE_ENGINEERING_MODE", "");
    expect(
      await definition.events["step.started"]!({}, ctx() as never),
    ).toBeNull();
  });
  it(`${name} rejects unauthenticated discovery and execution`, async () => {
    enabled();
    const context = ctx();
    const tool = (await definition.events["step.started"]!(
      {},
      context as never,
    )) as any;
    const anonymous = { session: { id: "test", auth: { current: null } } };
    expect(
      await definition.events["step.started"]!({}, anonymous as never),
    ).toBeNull();
    await expect(
      tool.execute(
        name === "engineering_work"
          ? { operation: "list" }
          : { request: { operation: "inspect" } },
        anonymous,
      ),
    ).rejects.toThrow();
  });
  it(`${name} rejects switched owners and unsupported operations before effects`, async () => {
    enabled();
    const context = ctx();
    const tool = (await definition.events["step.started"]!(
      {},
      context as never,
    )) as any;
    const other = ctx();
    other.session.auth.current.principalId = "other";
    await expect(
      tool.execute(
        name === "engineering_work"
          ? { operation: "list" }
          : { request: { operation: "inspect" } },
        other,
      ),
    ).rejects.toThrow();
    expect(
      tool.inputSchema.safeParse(
        name === "engineering_work"
          ? { operation: "publish" }
          : { request: { operation: "publish" } },
      ).success,
    ).toBe(false);
  });
}
it("direct execution rejects a different selected Work before binding or effects", async () => {
  enabled();
  const context = ctx();
  const tool = (await direct.events["step.started"]!(
    {},
    context as never,
  )) as any;
  const other = ctx();
  other.session.auth.current.attributes.myeveEngineeringWorkId =
    "22222222-2222-4222-8222-222222222222";
  await expect(
    tool.execute({ request: { operation: "write" } }, other),
  ).rejects.toThrow();
});

it("tool discovery cannot preserve availability after runtime disablement", async () => {
  enabled();
  for (const [name, definition] of [
    ["engineering_work", work],
    ["engineering_direct", direct],
  ] as const) {
    vi.stubEnv("VERCEL_ENV", "preview");
    const context = ctx();
    const tool = (await definition.events["step.started"]!(
      {},
      context as never,
    )) as any;
    vi.stubEnv("VERCEL_ENV", "production");
    await expect(
      tool.execute(
        name === "engineering_work"
          ? { operation: "list" }
          : { request: { operation: "inspect" } },
        context,
      ),
    ).rejects.toThrow();
  }
});
