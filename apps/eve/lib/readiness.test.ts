import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { availableModels, query } = vi.hoisted(() => ({
  availableModels: vi.fn(async () => []),
  query: vi.fn(async (sql: string) => sql.includes("to_regclass") ? [{ table_name: "sofie_schema_migrations" }] : [{}]),
}));

vi.mock("ai", () => ({ gateway: { getAvailableModels: availableModels } }));
vi.mock("@vercel/blob", () => ({ list: vi.fn() }));
vi.mock("@/agent/lib/memory-store", () => ({ memoryStore: { healthcheck: vi.fn() } }));
vi.mock("@/agent/lib/receipts-db", () => ({ db: () => ({ query }) }));
vi.mock("@/lib/composio-connect", () => ({ FALLBACK_TOOLKITS: [], manageConnections: vi.fn() }));
vi.mock("@/lib/capabilities", () => ({ capabilityMap: () => ({
  computer: { state: "excluded" }, memory: { state: "excluded" },
  connections: { state: "excluded" }, skills: { state: "excluded" },
}) }));
vi.mock("@/lib/database-schema", () => ({ requiredDatabaseMigration: () => "test_migration" }));
vi.mock("@/lib/web-auth", () => ({ webAuthRequired: () => true, webAuthConfigStatus: () => ({ configured: true }) }));

import { getReadinessReport } from "./readiness";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MYEVE_OWNER_ID", "owner");
  vi.stubEnv("MYEVE_QDEV_ENABLED", "false");
  vi.stubEnv("AI_GATEWAY_API_KEY", "test-catalog-key");
  vi.stubEnv("DATABASE_URL", "postgresql://unused/test");
  vi.stubEnv("EVE_ENABLED_FEATURES", "");
});
afterEach(() => vi.unstubAllEnvs());

it.each([-1000, 0])("does not report AI ready when owner access has reached its expiry (%i ms)", async offset => {
  vi.stubEnv("MYEVE_QDEV_ENABLED", "true");
  vi.stubEnv("MYEVE_QDEV_HOST_BUNDLE", JSON.stringify({ ownerId: "owner", notAfter: new Date(Date.now() + offset).toISOString() }));
  const report = await getReadinessReport({ fresh: true });
  expect(report.overall).toBe("action_required");
  expect(report.checks.find(check => check.id === "ai")).toMatchObject({ state: "setup_required", detail: expect.stringContaining("has expired") });
  expect(availableModels).not.toHaveBeenCalled();
});

it.each([undefined, "not-json", "null", JSON.stringify({ ownerId: "another-owner", notAfter: "2099-01-01T00:00:00Z" }), JSON.stringify({ ownerId: "owner", notAfter: "invalid-date" })])(
  "requires owner setup for missing, malformed, or foreign installation metadata", async bundle => {
    vi.stubEnv("MYEVE_QDEV_ENABLED", "true");
    vi.stubEnv("MYEVE_QDEV_HOST_BUNDLE", bundle);
    const report = await getReadinessReport({ fresh: true });
    expect(report.overall).toBe("action_required");
    expect(report.checks.find(check => check.id === "ai")?.state).toBe("setup_required");
    expect(availableModels).not.toHaveBeenCalled();
  },
);

it("still probes the catalog when the installation metadata is current", async () => {
  vi.stubEnv("MYEVE_QDEV_ENABLED", "true");
  vi.stubEnv("MYEVE_QDEV_HOST_BUNDLE", JSON.stringify({ ownerId: "owner", notAfter: "2099-01-01T00:00:00Z" }));
  const report = await getReadinessReport({ fresh: true });
  expect(report.checks.find(check => check.id === "ai")?.state).toBe("ready");
  expect(availableModels).toHaveBeenCalledOnce();
});

it("preserves the normal catalog probe when the owner installation mode is disabled", async () => {
  const report = await getReadinessReport({ fresh: true });
  expect(report.overall).toBe("ready");
  expect(report.checks.find(check => check.id === "ai")?.state).toBe("ready");
  expect(availableModels).toHaveBeenCalledOnce();
});
