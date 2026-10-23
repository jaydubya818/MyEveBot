import { describe, expect, it } from "vitest";
import { DEEP_AGENT_UNAVAILABLE_LABEL } from "./deep-agent-availability";
import { EXTERNAL_ALPHA_INSTRUCTIONS } from "./external-alpha/context";

describe("#99 chat-only activation preserved with QA-27 label", () => {
  it("keeps the bounded Sofie chat ceilings", () => {
    expect(EXTERNAL_ALPHA_INSTRUCTIONS).toContain("This beta currently authorizes chat only");
    expect(EXTERNAL_ALPHA_INSTRUCTIONS).toContain("ten turns per owner per UTC day");
    expect(EXTERNAL_ALPHA_INSTRUCTIONS).toContain("$0.10 per turn");
    expect(EXTERNAL_ALPHA_INSTRUCTIONS).toContain("$2 per day across both testers");
    expect(EXTERNAL_ALPHA_INSTRUCTIONS).toContain("$10 total within 120 hours");
    expect(EXTERNAL_ALPHA_INSTRUCTIONS).toContain("Paid Work and Factory execution are disabled");
  });

  it("labels Deep Agent unavailable without replacing chat-only policy", () => {
    expect(EXTERNAL_ALPHA_INSTRUCTIONS).toContain(DEEP_AGENT_UNAVAILABLE_LABEL);
    expect(EXTERNAL_ALPHA_INSTRUCTIONS).not.toContain(
      "backend rechecks current owner intent, version, generation, policy, budget, deadline",
    );
  });
});
