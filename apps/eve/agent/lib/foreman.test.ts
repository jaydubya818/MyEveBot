import { beforeEach, describe, expect, it, vi } from "vitest";
const guards=vi.hoisted(()=>({adapter:vi.fn(),provider:vi.fn()}));
vi.mock("../../lib/action-gateway.ts",()=>({consumeActionAuthority:guards.adapter,consumeProviderAuthority:guards.provider}));
import { foremanAdapter, foremanDescription, foremanIssueId, type ForemanConfig } from "./foreman.ts";
const config:ForemanConfig={connector:"linear/factory",workspaceId:"workspace",teamId:"team",delegateId:"bot",repository:"owner/repo"};
const params={issueId:"issue",title:"A documentation task",description:"Exact bound content"};
const issue={id:"issue",identifier:"MYE-7",url:"https://linear.app/myevebot/issue/MYE-7",title:params.title,description:params.description,team:{id:"team"},delegate:{id:"bot"},agentSessions:{nodes:[{id:"session",status:"active"}]}};
const account={viewer:{id:"bot",organization:{id:"workspace"}},team:{id:"team"}};
const authority={} as never;
beforeEach(()=>{vi.resetAllMocks();guards.adapter.mockResolvedValue(undefined);guards.provider.mockResolvedValue(undefined);});
describe("Foreman target and verified delegation",()=>{
  it("denies a connector for another workspace before creating anything",async()=>{
    const request=vi.fn().mockResolvedValue({...account,viewer:{...account.viewer,organization:{id:"other"}}});
    await expect(foremanAdapter(config,request).resolveTarget(params)).rejects.toThrow("configured target");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each(["adapter","provider"] as const)("rejects missing %s authority without provider requests",async guard=>{
    guards[guard].mockRejectedValue(new Error("denied"));const request=vi.fn();
    await expect(foremanAdapter(config,request).execute(params,authority)).rejects.toThrow("denied");
    expect(request).not.toHaveBeenCalled();
  });
  it("creates and delegates exactly once then verifies the actual session",async()=>{
    const request=vi.fn().mockResolvedValueOnce(account).mockResolvedValueOnce({issues:{nodes:[]}}).mockResolvedValueOnce({issueCreate:{success:true,issue}}).mockResolvedValueOnce({issues:{nodes:[issue]}});
    const adapter=foremanAdapter(config,request);const target=await adapter.resolveTarget(params);
    const result=await adapter.execute(params,authority);expect(await adapter.verify(result,target)).toMatchObject({verified:true,receipt:{status:"started",sessionId:"session",issueIdentifier:"MYE-7"}});
    expect(request.mock.calls.filter(([q])=>q.startsWith("mutation"))).toHaveLength(1);
    expect(request.mock.calls[2][1]).toEqual({input:{id:"issue",title:params.title,description:params.description,teamId:"team",delegateId:"bot"}});
  });
  it("reuses an exact existing issue without another mutation",async()=>{
    const request=vi.fn().mockResolvedValue({issues:{nodes:[issue]}});
    expect(await foremanAdapter(config,request).execute(params,authority)).toEqual(issue);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("refuses to reuse an issue with changed content",async()=>{
    const request=vi.fn().mockResolvedValue({issues:{nodes:[{...issue,description:"other"}]}});
    await expect(foremanAdapter(config,request).execute(params,authority)).rejects.toThrow("differs");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("does not blindly retry an uncertain create",async()=>{
    const request=vi.fn().mockResolvedValueOnce({issues:{nodes:[]}}).mockRejectedValueOnce(new Error("network timeout"));
    await expect(foremanAdapter(config,request).execute(params,authority)).rejects.toThrow("timeout");expect(request).toHaveBeenCalledTimes(2);
  });
  it("does not report session startup when delegation has no session",async()=>{
    vi.useFakeTimers();try {
      const request=vi.fn().mockResolvedValueOnce(account).mockResolvedValue({issues:{nodes:[{...issue,agentSessions:{nodes:[]}}]}});
      const adapter=foremanAdapter(config,request);const target=await adapter.resolveTarget(params);const result=adapter.verify(issue,target);
      await vi.runAllTimersAsync();expect(await result).toMatchObject({verified:true,receipt:{status:"delegated_pending",sessionId:null}});
    } finally {vi.useRealTimers();}
  });
  it("fails readback verification if delegation changed",async()=>{
    const request=vi.fn().mockResolvedValueOnce(account).mockResolvedValue({issues:{nodes:[{...issue,delegate:{id:"other"}}]}});
    const adapter=foremanAdapter(config,request);const target=await adapter.resolveTarget(params);expect(await adapter.verify(issue,target)).toMatchObject({verified:false});
  });
  it("deduplicates identical requests within an owner session and separates owners",()=>{
    const input={title:params.title,description:params.description};const id=foremanIssueId("owner","session",input);
    expect(id).toBe(foremanIssueId("owner","session",input));expect(id).not.toBe(foremanIssueId("other","session",input));
    expect(id).not.toBe(foremanIssueId("owner","session",{...input,description:"changed"}));
    expect(foremanDescription(input,config)).toContain("Do not merge, mark ready, or deploy.");
  });
});
