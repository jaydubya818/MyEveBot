import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({request:vi.fn(),gateway:vi.fn()}));
vi.mock("../lib/action-context.ts",()=>({toolActionRequest:mocks.request}));
vi.mock("../../lib/action-gateway.ts",async original=>({...await original<typeof import("../../lib/action-gateway.ts")>(),ActionGateway:class {execute=mocks.gateway;}}));
import tool from "./delegate_foreman_issue.ts";
import { ActionBlocked } from "../../lib/action-gateway.ts";
import type { ToolContext } from "eve/tools";
const ctx={session:{id:"session"},callId:"call"} as ToolContext;
const input={title:"Docs test",description:"Document the supported workflow."};
beforeEach(()=>{
 vi.resetAllMocks();
 for(const [key,value] of Object.entries({FOREMAN_LINEAR_CONNECTOR:"linear/factory",FOREMAN_LINEAR_WORKSPACE_ID:"workspace",FOREMAN_LINEAR_TEAM_ID:"team",FOREMAN_LINEAR_DELEGATE_ID:"bot",FOREMAN_REPO:"owner/repo"}))vi.stubEnv(key,value);
 mocks.request.mockImplementation(async(_ctx,action)=>({...action,ownerId:"owner",trigger:{kind:"owner_chat"},executor:{kind:"primary-agent"}}));
 mocks.gateway.mockResolvedValue({receipt:{status:"started",issueUrl:"https://linear.app/example"}});
});
it("uses the gateway with exact content and a stable issue id",async()=>{
 expect(await tool.execute!(input,ctx)).toMatchObject({receipt:{status:"started"}});
 expect(mocks.gateway.mock.calls[0][0]).toMatchObject({capabilityId:"tool.delegate_foreman_issue",actionClass:"create",parameters:{title:input.title,issueId:expect.any(String),description:expect.stringContaining(input.description)}});
});
it("denies unauthenticated callers before any gateway/provider operation",async()=>{
 mocks.request.mockRejectedValue(new ActionBlocked("denied","unresolved"));expect(await tool.execute!(input,ctx)).toMatchObject({status:"denied",retryable:false});expect(mocks.gateway).not.toHaveBeenCalled();
});
it.each(["routine","persistent-agent"])("refuses %s execution",async kind=>{
 mocks.request.mockResolvedValue({trigger:{kind:"owner_chat"},executor:{kind}});expect(await tool.execute!(input,ctx)).toMatchObject({status:"denied"});expect(mocks.gateway).not.toHaveBeenCalled();
});
it("stops when configuration is absent",async()=>{
 vi.stubEnv("FOREMAN_LINEAR_CONNECTOR","");expect(await tool.execute!(input,ctx)).toMatchObject({status:"unavailable",retryable:false});expect(mocks.gateway).not.toHaveBeenCalled();
});
it("preserves unknown outcome instead of reporting success",async()=>{
 mocks.gateway.mockRejectedValue(new ActionBlocked("result_unknown","action"));expect(await tool.execute!(input,ctx)).toMatchObject({status:"result_unknown",retryable:false});
});
