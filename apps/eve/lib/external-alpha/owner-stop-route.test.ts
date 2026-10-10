import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Reviewer finding (zero-gap): while an alpha Work runs, every paid chat turn is fenced,
 * so the owner must be able to stop it without a Sofie turn. The owner route delegates to
 * the same authenticated stop path as Sofie's tool: no model call, no new authority. */
const mocks = vi.hoisted(() => ({
  principal: vi.fn(), sameOrigin: vi.fn(), installation: vi.fn(), action: vi.fn(), config: vi.fn(),
}));
vi.mock("../web-auth.ts", () => ({ authenticateWebPrincipal: mocks.principal, requireSameOrigin: mocks.sameOrigin }));
vi.mock("./work-action.ts", () => ({ externalAlphaFactoryAction: mocks.action }));
vi.mock("../beta-integration/configuration.ts", () => ({ betaConfiguration: mocks.config }));
vi.mock("./policy.ts", async (orig) => ({ ...(await orig<object>()), externalAlphaInstallation: mocks.installation }));
import { betaRequest } from "../beta-integration/runtime.ts";

const OWNER = "11111111-1111-4111-8111-111111111111", WORK = "22222222-2222-4222-8222-222222222222";
const post = (body: unknown) => new Request("https://myeve.example/api/beta/work", {
  method: "POST", headers: { "content-type": "application/json", origin: "https://myeve.example" }, body: JSON.stringify(body) });

describe("alpha owner Work stop (non-paid)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.principal.mockResolvedValue({ id: OWNER });
    mocks.sameOrigin.mockReturnValue(null);
    mocks.config.mockReturnValue({ url: "postgresql://unused.invalid/none", policy: {} });
    vi.stubEnv("DATABASE_URL", "postgresql://unused:unused@unused.invalid/none"); // never queried: the action is mocked
    mocks.action.mockResolvedValue({ state: "CANCELLED", currentTruth: ["Stop requested; Work authority state: CANCELLED."] });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("stops through the alpha authority path with the owner's scope and exact Work version", async () => {
    mocks.installation.mockReturnValue(true);
    const response = await betaRequest(post({ workId: WORK, expectedVersion: 3, expectedGeneration: 2, operation: "stop" }), "work");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ state: "CANCELLED" });
    expect(mocks.action).toHaveBeenCalledOnce();
    const [store, workId, input] = mocks.action.mock.calls[0];
    expect(store.principal).toEqual({ scopeKind: "personal", scopeId: OWNER, actorId: OWNER });
    expect(workId).toBe(WORK);
    expect(input).toEqual({ operation: "stop", expectedWorkVersion: 3, expectedWorkGeneration: 2 });
  });

  it("is unavailable outside an alpha installation", async () => {
    mocks.installation.mockReturnValue(false);
    const response = await betaRequest(post({ workId: WORK, expectedVersion: 3, expectedGeneration: 2, operation: "stop" }), "work");
    expect(response.status).toBe(400);
    expect(mocks.action).not.toHaveBeenCalled();
  });

  it("requires sign-in and same origin, and accepts no extra fields", async () => {
    mocks.installation.mockReturnValue(true);
    mocks.principal.mockResolvedValueOnce(null);
    expect((await betaRequest(post({ workId: WORK, expectedVersion: 3, expectedGeneration: 2, operation: "stop" }), "work")).status).toBe(401);
    mocks.sameOrigin.mockReturnValueOnce("cross-origin");
    expect((await betaRequest(post({ workId: WORK, expectedVersion: 3, expectedGeneration: 2, operation: "stop" }), "work")).status).toBe(403);
    expect((await betaRequest(post({ workId: WORK, expectedVersion: 3, expectedGeneration: 2, operation: "stop", ownerId: OWNER }), "work")).status).toBeGreaterThanOrEqual(400);
    expect(mocks.action).not.toHaveBeenCalled();
  });

  it("surfaces an owner-scope or version refusal from the authority path", async () => {
    mocks.installation.mockReturnValue(true);
    const { WorkError } = await import("../engineering/types.ts");
    mocks.action.mockRejectedValueOnce(new WorkError("alpha_owner", "Owner scope denied.", 403));
    expect((await betaRequest(post({ workId: WORK, expectedVersion: 3, expectedGeneration: 2, operation: "stop" }), "work")).status).toBe(403);
  });
});
