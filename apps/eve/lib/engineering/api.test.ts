import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ principal: vi.fn(), list: vi.fn() }));
vi.mock("../web-auth.ts", () => ({ authenticateWebPrincipal: mocks.principal }));
vi.mock("./store.ts", () => ({
  WorkStore: class {
    list = mocks.list;
  },
}));
import { handleWorkRequest } from "./api";
beforeEach(() => {
  vi.stubEnv("MYEVE_ENGINEERING_MODE", "dogfood");
  mocks.principal.mockReturnValue({ id: "owner-a" });
  mocks.list.mockResolvedValue([]);
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllEnvs());
describe("Work route boundaries", () => {
  it("keeps engineering off unless explicitly selected", async () => {
    vi.stubEnv("MYEVE_ENGINEERING_MODE", "");
    expect(
      (
        await handleWorkRequest(
          new Request("https://local.example/api/engineering/work"),
        )
      ).status,
    ).toBe(404);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("requires real authentication even in development", async () => {
    mocks.principal.mockReturnValue(null);
    expect(
      (
        await handleWorkRequest(
          new Request("https://local.example/api/engineering/work"),
        )
      ).status,
    ).toBe(401);
    expect(mocks.principal.mock.calls[0][1].NODE_ENV).toBe("production");
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("rejects cross-origin mutations before any storage access", async () => {
    const response = await handleWorkRequest(
      new Request("https://local.example/api/engineering/work", {
        method: "POST",
        headers: { origin: "https://foreign.example" },
        body: "{}",
      }),
    );
    expect(response.status).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("does not imply execution is available when only intent/history is implemented", async () => {
    const response = await handleWorkRequest(
      new Request("https://local.example/api/engineering/work"),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).execution.available).toBe(false);
  });
});
