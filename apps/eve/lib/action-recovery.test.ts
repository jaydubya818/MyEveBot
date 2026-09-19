import {beforeEach,describe,expect,it,vi} from "vitest";
const inspect=vi.hoisted(()=>vi.fn());
vi.mock("../agent/lib/agentmail.ts",()=>({inspectBoundMessage:inspect}));
import {recoveryStrategy} from "./action-recovery.ts";
const target={provider:"agentmail",account:"personal",resource:"recipient"};
beforeEach(()=>inspect.mockReset());
describe("provider recovery strategies",()=>{
  it("does not infer non-execution from a missing provider ID",async()=>{expect((await recoveryStrategy("tool.send_email","agentmail").inspect({target,receipt:{}})).outcome).toBe("indeterminate");expect(inspect).not.toHaveBeenCalled();});
  it("inspects the bound message and account without a send API",async()=>{inspect.mockResolvedValue({message_id:"m",thread_id:"t",inbox_id:"personal"});expect((await recoveryStrategy("tool.send_email","agentmail").inspect({target,receipt:{messageId:"m",threadId:"t"}})).outcome).toBe("succeeded");expect(inspect).toHaveBeenCalledWith("personal","m");});
  it("refuses a message from another account",async()=>{inspect.mockResolvedValue({message_id:"m",thread_id:"t",inbox_id:"work"});expect((await recoveryStrategy("tool.send_email","agentmail").inspect({target,receipt:{messageId:"m",threadId:"t"}})).outcome).toBe("indeterminate");});
  it("never restores a missing sandbox just to inspect a file",async()=>{expect((await recoveryStrategy("files.write","sandbox").inspect({target:{provider:"sandbox",account:"missing",resource:"/workspace/file"},receipt:{}})).outcome).toBe("indeterminate");});
  it("leaves unsupported providers for owner review",async()=>{expect((await recoveryStrategy("browser.click","browser").inspect({target,receipt:{}})).outcome).toBe("indeterminate");});
});
