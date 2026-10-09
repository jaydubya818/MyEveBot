import {describe,expect,it,vi} from "vitest";
import {browserEffect} from "./browser-effect.ts";
import {INITIAL_ROUTINES,ROUTINE_TOOLS,routineToolAllowed} from "./routine-capabilities.ts";
import {executeBrowserAction} from "../agent/lib/browser-action.ts";

describe("initial Routine graph and effect boundaries",()=>{
  it("resolves every initial use case to explicit existing capabilities",()=>{
    for(const tools of Object.values(INITIAL_ROUTINES))for(const tool of tools)expect(ROUTINE_TOOLS[tool]).toBeDefined();
  });
  it("cannot replan into browser, MCP, delegation, terminal or self-modification",()=>{
    const granted=Object.values(ROUTINE_TOOLS).map(t=>t.capability);
    for(const [tool,cap] of [["browser__click","browser.click"],["connection_search","integration.composio"],["bash","terminal.execute"],["manage_agent","tool.manage_agent"],["workflow","specialist.functional-state"],["load_skill","skill.authored"]])expect(routineToolAllowed(tool!,cap!,[...granted,cap!])).toBe(false);
    expect(routineToolAllowed("imessage","tool.imessage",["tool.imessage"])).toBe(false);
    expect(routineToolAllowed("send_email","tool.send_email",["notification.send"])).toBe(false);
    expect(routineToolAllowed("send_email","tool.send_email",[])).toBe(false);
  });
  it.each(["Send email","Publish post","Confirm deployment","Delete resource","Buy now"])("denies %s through raw browser interactions before any provider",async label=>{
    const getSandbox=vi.fn();const ctx={getSandbox} as never;
    await expect(executeBrowserAction("click",{selector:label},ctx)).rejects.toThrow("not authorized");
    await expect(executeBrowserAction("find",{action:"click",text:label},ctx)).rejects.toThrow("not authorized");
    expect(getSandbox).not.toHaveBeenCalled();
  });
  it("does not trust a claimed read effect or arbitrary JavaScript",()=>{
    expect(browserEffect("click",{effect:"read"})).toBe("unknown");
    expect(browserEffect("wait_for",{jsCondition:"send()"})).toBe("unknown");
    expect(browserEffect("find",{action:"text"})).toBe("read");
  });
});
