import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { GET, POST } from "./route";
import { createWebSessionToken } from "@/lib/web-auth";
import { fixtureEnabled } from "@/lib/capsules/service";

let directory: string;
const origin = "http://localhost";
function request(body: unknown, extra: Record<string, string> = {}) { return new Request(`${origin}/api/capsules`, { method: "POST", headers: { origin, "content-type": "application/json", ...extra }, body: JSON.stringify(body) }); }
beforeEach(() => { directory = mkdtempSync("/tmp/capsule-route-"); vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("MYEVE_CAPSULE_FIXTURE_DB", join(directory, "b.sqlite")); vi.stubEnv("MYEVE_OWNER_ID", "owner"); });
afterEach(() => { vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });
describe("Authenticated Capsule routes", () => {
  it("requires production owner auth and disables qualification fixtures", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("MYEVE_ACCESS_PASSWORD", "test-password-only"); vi.stubEnv("MYEVE_SESSION_SECRET", "synthetic-session-secret-for-route-tests-only");
    expect(fixtureEnabled()).toBe(false);
    expect((await GET(new Request(`${origin}/api/capsules`))).status).toBe(401);
    const cookie = `myeve_session=${createWebSessionToken()}`;
    expect((await POST(request({ action: "export_preview", selectedIds: ["x"] }, { cookie, origin: "https://attacker.example" }))).status).toBe(403);
  });
  it("rejects cross-site writes even in local development", async () => {
    expect((await POST(request({ action: "export_preview", selectedIds: ["x"] }, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
  });
  it("runs select → preview → export → independent destination preview → staged import → duplicate", async () => {
    const catalog = await (await GET(new Request(`${origin}/api/capsules`))).json();
    expect(catalog.mode).toBe("qualification");
    const selectedIds = catalog.candidates.slice(0, 3).map((c: { id: string }) => c.id);
    const preview = await (await POST(request({ action: "export_preview", selectedIds }))).json();
    const exported = await (await POST(request({ action: "export", selectedIds, reviewedDigest: preview.reviewDigest }))).json();
    expect(exported.bytes).toBeGreaterThan(1000);
    const incoming = await (await POST(request({ action: "import_preview", raw: exported.raw }))).json();
    expect(incoming.destinationEveRef).toBe("sofie-b");
    const response = await POST(request({ action: "import", raw: exported.raw, reviewedDigest: incoming.reviewDigest, decisions: incoming.items.map((row: { item: { id: string } }) => ({ id: row.item.id, choice: "include" })) }));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
    expect((await response.json()).count).toBe(3);
    const repeated = await (await POST(request({ action: "import_preview", raw: exported.raw }))).json();
    expect(repeated.items.every((row: { status: string }) => row.status === "duplicate")).toBe(true);
  });
  it("does not accept caller-supplied policies, content or destination authority", async () => {
    for (const extra of [{ candidates: [] }, { permissions: ["all"] }, { ownerRef: "other" }]) {
      expect((await POST(request({ action: "export_preview", selectedIds: ["fixture-response-style"], ...extra }))).status).toBe(400);
    }
  });
  it("bounds streamed request bodies before JSON parsing", async () => {
    const response = await POST(new Request(`${origin}/api/capsules`, { method: "POST", body: "x".repeat(2_200_001) }));
    expect(response.status).toBe(400); expect((await response.json()).code).toBe("size");
  });
});
