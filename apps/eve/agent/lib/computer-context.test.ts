import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ authorize: vi.fn(), provider: vi.fn(), prepare: vi.fn(), create: vi.fn(), order: [] as string[] }));
vi.mock("../../lib/action-gateway.ts", () => ({
  consumeActionAuthority: f.authorize,
  ActionGateway: class { async execute(_request: unknown, adapter: { execute: (parameters: object, authority: object) => Promise<unknown> }) { return adapter.execute({}, {}); } },
}));
vi.mock("../../lib/computer-runtime.ts", () => ({ prepareComputerRuntime: f.prepare }));
vi.mock("../../lib/computer-sandbox-backend.ts", () => ({
  ComputerSandboxAuthorityRequired: class extends Error {},
  bindPreparedComputer: async () => {},
  withPreparedComputer: async (_prepared: unknown, _authority: unknown, _parameters: unknown, work: () => Promise<unknown>) => { await f.provider(); return work(); },
}));
vi.mock("./action-context.ts", () => ({ toolActionRequest: async () => ({ ownerId: "owner", actionKey: "action" }) }));
vi.mock("./session-settings.ts", () => ({ resolveSessionAgent: async () => ({ id: "agent" }) }));
vi.mock("../../lib/computer-sessions.ts", () => ({
  assertComputerCapability: vi.fn(), getComputerSessionForRuntime: async () => null,
  createComputerSession: f.create,
  updateComputerSessionAllowedDomains: async () => ({ id: "session", status: "ready", sandboxId: "sandbox" }),
  transitionComputerSession: vi.fn(),
}));
import { getComputerSandbox, provisionComputerSession } from "./computer-context.ts";
import { ComputerSandboxAuthorityRequired } from "../../lib/computer-sandbox-backend.ts";
import type { ToolContext } from "eve/tools";
const ctx = { session: { id: "runtime", auth: { current: { principalId: "owner", attributes: {} } } }, getSandbox: async () => ({ id: "sandbox", setNetworkPolicy: async () => {} }) } as unknown as ToolContext;
beforeEach(() => {
  vi.resetAllMocks(); f.order.length = 0;
  f.authorize.mockImplementation(async () => { f.order.push("authorize"); });
  f.prepare.mockImplementation(async () => { f.order.push("ready"); return { state: "READY" }; });
  f.provider.mockImplementation(async () => { f.order.push("revalidate"); });
  f.create.mockImplementation(async () => { f.order.push("session"); return { id: "session", status: "provisioning", networkPolicy: {} }; });
});
describe("Computer provisioning ordering", () => {
  it("prepares then revalidates before creating a session", async () => {
    await provisionComputerSession(ctx); expect(f.order).toEqual(["authorize", "ready", "revalidate", "session"]);
  });
  it.each(["unauthorized", "budget_denied", "missing_grant"])("%s fails before preparation", async reason => {
    f.authorize.mockRejectedValue(new Error(reason));
    await expect(provisionComputerSession(ctx)).rejects.toThrow(reason); expect(f.prepare).not.toHaveBeenCalled(); expect(f.create).not.toHaveBeenCalled();
  });
  it("preparation failure creates no session", async () => {
    f.prepare.mockRejectedValue(new Error("safe preparation failure"));
    await expect(provisionComputerSession(ctx)).rejects.toThrow(); expect(f.create).not.toHaveBeenCalled();
  });
  it("revocation during preparation creates no session", async () => {
    f.provider.mockRejectedValue(new Error("revoked"));
    await expect(provisionComputerSession(ctx)).rejects.toThrow("revoked"); expect(f.create).not.toHaveBeenCalled();
  });
  it("reopens a handle across steps through fresh Gateway provisioning", async () => {
    const sandbox = { id: "sandbox", setNetworkPolicy: async () => {} };
    const getSandbox = vi.fn().mockRejectedValueOnce(new ComputerSandboxAuthorityRequired()).mockResolvedValue(sandbox);
    expect(await getComputerSandbox({ ...ctx, getSandbox })).toBe(sandbox);
    expect(f.order).toEqual(["authorize", "ready", "revalidate", "session"]);
  });
  it("does not provision on arbitrary provider errors or a cached handle", async () => {
    await expect(getComputerSandbox({ ...ctx, getSandbox: async () => { throw new Error("provider failure"); } })).rejects.toThrow("provider failure");
    await getComputerSandbox(ctx); expect(f.prepare).not.toHaveBeenCalled();
  });
});
