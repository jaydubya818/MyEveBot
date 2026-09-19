import {describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({resume:vi.fn().mockResolvedValue("saved-draft"),client:vi.fn(()=>{throw new Error("Research must not restart");})}));
vi.mock("eve/client",()=>({Client:mocks.client}));
vi.mock("./routine-pending-send.ts",()=>({RoutinePendingSend:class {get=async()=>({status:"awaiting_approval"});resume=mocks.resume;}}));
vi.mock("./action-gateway.ts",()=>({ActionGateway:class{}}));
vi.mock("../agent/lib/email-send-adapter.ts",()=>({agentMailSendAdapter:()=>({})}));
import {routineRunner} from "../agent/lib/routine-runner.ts";
describe("approved pending send continuation",()=>{
  it("resumes only the saved send without invoking a model/session",async()=>{
    const claim={ownerId:"sarah",runId:"same-run"} as never;
    expect(await routineRunner.run(claim,new AbortController().signal)).toEqual({resultReference:"saved-draft"});
    expect(mocks.resume).toHaveBeenCalledOnce();expect(mocks.client).not.toHaveBeenCalled();
  });
});
