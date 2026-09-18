import { describe, expect, it } from "vitest";

import { capabilityMap } from "./capabilities";

describe("Phone release gate", () => {
  it("keeps Phone excluded until live qualification is explicit", () => {
    expect(capabilityMap({ NODE_ENV: "test", DATABASE_URL: "postgres://example" }).phone.state).toBe("excluded");
  });

  it("requires the safety database after qualification", () => {
    expect(capabilityMap({ NODE_ENV: "test", AGENTPHONE_LIVE_QUALIFIED: "true" }).phone.state).toBe("setup_required");
    expect(
      capabilityMap({ NODE_ENV: "test", AGENTPHONE_LIVE_QUALIFIED: "true", DATABASE_URL: "postgres://example" }).phone
        .state,
    ).toBe("ready");
  });
});
