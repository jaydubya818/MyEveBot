import {describe,it,expect,vi} from "vitest";
import {conversationPhase,conversationOptions,validConversationResponse,engineeringConversationModel} from "./conversation-model.ts";
const options={prompt:[{role:"user",content:[{type:"text",text:"Inspect Work"}]}],tools:[{type:"function",name:"engineering_direct",inputSchema:{type:"object"}},{type:"function",name:"send_email",inputSchema:{type:"object"}}]} as never;
function fixture(){
  const reserve=vi.fn().mockResolvedValue(null),settle=vi.fn().mockResolvedValue(undefined),unknown=vi.fn().mockResolvedValue(undefined);
  const provider=vi.fn().mockResolvedValue({content:[{type:"text",text:"PARTIAL"}],usage:{inputTokens:{total:10},outputTokens:{total:2}},finishReason:{unified:"stop",raw:"stop"},warnings:[],providerMetadata:{gateway:{cost:"0.001"}}});
  const events:string[]=[];reserve.mockImplementation(async()=>{events.push("reserve");return null});settle.mockImplementation(async()=>{events.push("settle")});
  const model=engineeringConversationModel({store:{} as never,workId:"work",sessionId:"s",stepKey:"s:turn:0",modelId:"anthropic/claude-sonnet-5",productive:false},{
    authority:{readConfig:async()=>({model:"claude-sonnet-5",nativeQualification:{modelId:"anthropic/claude-sonnet-5",expiresAt:new Date(Date.now()+60000).toISOString()},profile:{maxOutputTokens:1024,maxModelRequests:5}})} as never,
    budget:{reserve,settle,unknown,assertDispatch:async()=>{}} as never,phase:async()=>"observation",
    catalog:async()=>({models:[{id:"anthropic/claude-sonnet-5",pricing:{input:"0.000003",output:"0.000015"}}]}) as never,
    model:()=>({doGenerate:async (o:unknown)=>{events.push("dispatch");return provider(o)}}) as never});
  return {model,reserve,settle,unknown,provider,events};
}
describe("selected Work conversation boundary",()=>{
  it("defaults to observation and never converts another writer into this session",()=>{
    expect(conversationPhase(false,true,null,"new")).toBe("observation");
    expect(conversationPhase(false,false,null,"new")).toBe("observation");
    expect(conversationPhase(true,false,null,"new")).toBe("admission");
    expect(conversationPhase(true,true,null,"new")).toBe("execution");
    expect(conversationPhase(true,true,"old","new")).toBe("observation");
    expect(conversationPhase(true,true,"old","old")).toBe("execution");
  });
  it("advertises inspection only to observers and refuses write/admit/extra authority results",()=>{
    const scoped=conversationOptions(options,1024,"observation");
    expect(scoped.tools?.map(t=>t.name)).toEqual(["engineering_direct"]);
    expect(JSON.stringify(scoped.tools)).not.toContain('"write"');
    for(const request of [{operation:"write",path:"quantity.mjs",expectedRevision:1,content:"x"},{operation:"admit",expectedWorkVersion:1},{operation:"inspect",authority:"owner"}])
      expect(validConversationResponse([{type:"tool-call",toolCallId:"a",toolName:"engineering_direct",input:JSON.stringify({request})}],"observation")).toBe(false);
  });
  it("durably reserves before dispatch and retains result before exposure",async()=>{
    const f=fixture();await f.model.doGenerate(options);expect(f.events).toEqual(["reserve","dispatch","settle"]);
    expect(f.settle.mock.calls[0][1]).toBe(1000);expect(f.reserve.mock.calls[0][0].microUsd).toBeGreaterThan(1000);
  });
  it("budget denial dispatches zero provider calls",async()=>{
    const f=fixture();f.reserve.mockRejectedValue(new Error("budget denied"));await expect(f.model.doGenerate(options)).rejects.toThrow("budget denied");expect(f.provider).not.toHaveBeenCalled();
  });
  it("reuses exact retained response without provider dispatch or additional settlement",async()=>{
    const f=fixture(),result={content:[{type:"text",text:"retained"}]};f.reserve.mockResolvedValue({result});expect(await f.model.doGenerate(options)).toEqual(result);expect(f.provider).not.toHaveBeenCalled();expect(f.settle).not.toHaveBeenCalled();
  });
  it.each([undefined,null,"",NaN])("missing/unknown usage %s stays fenced",async cost=>{
    const f=fixture();f.provider.mockResolvedValue({content:[],providerMetadata:{gateway:{cost}}});await expect(f.model.doGenerate(options)).rejects.toThrow("Unknown provider usage");expect(f.unknown).toHaveBeenCalled();expect(f.settle).not.toHaveBeenCalled();
  });
  it("expired qualification dispatches no provider call or budget reservation",async()=>{
    const f=fixture();vi.useFakeTimers();vi.setSystemTime(Date.now()+120000);
    // Fixed expiry is supplied independently so configuration cannot slide with the clock.
    const model=engineeringConversationModel({store:{} as never,workId:"work",sessionId:"s",stepKey:"s:0",modelId:"anthropic/claude-sonnet-5",productive:false},{
      authority:{readConfig:async()=>({model:"claude-sonnet-5",nativeQualification:{modelId:"anthropic/claude-sonnet-5",expiresAt:"2000-01-01T00:00:00Z"}})} as never,
      budget:{reserve:f.reserve} as never,model:()=>({doGenerate:f.provider}) as never});
    try {await expect(model.doGenerate(options)).rejects.toThrow("expired");expect(f.reserve).not.toHaveBeenCalled();expect(f.provider).not.toHaveBeenCalled();}finally{vi.useRealTimers();}
  });
  it("provider loss after dispatch stays fenced",async()=>{
    const f=fixture();f.provider.mockRejectedValue(new Error("transport lost"));await expect(f.model.doGenerate(options)).rejects.toThrow("transport lost");expect(f.unknown).toHaveBeenCalled();
  });
});
