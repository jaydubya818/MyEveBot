import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ inspect: vi.fn(), run: vi.fn() }));
vi.mock("./routine-admission", () => ({
  RoutineAdmission: class {
    inspect = m.inspect;
  },
}));
vi.mock("./routine-run-now", () => ({ runRoutineNow: m.run }));
import { GET } from "../app/api/routines/[id]/readiness/route";
import { POST } from "../app/api/routines/[id]/run/route";
import { createWebSessionToken } from "./web-auth";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("MYEVE_OWNER_ID", "sarah");
  vi.stubEnv(
    "MYEVE_SESSION_SECRET",
    "fixture-session-signing-key-not-a-real-secret",
  );
  vi.stubEnv("DATABASE_URL", "fixture");
  vi.stubEnv("MYEVE_ACCESS_PASSWORD", "fixture-password-only");
});
afterEach(() => vi.unstubAllEnvs());
const params = { params: Promise.resolve({ id: "routine" }) };
const request = (auth = true, post = false, origin = "https://app.test") =>
  new Request("https://app.test/api/routines/routine/readiness", {
    method: post ? "POST" : "GET",
    headers: {
      ...(auth ? { cookie: `myeve_session=${createWebSessionToken()}` } : {}),
      origin,
      "content-type": "application/json",
    },
    ...(post ? { body: JSON.stringify({ version: 1 }) } : {}),
  });
describe("owner Routine readiness and Run Now APIs", () => {
  it("denies anonymous reads and writes before lookup", async () => {
    expect((await GET(request(false), params)).status).toBe(401);
    expect((await POST(request(false, true), params)).status).toBe(401);
    expect(m.inspect).not.toHaveBeenCalled();
    expect(m.run).not.toHaveBeenCalled();
  });
  it("uses authenticated owner, not a requested owner", async () => {
    m.inspect.mockResolvedValue({ state: "READY" });
    expect((await GET(request(), params)).status).toBe(200);
    expect(m.inspect).toHaveBeenCalledWith("sarah", "routine");
  });
  it("hides cross-owner and absent Routines", async () => {
    m.inspect.mockResolvedValue(null);
    expect((await GET(request(), params)).status).toBe(404);
  });
  it("denies cross-origin Run Now", async () => {
    expect(
      (await POST(request(true, true, "https://evil.test"), params)).status,
    ).toBe(403);
    expect(m.run).not.toHaveBeenCalled();
  });
  it.each([
    "NEEDS_CONFIGURATION",
    "NEEDS_APPROVAL",
    "BLOCKED",
    "AUTO_PAUSED",
    "DISABLED",
    "READY",
  ])("returns server refusal for %s including global kill", async (state) => {
    m.run.mockResolvedValue({
      status: 409,
      readiness: { state, canRun: false },
      occurrenceId: null,
    });
    expect((await POST(request(true, true), params)).status).toBe(409);
    expect(m.run).toHaveBeenCalledWith("sarah", "routine", 1);
  });
  it("accepts the admitted occurrence service response", async () => {
    m.run.mockResolvedValue({ status: 202, occurrenceId: "fixture" });
    expect((await POST(request(true, true), params)).status).toBe(202);
  });
});
