import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({inspect:vi.fn(),getToken:vi.fn(),fetch:vi.fn()}));
vi.mock("../agent/lib/agentmail.ts",()=>({inspectBoundMessage:mocks.inspect}));
vi.mock("@vercel/connect",()=>({getToken:mocks.getToken}));
import {ActionRecovery,recoveryStrategy} from "./action-recovery.ts";
import {approvalBinding,canonicalActionValue} from "./approvals.ts";
const target={provider:"agentmail",account:"personal",resource:"recipient"};
const foremanTarget={provider:"linear",account:"workspace",resource:"team/bot/owner/repo"};
const executor={kind:"primary-agent",agentId:"owner-agent"};
const trigger={kind:"owner_chat",id:"session-1"};
const issue={id:"issue-7",identifier:"MYE-7",url:"https://linear.app/acme/issue/MYE-7/docs-sample",title:"Docs sample",description:"Update only the requested docs sample with the approved content.",team:{id:"team"},delegate:{id:"bot"},agentSessions:{nodes:[{id:"session-7",status:"Finished"}]}};
const receipt={issueId:issue.id,issueIdentifier:issue.identifier,issueUrl:issue.url};
function bindingFor(observedIssue=issue){
  const parameters={issueId:observedIssue.id,title:observedIssue.title,description:observedIssue.description};
  return {taskId:"run-1",capabilityId:"tool.delegate_foreman_issue",actionClass:"create",
    parameterHash:approvalBinding({taskId:"run-1",capabilityId:"tool.delegate_foreman_issue",resource:JSON.stringify(canonicalActionValue(foremanTarget)),action:"create",
      parameters:{payload:parameters,target:foremanTarget,executor,trigger,computer:null}}),
    executor,trigger,ownerChannelRun:false,hasComputer:false};
}
function linearResponse(overrides:Record<string,unknown>={}){
  const data={viewer:{id:"bot",organization:{id:"workspace"}},issues:{nodes:[issue]},...overrides};
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({data}),{status:200,headers:{"content-type":"application/json"}}));
}
beforeEach(()=>{
  mocks.inspect.mockReset();mocks.getToken.mockReset().mockResolvedValue("read-only-token");mocks.fetch.mockReset();
  vi.stubGlobal("fetch",mocks.fetch);
  vi.stubEnv("FOREMAN_LINEAR_CONNECTOR","linear/factory");vi.stubEnv("FOREMAN_LINEAR_WORKSPACE_ID","workspace");
  vi.stubEnv("FOREMAN_LINEAR_TEAM_ID","team");vi.stubEnv("FOREMAN_LINEAR_DELEGATE_ID","bot");vi.stubEnv("FOREMAN_REPO","owner/repo");
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe("provider recovery strategies",()=>{
  it("does not infer non-execution from a missing provider ID",async()=>{expect((await recoveryStrategy("tool.send_email","agentmail").inspect({target,receipt:{}})).outcome).toBe("indeterminate");expect(mocks.inspect).not.toHaveBeenCalled();});
  it("inspects the bound message and account without a send API",async()=>{mocks.inspect.mockResolvedValue({message_id:"m",thread_id:"t",inbox_id:"personal"});expect((await recoveryStrategy("tool.send_email","agentmail").inspect({target,receipt:{messageId:"m",threadId:"t"}})).outcome).toBe("succeeded");expect(mocks.inspect).toHaveBeenCalledWith("personal","m");});
  it("refuses a message from another account",async()=>{mocks.inspect.mockResolvedValue({message_id:"m",thread_id:"t",inbox_id:"work"});expect((await recoveryStrategy("tool.send_email","agentmail").inspect({target,receipt:{messageId:"m",threadId:"t"}})).outcome).toBe("indeterminate");});
  it("never restores a missing sandbox just to inspect a file",async()=>{expect((await recoveryStrategy("files.write","sandbox").inspect({target:{provider:"sandbox",account:"missing",resource:"/workspace/file"},receipt:{}})).outcome).toBe("indeterminate");});
  it("leaves unsupported providers for owner review",async()=>{expect((await recoveryStrategy("browser.click","browser").inspect({target,receipt:{}})).outcome).toBe("indeterminate");});
});
describe("read-only Foreman recovery",()=>{
  it("passes only saved action identity into provider inspection and persists an exact success",async()=>{
    const savedBinding=bindingFor();
    const row={id:"action-1",run_id:savedBinding.taskId,capability_id:savedBinding.capabilityId,action_class:savedBinding.actionClass,
      parameter_hash:savedBinding.parameterHash,executor:savedBinding.executor,trigger:savedBinding.trigger,target:foremanTarget,
      provider_receipt:receipt,attempt_count:1,computer_session_id:null};
    const query=vi.fn().mockImplementation(async(sql:string)=>{
      if(sql.includes("SELECT EXISTS"))return [{owner_channel_run:false}];
      if(sql.includes("UPDATE action_requests SET status='recovering'"))return [row];
      if(sql.includes("WITH recovered AS"))return [{id:"action-1"}];
      throw new Error("Unexpected database operation");
    });
    const inspect=vi.fn().mockResolvedValue({outcome:"succeeded",evidence:{verified:true}});
    const status=await new ActionRecovery({query} as never).recover("owner",row.id,()=>({id:"linear.issue_binding_readback.v1",inspect}));
    expect(status).toBe("completed");
    expect(inspect).toHaveBeenCalledWith({target:foremanTarget,receipt,binding:{taskId:row.run_id,capabilityId:row.capability_id,
      actionClass:row.action_class,parameterHash:row.parameter_hash,executor:row.executor,trigger:row.trigger,ownerChannelRun:false,hasComputer:false}});
    expect(query).toHaveBeenCalledTimes(3);
  });
  it("verifies the exact issue binding and delegated session with a read-only Linear query",async()=>{
    linearResponse();
    const targetFromJsonb={resource:foremanTarget.resource,provider:foremanTarget.provider,account:foremanTarget.account};
    const result=await recoveryStrategy("tool.delegate_foreman_issue","linear").inspect({target:targetFromJsonb,receipt,binding:bindingFor()});
    expect(result).toMatchObject({outcome:"succeeded",evidence:{issueId:issue.id,sessionId:"session-7",sessionStatus:"Finished",checks:{appIdentity:true,workspace:true,issueId:true,issueIdentifier:true,issueUrl:true,team:true,delegate:true,exactActionBinding:true,foremanSession:true}}});
    expect(mocks.getToken).toHaveBeenCalledWith("linear/factory",{subject:{type:"app"},scopes:["read"]});
    const [url,options]=mocks.fetch.mock.calls[0]!;const request=JSON.parse(String(options.body));
    expect(url).toBe("https://api.linear.app/graphql");expect(options.method).toBe("POST");
    expect(request.query.trimStart()).toMatch(/^query\b/);expect(request.query).not.toMatch(/\bmutation\b/);
    expect(request.variables).toEqual({id:issue.id});
  });
  it("reconstructs the saved action hash after Linear changes Markdown bullets",async()=>{
    const original={...issue,description:"Update the guide.\n\nRequirements:\n- First requirement\n- Second requirement\n\n## Delivery boundary\nRepository: owner/repo."};
    linearResponse({issues:{nodes:[{...original,description:"Update the guide.\n\nRequirements:\n\n* First requirement\n* Second requirement\n\n## Delivery boundary\n\nRepository: owner/repo."}]}});
    const result=await recoveryStrategy("tool.delegate_foreman_issue","linear").inspect({target:foremanTarget,receipt,binding:bindingFor(original)});
    expect(result).toMatchObject({outcome:"succeeded",evidence:{checks:{exactActionBinding:true}}});
  });
  it("keeps recovery indeterminate when issue text differs from the durable action hash",async()=>{
    linearResponse({issues:{nodes:[{...issue,description:"Different content"}]}});
    const result=await recoveryStrategy("tool.delegate_foreman_issue","linear").inspect({target:foremanTarget,receipt,binding:bindingFor()});
    expect(result).toMatchObject({outcome:"indeterminate",evidence:{checks:{exactActionBinding:false}}});
  });
  it("does not mark an absent issue as not executed",async()=>{
    linearResponse({issues:{nodes:[]}});
    const result=await recoveryStrategy("tool.delegate_foreman_issue","linear").inspect({target:foremanTarget,receipt,binding:bindingFor()});
    expect(result.outcome).toBe("indeterminate");expect(result.outcome).not.toBe("not_executed");
  });
  it("does not query Linear when the persisted target or execution context is outside the supported binding",async()=>{
    const strategy=recoveryStrategy("tool.delegate_foreman_issue","linear");
    expect((await strategy.inspect({target:{...foremanTarget,account:"other"},receipt,binding:bindingFor()})).outcome).toBe("indeterminate");
    expect((await strategy.inspect({target:foremanTarget,receipt,binding:{...bindingFor(),ownerChannelRun:true}})).outcome).toBe("indeterminate");
    expect(mocks.getToken).not.toHaveBeenCalled();expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("rejects a non-Linear receipt URL before obtaining a token",async()=>{
    const result=await recoveryStrategy("tool.delegate_foreman_issue","linear").inspect({target:foremanTarget,receipt:{...receipt,issueUrl:"https://attacker.test/MYE-7"},binding:bindingFor()});
    expect(result).toEqual({outcome:"indeterminate",evidence:{reason:"provider_receipt_invalid"}});
    expect(mocks.getToken).not.toHaveBeenCalled();expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("keeps recovery indeterminate when the provider returns a server error",async()=>{
    mocks.fetch.mockResolvedValue(new Response("{}",{status:503}));
    const result=await recoveryStrategy("tool.delegate_foreman_issue","linear").inspect({target:foremanTarget,receipt,binding:bindingFor()});
    expect(result).toEqual({outcome:"indeterminate",evidence:{reason:"provider_readback_unavailable"}});
  });
  it("keeps recovery indeterminate when Linear returns a malformed response",async()=>{
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({data:{issues:{nodes:[{id:issue.id}]}}}),{status:200}));
    const result=await recoveryStrategy("tool.delegate_foreman_issue","linear").inspect({target:foremanTarget,receipt,binding:bindingFor()});
    expect(result).toEqual({outcome:"indeterminate",evidence:{reason:"provider_readback_unavailable"}});
  });
  it("keeps recovery indeterminate when issue, workspace, team or delegate evidence mismatches",async()=>{
    linearResponse({viewer:{id:"other",organization:{id:"other-workspace"}},issues:{nodes:[{...issue,team:{id:"other-team"},delegate:{id:"other-bot"}}]}});
    const result=await recoveryStrategy("tool.delegate_foreman_issue","linear").inspect({target:foremanTarget,receipt,binding:bindingFor()});
    expect(result).toMatchObject({outcome:"indeterminate",evidence:{checks:{appIdentity:false,workspace:false,team:false,delegate:false}}});
  });
  it("keeps recovery indeterminate until a Foreman session has started",async()=>{
    linearResponse({issues:{nodes:[{...issue,agentSessions:{nodes:[{id:"session-7",status:"pending"}]}}]}});
    const result=await recoveryStrategy("tool.delegate_foreman_issue","linear").inspect({target:foremanTarget,receipt,binding:bindingFor()});
    expect(result).toMatchObject({outcome:"indeterminate",evidence:{checks:{exactActionBinding:true,foremanSession:false}}});
  });
  it("does not expose a request body or token in recovery evidence when Linear is unavailable",async()=>{
    mocks.fetch.mockRejectedValue(new Error("sensitive provider response"));
    const result=await recoveryStrategy("tool.delegate_foreman_issue","linear").inspect({target:foremanTarget,receipt,binding:bindingFor()});
    expect(result).toEqual({outcome:"indeterminate",evidence:{reason:"provider_readback_unavailable"}});
  });
});
