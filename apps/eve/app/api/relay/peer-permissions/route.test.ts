import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ owners: [] as string[], save: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/relay/store", () => ({ FederationStore: class {
  ownerId: string;
  constructor(ownerId: string) { this.ownerId = ownerId; state.owners.push(ownerId); }
  async connection() { throw new Error("offline fixture"); }
} }));
vi.mock("@/lib/relay/peer-permissions", async original => ({ ...await original<object>(), savePeerPermission: state.save, peerReadModel: state.read }));
import { GET, POST } from "./route";
import { createWebSessionToken } from "@/lib/web-auth";
beforeEach(() => {
  vi.clearAllMocks(); state.owners = [];
  vi.stubEnv("MYEVE_RELAY_ENABLED", "true"); vi.stubEnv("MYEVE_OWNER_ID", "owner-one");
  vi.stubEnv("MYEVE_ACCESS_PASSWORD", "local-test-password"); vi.stubEnv("MYEVE_SESSION_SECRET", "local-test-session-secret-long-enough");
  vi.stubEnv("MYEVE_RELAY_OWNER_ORIGIN", "https://myeve.example");
  state.read.mockResolvedValue({ relationships: [] }); state.save.mockResolvedValue({ id: "permission", revision: 1 });
});
const command = () => ({ localAgentId: "sofie", peer: "relay://atlas/research", displayName: "Atlas", policies: [], expiresAt: null,
  expectedRevision: 0, mutationId: "bb62c0a4-e13a-4095-891e-208541e98d1a" });
const request = (method = "POST", body: unknown = command(), origin = "https://myeve.example", cookie = `myeve_session=${createWebSessionToken()}`) =>
  new Request("https://myeve.example/api/relay/peer-permissions", { method, headers: { origin, cookie, "content-type": "application/json" },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}) });
describe("owner-only peer policy boundary", () => {
  it("derives owner identity exclusively from the authenticated session", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(state.owners).toEqual(["owner-one"]);
    expect(state.save).toHaveBeenCalledWith(expect.objectContaining({ ownerId: "owner-one" }), expect.objectContaining({ peer: "relay://atlas/research" }));
  });
  it.each(["https://peer.example", "null", ""])("rejects mutation from origin %s", async origin => {
    expect((await POST(request("POST", command(), origin))).status).toBe(403);
    expect(state.save).not.toHaveBeenCalled();
  });
  it("rejects anonymous, invalid and cross-owner sessions even in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    for (const cookie of ["", "myeve_session=invalid", `myeve_session=${createWebSessionToken({ ...process.env, MYEVE_OWNER_ID: "owner-two" })}`]) {
      expect((await POST(request("POST", command(), "https://myeve.example", cookie))).status).toBe(403);
    }
    expect(state.save).not.toHaveBeenCalled();
  });
  it("rejects owner overrides and model-style administrative payloads", async () => {
    expect((await POST(request("POST", { ...command(), ownerId: "owner-two" }))).status).toBe(400);
    expect(state.save).not.toHaveBeenCalled();
  });
  it("keeps GET read-only and uncacheable when Relay is unavailable", async () => {
    const response = await GET(request("GET"));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ discoveryStatus: "UNAVAILABLE", relationships: [] });
    expect(state.save).not.toHaveBeenCalled();
  });
  it("disabled Federation permits only explicit local revocation", async () => {
    vi.stubEnv("MYEVE_RELAY_ENABLED", "false");
    expect((await POST(request())).status).toBe(403);
    expect(state.save).not.toHaveBeenCalled();
    expect((await POST(request("POST", { ...command(), permissionId: "permission", expectedRevision: 1, revoke: true }))).status).toBe(200);
    expect(state.save).toHaveBeenCalledOnce();
  });
});
