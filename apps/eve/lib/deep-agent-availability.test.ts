import { describe, expect, it } from "vitest";
import {
  DEEP_AGENT_UNAVAILABLE_LABEL,
  deepAgentIsQualified,
} from "./deep-agent-availability";
import { EXTERNAL_ALPHA_INSTRUCTIONS } from "./external-alpha/context";

describe("QA-27 Deep Agent unavailable until qualified", () => {
  it("treats a missing provider as unqualified", () => {
    expect(
      deepAgentIsQualified({ binding: null, qualification: null }),
    ).toBe(false);
  });

  it("treats UNKNOWN status as unqualified", () => {
    expect(
      deepAgentIsQualified({
        binding: { id: "deep-agent", version: 1 },
        qualification: { status: "UNKNOWN", health: "HEALTHY" },
      }),
    ).toBe(false);
  });

  it("is included in the chat-only system instructions", () => {
    expect(EXTERNAL_ALPHA_INSTRUCTIONS).toContain(DEEP_AGENT_UNAVAILABLE_LABEL);
  });
});
