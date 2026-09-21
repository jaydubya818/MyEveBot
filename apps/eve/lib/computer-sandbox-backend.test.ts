import { describe, expect, it, vi } from "vitest";
const create = vi.hoisted(() => vi.fn());
vi.mock("eve/sandbox/vercel", () => ({ vercel: () => ({ create }) }));
import { computerSandboxBackend, withPreparedComputer } from "./computer-sandbox-backend.ts";
import type { AuthorizedAction } from "./action-gateway.ts";
import type { Preparation } from "./computer-template-lifecycle.ts";

describe("Computer backend authority", () => {
  it("build-time discovery is resource free", async () => {
    await computerSandboxBackend.prewarm({ templateKey: "test", runtimeContext: { appRoot: "." }, seedFiles: [] });
    expect(create).not.toHaveBeenCalled();
  });
  it("denies direct getSandbox and forged prepared contexts", async () => {
    const input = { templateKey: null, sessionKey: "test", runtimeContext: { appRoot: "." } };
    await expect(computerSandboxBackend.create(input)).rejects.toThrow("Gateway authority");
    const authority = { capabilityId: "computer.session.create", expiresAt: Date.now() + 10000, target: {}, idempotencyKey: "forged" } as AuthorizedAction;
    await expect(withPreparedComputer({ state: "READY" } as Preparation, authority, {}, () => computerSandboxBackend.create(input))).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
});
