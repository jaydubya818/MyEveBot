import {describe,expect,it} from "vitest";
import {DEEP_AGENT_UNAVAILABLE_LABEL} from "./deep-agent-availability";
import {EXTERNAL_ALPHA_INSTRUCTIONS} from "./external-alpha/context";
describe("existing PR100 chat-only activation contract",()=>{
  it("preserves the bounded chat ceilings without authorizing Work",()=>{
    for(const text of["This beta currently authorizes chat only","ten turns per owner per UTC day","$0.10 per turn","$2 per day across both testers","$10 total within 120 hours","Paid Work and Factory execution are disabled"])
      expect(EXTERNAL_ALPHA_INSTRUCTIONS).toContain(text);
  });
  it("explains Deep Agent without reopening an execution path",()=>{
    expect(EXTERNAL_ALPHA_INSTRUCTIONS).toContain(DEEP_AGENT_UNAVAILABLE_LABEL);
    expect(EXTERNAL_ALPHA_INSTRUCTIONS).not.toContain("backend rechecks current owner intent, version, generation, policy, budget, deadline");
  });
});
