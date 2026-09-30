import {describe,expect,it,vi} from "vitest";
vi.mock("./receipts-db.ts",()=>({db:vi.fn()}));
import {primaryChatSettings} from "./session-settings.ts";
const agent={isPrimary:true,preferredModel:"poolside/laguna-s-2.1-free",reasoningPreference:"low" as const};
const requested={model:"openai/sol",reasoning:null};
describe("ordinary primary chat model selection",()=>{
  it("honors the visible picker and its default reasoning",()=>{
    expect(primaryChatSettings(agent,requested)).toEqual(requested);
  });
  it("uses configured defaults without client selection",()=>{
    expect(primaryChatSettings(agent,{model:null,reasoning:null})).toEqual({model:agent.preferredModel,reasoning:"low"});
  });
  it("preserves managed Agent model and reasoning",()=>{
    expect(primaryChatSettings({...agent,isPrimary:false},requested)).toEqual({model:agent.preferredModel,reasoning:"low"});
  });
});
