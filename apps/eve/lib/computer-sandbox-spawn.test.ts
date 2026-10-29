import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  query: vi.fn(), executable: vi.fn(), find: vi.fn(), runCommand: vi.fn(), kill: vi.fn(),
}));
vi.mock("./computer-resource-store.ts", async (load) => ({
  ...await load<typeof import("./computer-resource-store.ts")>(),
  computerResourceEnvironment: () => "synthetic-qualification",
  ComputerResourceStore: class {
    database = { query: fixture.query };
    executable = fixture.executable;
  },
}));
vi.mock("./computer-resource-provider.ts", async (load) => ({
  ...await load<typeof import("./computer-resource-provider.ts")>(),
  findOwnedComputer: fixture.find,
}));
import { computerSandboxBackend } from "./computer-sandbox-backend.ts";

beforeEach(() => {
  vi.clearAllMocks();
  fixture.query.mockResolvedValue([{ id: "synthetic-resource", resource_name: "synthetic-computer" }]);
  fixture.executable.mockResolvedValue(true);
  fixture.find.mockResolvedValue({ status: "running", runCommand: fixture.runCommand });
  fixture.runCommand.mockResolvedValue({
    async *logs() { yield { stream: "stdout", data: "output" }; yield { stream: "stderr", data: "diagnostic" }; },
    wait: async () => ({ exitCode: 0 }), kill: fixture.kill,
  });
});
const reconnect = async () => (await computerSandboxBackend.create({
  sessionKey: "synthetic-session", existingMetadata: { lifecycleId: "synthetic-resource" },
})).session;

describe("Computer sandbox spawn contract", () => {
  it("rejects writable stdin before an executable check or provider command", async () => {
    const session = await reconnect();
    fixture.executable.mockClear();
    const options = { command: "inert test command", stdin: true };
    await expect(session.spawn(options)).rejects.toThrow("writable stdin");
    expect(fixture.executable).not.toHaveBeenCalled();
    expect(fixture.runCommand).not.toHaveBeenCalled();
  });

  it.each([undefined, false])("preserves output streams, wait and kill when stdin=%s", async (stdin) => {
    const session = await reconnect();
    const options = { command: "inert test command", workingDirectory: "/workspace/project", stdin };
    const process = await session.spawn(options);
    expect("stdin" in process).toBe(false);
    expect(fixture.runCommand).toHaveBeenCalledWith(expect.objectContaining({
      cmd: "bash", args: ["-lc", options.command], cwd: options.workingDirectory, detached: true,
    }));
    expect(await new Response(process.stdout).text()).toBe("output");
    expect(await new Response(process.stderr).text()).toBe("diagnostic");
    expect(await process.wait()).toEqual({ exitCode: 0 });
    await process.kill();
    expect(fixture.kill).toHaveBeenCalledTimes(1);
  });

  it("still fences output-only commands when the cached resource is no longer executable", async () => {
    const session = await reconnect();
    fixture.executable.mockResolvedValue(false);
    await expect(session.spawn({ command: "inert test command" })).rejects.toThrow("no longer executable");
    expect(fixture.runCommand).not.toHaveBeenCalled();
  });
});
