import { z } from "zod";
import { nativeDevelopmentInputSchema, nativeDevelopmentToolSchema } from "./native-input.ts";
import { describe, expect, it, vi } from "vitest";
import { nativeBudgetedModel, nativeModelOptions, nativeToolInput } from "./native-model.ts";
import type { WorkStore } from "./store.ts";
import type { NativeRouteAuthority } from "./native-routing.ts";
import type { NativeModelBudget } from "./native-model-budget.ts";
const options={prompt:[{role:"user",content:[{type:"text",text:"Fix the synthetic parser."}]}],tools:[{type:"function",name:"engineering_direct",inputSchema:{type:"object"}},{type:"function",name:"send_email",inputSchema:{type:"object"}}],providerOptions:{gateway:{models:["unapproved-model"]}},maxOutputTokens:100000} as Parameters<typeof nativeModelOptions>[0];
function fixture() {
  const reserve=vi.fn().mockResolvedValue(null),settle=vi.fn().mockResolvedValue(undefined),unknown=vi.fn().mockResolvedValue(undefined);
  const effect=vi.fn().mockResolvedValue({contract:{deadline:new Date(Date.now()+60000).toISOString()}});
  const modelCall=vi.fn().mockResolvedValue({content:[{type:"text",text:"Done"}],usage:{inputTokens:{total:50},outputTokens:{total:10}},finishReason:{unified:"stop",raw:"stop"},warnings:[],providerMetadata:{gateway:{cost:"0.001"}}});
  const model=nativeBudgetedModel({store:{principal:{scopeId:"owner",scopeKind:"personal"},database:{query:async()=>[]}} as unknown as WorkStore,workId:"work",sessionId:"session",stepKey:"turn:0",modelId:"anthropic/claude-sonnet-5"}, {
    currentTruth:async()=>[],
    completionState:async()=>({contract:{id:"contract",inputBytes:14336},stage:"IMPLEMENT",workspace:{},waiting:false}),
    authority:{readConfig:async()=>({model:"claude-sonnet-5",profile:{maxOutputTokens:1024,maxModelRequests:5}}),assertEffect:effect} as unknown as NativeRouteAuthority,
    budget:{reserve,settle,unknown,assertOutput:async()=>{},assertDispatch:vi.fn().mockResolvedValue(undefined)} as unknown as NativeModelBudget,
    catalog:vi.fn().mockResolvedValue({models:[{id:"anthropic/claude-sonnet-5",pricing:{input:"0.000003",output:"0.000015"}}]}),model:()=>({doGenerate:modelCall}) as never,
  });return {model,reserve,settle,unknown,effect,modelCall};
}
describe("native Work provider boundary",()=>{
  it("advertises only the guarded tool and strips fallbacks",()=>{
    const scoped=nativeModelOptions(options,1024);expect(scoped.tools?.map(tool=>tool.name)).toEqual(["engineering_direct"]);expect(scoped.maxOutputTokens).toBe(1024);expect(scoped.providerOptions).toEqual({});
    expect(()=>nativeModelOptions({...options,prompt:[{role:"user",content:[{type:"file",mediaType:"image/png",data:{type:"url",url:new URL("https://example.com/private.png")}}]}]},1024)).toThrow(/text context/);
  });
  it("preserves operation requirements with an explicit provider object root",()=>{
    const original=JSON.parse(JSON.stringify(z.toJSONSchema(nativeDevelopmentToolSchema)));
    const scoped=nativeModelOptions({...options,tools:[{type:"function",name:"engineering_direct",inputSchema:original}]},1024);
    expect(original.type).toBe("object");expect(original.oneOf).toBeUndefined();
    expect(original.properties.request.oneOf).toHaveLength(7);
    expect(scoped.tools?.[0]).toMatchObject({inputSchema:original});
    expect(nativeDevelopmentInputSchema.safeParse({operation:"plan",plan:"Fix parser"}).success).toBe(false);
  });
  it("recovers only complete locally valid Gateway-wrapped inputs",()=>{
    const value={request:{operation:"submit",expectedRevision:3}};
    expect(nativeToolInput(JSON.stringify({rawInvalidInput:value}))).toBe(JSON.stringify(value));
    for(const value of [{request:{operation:"submit"}},{request:{operation:"submit",expectedRevision:"3"}},{request:{operation:"open",authority:"allow"}}]) {
      const wrapped=JSON.stringify({rawInvalidInput:value});expect(nativeToolInput(wrapped)).toBe(wrapped);
    }
  });
  it("reserves before execution and settles before output",async()=>{
    const f=fixture();await f.model.doGenerate(options);expect(f.reserve.mock.invocationCallOrder[0]).toBeLessThan(f.modelCall.mock.invocationCallOrder[0]);expect(f.settle).toHaveBeenCalledWith(expect.anything(),1000,expect.objectContaining({content:[{type:"text",text:"Done"}]}));expect(f.modelCall.mock.calls[0][0].providerOptions).toEqual({gateway:{only:["anthropic"]}});
  });
  it("replays retained output without calling the provider",async()=>{
    const f=fixture();f.reserve.mockResolvedValue({result:{content:[{type:"text",text:"Retained"}]}});expect((await f.model.doGenerate(options)).content).toEqual([{type:"text",text:"Retained"}]);expect(f.modelCall).not.toHaveBeenCalled();
  });
  it("does not expose unaccounted model output",async()=>{
    const f=fixture();f.modelCall.mockResolvedValue({content:[{type:"text",text:"Unaccounted"}],providerMetadata:{}});await expect(f.model.doGenerate(options)).rejects.toThrow(/usage is unavailable/);expect(f.unknown).toHaveBeenCalledOnce();expect(f.settle).not.toHaveBeenCalled();
  });
  it("accounts but rejects an out-of-scope tool call",async()=>{
    const f=fixture();f.modelCall.mockResolvedValue({content:[{type:"tool-call",toolName:"send_email",toolCallId:"x",input:"{}"}],usage:{},finishReason:{unified:"tool-calls"},warnings:[],providerMetadata:{gateway:{cost:0.001}}});await expect(f.model.doGenerate(options)).rejects.toThrow(/unqualified/);expect(f.settle).toHaveBeenCalledWith(expect.anything(),1000,expect.objectContaining({content:[]}));
  });
});
