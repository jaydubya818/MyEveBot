import {expect,it} from "vitest";
import {DEEP_AGENT_UNAVAILABLE_LABEL} from "./deep-agent-availability";
import {EXTERNAL_ALPHA_INSTRUCTIONS} from "./external-alpha/context";
it("names Deep Agent's current beta limitation alongside the chat-only boundary",()=>{
  expect(EXTERNAL_ALPHA_INSTRUCTIONS).toContain(DEEP_AGENT_UNAVAILABLE_LABEL);
  expect(EXTERNAL_ALPHA_INSTRUCTIONS).toContain("Paid Work and Factory execution are disabled");
});
