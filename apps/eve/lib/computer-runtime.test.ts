import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ row: null as unknown, inspect: vi.fn(), database: vi.fn() }));
vi.mock("./computer-template-store.ts", () => ({ SqlComputerTemplateStore: class {
  constructor() { fixture.database(); }
  async current() { return fixture.row; }
  async cleanupFailures() { return 0; }
  async metrics() { return { preparations: 0 }; }
} }));
vi.mock("./computer-template-vercel.ts", () => ({ vercelTemplateProvider: { id: "vercel", inspect: fixture.inspect } }));
import { computerRuntimeReadiness, computerTemplateKey } from "./computer-runtime.ts";
beforeEach(() => {
  vi.resetAllMocks(); fixture.row = null;
  vi.stubEnv("DATABASE_URL", "fixture"); vi.stubEnv("VERCEL_PROJECT_ID", "fixture");
  vi.stubEnv("VERCEL_TOKEN", "fixture"); vi.stubEnv("VERCEL_TEAM_ID", "fixture");
});
afterEach(() => vi.unstubAllEnvs());
describe("availability remains distinct from authority", () => {
  it("does no provider/database work when unconfigured", async () => {
    vi.stubEnv("VERCEL_TOKEN", ""); vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    expect((await computerRuntimeReadiness("owner")).state).toBe("NOT_CONFIGURED");
    expect(fixture.database).not.toHaveBeenCalled(); expect(fixture.inspect).not.toHaveBeenCalled();
  });
  it("distinguishes cold, preparing, verified ready and failed configuration", async () => {
    expect((await computerRuntimeReadiness("owner")).state).toBe("COLD");
    const key = computerTemplateKey("owner");
    fixture.row = { ...key, id: "id", state: "PREPARING", deadline: Date.now() + 5000 };
    expect((await computerRuntimeReadiness("owner")).state).toBe("PREPARING");
    fixture.row = { ...key, id: "id", state: "READY", templateId: "snapshot" };
    fixture.inspect.mockResolvedValue({ state: "READY", fingerprint: key.fingerprint, templateId: "snapshot" });
    expect((await computerRuntimeReadiness("owner")).state).toBe("READY");
    fixture.inspect.mockResolvedValue({ state: "READY", fingerprint: "wrong", templateId: "snapshot" });
    expect((await computerRuntimeReadiness("owner")).state).toBe("COLD");
    fixture.row = { ...key, id: "id", state: "CLEANED", failure: "authentication", retryAfter: Date.now() + 86400000 };
    expect((await computerRuntimeReadiness("owner")).state).toBe("UNAVAILABLE");
  });
  it("isolates owner, environment and deployment without hashing credentials", () => {
    const env = { NODE_ENV: "test" as const, VERCEL_ENV: "preview", VERCEL_PROJECT_ID: "project", VERCEL_DEPLOYMENT_ID: "one" };
    const key = computerTemplateKey("owner", env);
    expect(computerTemplateKey("another-owner", env).scope).not.toBe(key.scope);
    expect(computerTemplateKey("owner", { ...env, VERCEL_ENV: "production" }).scope).not.toBe(key.scope);
    expect(computerTemplateKey("owner", { ...env, VERCEL_DEPLOYMENT_ID: "two" }).fingerprint).not.toBe(key.fingerprint);
    expect(computerTemplateKey("owner", { ...env, VERCEL_TOKEN: "secret-changed" })).toEqual(key);
    expect(computerTemplateKey("owner", { ...env, MYEVE_COMPUTER_BASE_SNAPSHOT_ID: "pinned" }).fingerprint).not.toBe(key.fingerprint);
  });
});
