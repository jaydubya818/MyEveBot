import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), policy: vi.fn(), beta: vi.fn(), usage: vi.fn() }));
vi.mock("../web-auth.ts", () => ({ authenticateWebPrincipal: mocks.auth }));
vi.mock("./policy.ts", () => ({ externalAlphaPolicy: mocks.policy }));
vi.mock("../beta-integration/runtime.ts", () => ({ betaIntegration: mocks.beta }));
vi.mock("./usage.ts", () => ({ readAlphaChatUsage: mocks.usage }));
import { GET } from "../../app/api/chat-usage/route.ts";
const policy = { ownerId: "owner-1" };
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ id: "owner-1" }); mocks.policy.mockReturnValue(policy); mocks.beta.mockReturnValue({ fixture: true }); mocks.usage.mockResolvedValue({ fixture: "owner usage" }); });
afterEach(() => vi.unstubAllEnvs());
it("requires authentication before any policy/database read", async () => {
  mocks.auth.mockResolvedValue(null);
  expect((await GET(new Request("https://tester/api/chat-usage"))).status).toBe(401);
  expect(mocks.policy).not.toHaveBeenCalled(); expect(mocks.beta).not.toHaveBeenCalled();
});
it.each([null, { ownerId: "owner-2" }])("denies a different owner or absent policy without reading usage", async (configured) => {
  mocks.policy.mockReturnValue(configured);
  expect((await GET(new Request("https://tester/api/chat-usage"))).status).toBe(403);
  expect(mocks.usage).not.toHaveBeenCalled(); expect(mocks.beta).not.toHaveBeenCalled();
});
it("ignores caller-supplied owner, cohort, policy, and mutation modes", async () => {
  const response = await GET(new Request("https://tester/api/chat-usage?ownerId=owner-2&mode=reserve&cohortId=foreign"));
  expect(response.status).toBe(200);
  expect(mocks.usage).toHaveBeenCalledExactlyOnceWith({ fixture: true }, policy);
  expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(response.headers.get("vary")).toBe("Cookie");
});
it("returns an unavailable state without secrets or fabricated zeros on accounting errors", async () => {
  mocks.usage.mockRejectedValue(Error("private database connection secret"));
  const response = await GET(new Request("https://tester/api/chat-usage"));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "Chat usage could not be refreshed. Limits still apply." });
});
