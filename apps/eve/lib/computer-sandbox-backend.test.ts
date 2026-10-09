import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ create: vi.fn(), provider: undefined as any }));
vi.mock("@vercel/sandbox", async (load) => ({
  ...await load<typeof import("@vercel/sandbox")>(),
  Sandbox: { create: fixture.create },
}));
vi.mock("eve/sandbox/provider", async (load) => {
  const actual = await load<typeof import("eve/sandbox/provider")>();
  return { ...actual, defineSandboxProvider(definition: any) {
    fixture.provider = definition.environment();
    return actual.defineSandboxProvider(definition);
  } };
});
import { computerSandboxBackend, withPreparedComputer } from "./computer-sandbox-backend.ts";
import type { AuthorizedAction } from "./action-gateway.ts";
import type { Preparation } from "./computer-template-lifecycle.ts";

beforeEach(() => { vi.restoreAllMocks(); fixture.create.mockClear(); });
describe("Computer backend authority", () => {
  it("prepares compiled workspace and skills without creating provider resources", async () => {
    const artifact = await fixture.provider.prepare({ resources: {
      workspace: { targetPath: "/workspace", files: [{ relativePath: "seed.txt", content: "seed" }] },
      skills: { targetPath: "$HOME/.agents/skills", files: [{ relativePath: "sample/SKILL.md", content: new Uint8Array([65]) }] },
    } });
    expect(artifact.files).toEqual([
      { path: "/workspace/seed.txt", base64: Buffer.from("seed").toString("base64") },
      { path: "$HOME/.agents/skills/sample/SKILL.md", base64: "QQ==" },
    ]);
    expect(fixture.create).not.toHaveBeenCalled();
  });
  it("denies new provider sessions and forged prepared contexts without Gateway authority", async () => {
    const input = { sessionKey: "test" };
    await expect(fixture.provider.start({ session: { id: "test" } }, undefined, { files: [] })).rejects.toThrow("Gateway authority");
    const authority = { capabilityId: "computer.session.create", expiresAt: Date.now() + 10000, target: {}, idempotencyKey: "forged" } as AuthorizedAction;
    await expect(withPreparedComputer({ state: "READY" } as Preparation, authority, {}, () => computerSandboxBackend.create(input))).rejects.toThrow();
    expect(fixture.create).not.toHaveBeenCalled();
  });
  it("materializes new-session resources once, restores exact identity, and retains governed cleanup", async () => {
    const sandbox = { run: vi.fn(async () => ({ exitCode: 0, stdout: "/home/test", stderr: "" })), writeBinaryFile: vi.fn() };
    const useSessionFn = vi.fn(async () => sandbox);
    const create = vi.spyOn(computerSandboxBackend, "create").mockResolvedValue({
      session: sandbox, useSessionFn, captureState: async () => ({ metadata: { lifecycleId: "resource-1" } }),
    } as any);
    const context = { session: { id: "session-1" } };
    const artifact = { files: [{ path: "$HOME/.agents/skills/sample/SKILL.md", base64: "QQ==" }] };
    const opened = await fixture.provider.start(context, { networkPolicy: "deny-all" }, artifact);
    expect(create).toHaveBeenCalledWith({ sessionKey: "session-1" });
    expect(useSessionFn).toHaveBeenCalledWith({ networkPolicy: "deny-all" });
    expect(sandbox.writeBinaryFile).toHaveBeenCalledWith({ path: "/home/test/.agents/skills/sample/SKILL.md", content: Buffer.from("A") });
    expect(opened.state).toEqual({ lifecycleId: "resource-1" });
    const resumed = await fixture.provider.resume(context, artifact, opened.state);
    expect(create).toHaveBeenLastCalledWith({ sessionKey: "session-1", existingMetadata: { lifecycleId: "resource-1" } });
    expect(sandbox.writeBinaryFile).toHaveBeenCalledTimes(1);
    expect(resumed.sandbox).toBe(sandbox);
    await expect(resumed.onRuntimeShutdown()).resolves.toBeUndefined();
    await expect(resumed.onSessionStop()).rejects.toThrow("governed Computer lifecycle");
    await expect(resumed.onSessionDelete()).rejects.toThrow("governed Computer lifecycle");
  });
  it("does not recreate a missing or fenced resumed resource", async () => {
    const create = vi.spyOn(computerSandboxBackend, "create").mockRejectedValue(new Error("Computer reconnect is fenced."));
    await expect(fixture.provider.resume({ session: { id: "session-1" } }, { files: [] }, { lifecycleId: "fenced" })).rejects.toThrow("fenced");
    expect(create).toHaveBeenCalledTimes(1);
    expect(fixture.create).not.toHaveBeenCalled();
  });
});
