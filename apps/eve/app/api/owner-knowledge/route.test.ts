import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireWebAuth: vi.fn(), requireDatabase: vi.fn(), webPrincipal: vi.fn(),
  search: vi.fn(), inspect: vi.fn(), correct: vi.fn(), forget: vi.fn(),
}));

vi.mock("@/lib/web-auth", () => ({ requireWebAuth: mocks.requireWebAuth, webPrincipal: mocks.webPrincipal }));
vi.mock("@/lib/api-errors", async (load) => ({ ...(await load<typeof import("@/lib/api-errors")>()), requireDatabase: mocks.requireDatabase }));
vi.mock("@/lib/owner-knowledge", async (load) => ({
  ...(await load<typeof import("@/lib/owner-knowledge")>()),
  searchOwnerKnowledge: mocks.search,
  inspectOwnerKnowledge: mocks.inspect,
  correctOwnerKnowledge: mocks.correct,
  forgetOwnerKnowledge: mocks.forget,
}));

import { DELETE, GET, PATCH } from "./route";

describe("/api/owner-knowledge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireWebAuth.mockReturnValue(null);
    mocks.requireDatabase.mockReturnValue(null);
    mocks.webPrincipal.mockReturnValue({ id: "owner-a" });
    mocks.search.mockResolvedValue({ items: [], page: 1, limit: 25, hasMore: false });
    mocks.inspect.mockResolvedValue({ id: "knowledge_1" });
    mocks.correct.mockResolvedValue({ item: { id: "knowledge_2" }, receipt: { id: "dataop_1", result: "completed" } });
    mocks.forget.mockResolvedValue({ receipt: { id: "dataop_2", result: "completed" } });
  });

  it("searches only for the authenticated owner with bounded filters", async () => {
    const response = await GET(new Request("https://myeve.example/api/owner-knowledge?q=launch&type=fact&limit=25"));
    expect(response.status).toBe(200);
    expect(mocks.search).toHaveBeenCalledWith("owner-a", expect.objectContaining({ query: "launch", type: "fact", limit: 25 }));
  });

  it("rejects malformed cross-scope identifiers before search", async () => {
    const response = await GET(new Request("https://myeve.example/api/owner-knowledge?agent=../../owner-b"));
    expect(response.status).toBe(400);
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation before Forget", async () => {
    const response = await DELETE(new Request("https://myeve.example/api/owner-knowledge", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repository: "memory", id: "memory_1" }) }));
    expect(response.status).toBe(400);
    expect(mocks.forget).not.toHaveBeenCalled();
  });

  it("scopes correction and Forget mutations to the authenticated owner", async () => {
    const correction = await PATCH(new Request("https://myeve.example/api/owner-knowledge", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repository: "knowledge", id: "knowledge_1", content: "Corrected" }) }));
    const forgotten = await DELETE(new Request("https://myeve.example/api/owner-knowledge", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repository: "memory", id: "memory_1", confirmation: "FORGET" }) }));
    expect(correction.status).toBe(200);
    expect(forgotten.status).toBe(200);
    expect(mocks.correct).toHaveBeenCalledWith(expect.objectContaining({ ownerId: "owner-a", id: "knowledge_1" }));
    expect(mocks.forget).toHaveBeenCalledWith(expect.objectContaining({ ownerId: "owner-a", id: "memory_1" }));
  });

  it("fails closed before accessing repositories when authentication fails", async () => {
    mocks.requireWebAuth.mockReturnValue(new Response("Denied", { status: 401 }));
    const response = await GET(new Request("https://myeve.example/api/owner-knowledge"));
    expect(response.status).toBe(401);
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("returns an owner-visible partial receipt without claiming success", async () => {
    mocks.forget.mockResolvedValue({ receipt: { id: "dataop_partial", result: "partially_completed", remoteDeletionVerified: false } });
    const response = await DELETE(new Request("https://myeve.example/api/owner-knowledge", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repository: "memory", id: "memory_1", confirmation: "FORGET" }) }));
    expect(response.status).toBe(207);
    await expect(response.json()).resolves.toMatchObject({ receipt: { id: "dataop_partial", result: "partially_completed", remoteDeletionVerified: false } });
  });
});
