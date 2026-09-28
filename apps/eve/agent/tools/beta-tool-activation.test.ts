import { afterEach, expect, it, vi } from "vitest";
import work from "./engineering_work.ts";
import direct from "./engineering_direct.ts";
import { checkCapabilityAvailability } from "../../lib/capability-registry.ts";
afterEach(() => vi.unstubAllEnvs());
it("prepared beta tools remain unavailable even for primary owner dogfood sessions", async () => {
  vi.stubEnv("MYEVE_ENGINEERING_MODE", "dogfood");
  vi.stubEnv("DATABASE_URL", "postgres://unused");
  vi.stubEnv("MYEVE_ENGINEERING_CONFIG", "/tmp/unused");
  const ctx = {
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
  };
  for (const [name, tool] of [
    ["engineering_work", work],
    ["engineering_direct", direct],
  ] as const) {
    expect(checkCapabilityAvailability("tool." + name)?.status).toBe(
      "disabled",
    );
    expect(await tool.events["step.started"]!({}, ctx as never)).toBeNull();
  }
});
