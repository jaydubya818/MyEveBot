import { afterEach, describe, expect, it, vi } from "vitest";

import instructions from "../instructions/local-computer";

function resolveInstructions() {
  const resolve = instructions.events["turn.started"]!;
  return resolve({} as never, {session:{auth:{current:{principalId:"owner",attributes:{owner:"true"}}}}} as never);
}

afterEach(() => vi.unstubAllEnvs());

describe("local Mac capability instructions", () => {
  it("explains missing pairing instead of leaving the model to invent an approval flow", async () => {
    vi.stubEnv("SOFIE_LOCAL_DEVICE_ID", "");
    vi.stubEnv("SOFIE_LOCAL_DEVICE_TOKEN", "");
    const result = await resolveInstructions();
    expect(result).toMatchObject({ content: expect.stringContaining("not paired on this deployment") });
    expect(result).toMatchObject({ content: expect.stringContaining("An exact Mac path") });
    expect(result).toMatchObject({ content: expect.stringContaining("not the owner's consent") });
  });

  it("does not treat an incomplete token as a paired bridge", async () => {
    vi.stubEnv("SOFIE_LOCAL_DEVICE_ID", "mac-test");
    vi.stubEnv("SOFIE_LOCAL_DEVICE_TOKEN", "short");
    expect(await resolveInstructions()).toMatchObject({
      content: expect.stringContaining("not paired on this deployment"),
    });
  });

  it("distinguishes configuration from reachability and executor availability", async () => {
    vi.stubEnv("SOFIE_LOCAL_DEVICE_ID", "mac-test");
    vi.stubEnv("SOFIE_LOCAL_DEVICE_TOKEN", "a".repeat(32));
    const result = await resolveInstructions();
    expect(result).toMatchObject({ content: expect.stringContaining("Configuration alone is not proof of connectivity") });
    expect(result).toMatchObject({ content: expect.stringContaining("Every shell command") });
  });
});
