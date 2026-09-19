import { describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({send:vi.fn(),write:vi.fn(),database:vi.fn(()=>{throw new Error("No database in this fixture");})}));
vi.mock("./agentmail",()=>({existingEmailAccount:vi.fn(),inspectBoundMessage:vi.fn(),sendBoundMessage:mocks.send}));
vi.mock("./receipts-db.ts",()=>({db:mocks.database}));
import sendEmail from "../tools/send_email.ts";
import { emailSendAdapter,fileWriteAdapter } from "../../lib/action-adapters.ts";
import { denyUnqualifiedConnection } from "./unqualified-executor.ts";

describe("actual executor entry points fail before providers",()=>{
  it("does not send when the authored email tool is called without a verified runtime",async()=>{
    await expect(sendEmail.execute({to:["fixture@example.test"],subject:"fixture",text:"owner approved"},{} as never)).rejects.toThrow();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rejects direct adapter calls even with plausible forged authority",async()=>{
    const context={idempotencyKey:"forged",capabilityId:"tool.send_email",target:{provider:"mail",account:"owner",resource:"recipient"}};
    const adapter=emailSendAdapter("mail",{resolveAccount:async()=>"owner",send:mocks.send,inspect:async()=>null});
    await expect(adapter.execute({to:["fixture@example.test"]},context)).rejects.toThrow();
    const file=fileWriteAdapter({id:"sandbox",canonicalPath:async path=>path,write:mocks.write,read:async()=>null});
    await expect(file.execute({filePath:"/workspace/report.md",content:"fixture"},{...context,capabilityId:"files.write"})).rejects.toThrow();
    expect(mocks.send).not.toHaveBeenCalled();expect(mocks.write).not.toHaveBeenCalled();
  });
  it("never turns a generic connected-app grant into provider permission",async()=>{
    const approval=denyUnqualifiedConnection("integration.composio");
    await expect(approval({session:{auth:{current:null,initiator:null}},toolName:"COMPOSIO_MULTI_EXECUTE_TOOL"} as never)).resolves.toMatchObject({type:"denied"});
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
