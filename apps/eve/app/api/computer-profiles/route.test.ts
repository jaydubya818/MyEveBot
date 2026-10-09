import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteProviderProfile: vi.fn(),
  getProfile: vi.fn(),
  advance: vi.fn(),
}));

vi.mock("@/agent/lib/orgo", () => ({
  orgoForProfile: vi.fn(() => ({ delete: mocks.deleteProviderProfile })),
}));

vi.mock("@/lib/browser-profiles", () => ({
  advanceBrowserProfileGeneration: mocks.advance,
  ensureAllBrowserProfiles: vi.fn(async () => []),
  getBrowserProfile: mocks.getProfile,
  revokeBrowserProfileGrant: vi.fn(),
  setBrowserProfileStatus: vi.fn(),
  shareBrowserProfile: vi.fn(),
}));

vi.mock("@/lib/web-auth", () => ({
  requireWebAuth: vi.fn(() => null),
  webPrincipal: vi.fn(() => ({ id: "owner-a" })),
}));

import { PATCH } from "./route";

describe("Computer provider API errors", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgres://configured");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getProfile.mockResolvedValue({ agentSlug: "operator", agentIsPrimary: false, generation: 1 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("does not expose provider internals", async () => {
    mocks.deleteProviderProfile.mockRejectedValueOnce(new Error("DELETE https://desktop.internal/profile failed token=provider-secret"));
    const profileId = "browser_profile_123";
    const response = await PATCH(new Request("https://myeve.example/api/computer-profiles", {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-request-id": "provider-failure" },
      body: JSON.stringify({ action: "reset", profileId, confirmation: `RESET ${profileId}` }),
    }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({ error: { code: "browser_profile_update_failed", message: "Persistent browser profile could not be updated safely.", requestId: "provider-failure" } });
    expect(JSON.stringify(body)).not.toMatch(/desktop\.internal|provider-secret|DELETE/i);
  });
});
