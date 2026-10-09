import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), beta: vi.fn() }));
vi.mock("./web-auth", () => ({ requireWebAuth: mocks.auth }));
vi.mock("./beta-integration/runtime", () => ({ betaRequest: mocks.beta }));
import { GET } from "../app/api/chat-work/route";

describe("chat Work availability", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue(null); });
  afterEach(() => vi.unstubAllEnvs());
  it("keeps ordinary deployments free of unavailable Work controls", async () => {
    vi.stubEnv("MYEVE_BETA_MODE", "");
    const response = await GET(new Request("https://myeve.example/api/chat-work"));
    expect(await response.json()).toEqual({ works: [], selectionAvailable: false });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.beta).not.toHaveBeenCalled();
  });
  it("requires owner authentication before checking availability", async () => {
    mocks.auth.mockResolvedValue(new Response(null, { status: 401 }));
    expect((await GET(new Request("https://myeve.example/api/chat-work"))).status).toBe(401);
    expect(mocks.beta).not.toHaveBeenCalled();
  });
  it("retains canonical owner and Work checks when integration is available", async () => {
    vi.stubEnv("MYEVE_BETA_MODE", "private-alpha");
    const request = new Request("https://myeve.example/api/chat-work");
    const denied = new Response(null, { status: 403 });
    mocks.beta.mockResolvedValue(denied);
    expect(await GET(request)).toBe(denied);
    expect(mocks.beta).toHaveBeenCalledExactlyOnceWith(request, "work");
  });
});
