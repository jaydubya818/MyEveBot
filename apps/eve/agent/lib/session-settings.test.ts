import {beforeEach,describe,expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({model:null as string|null,reasoning:null as string|null}));
vi.mock("eve/context",()=>({defineState:()=>({get:()=>({...state}),update:(fn:any)=>Object.assign(state,fn(state))})}));
beforeEach(()=>Object.assign(state,{model:null,reasoning:null}));
vi.mock("./receipts-db.ts",()=>({db:vi.fn()}));
import {primaryChatSettings,rememberedChatSettings} from "./session-settings.ts";
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

describe("approval continuation model selection",()=>{
  it("retains the selected vision model when ephemeral client context disappears",()=>{
    rememberedChatSettings(requested);
    expect(primaryChatSettings(agent,rememberedChatSettings({model:null,reasoning:null}))).toEqual(requested);
  });
  it("accepts the next explicit picker change and resets reasoning",()=>{
    rememberedChatSettings({...requested,reasoning:"high"});
    const changed={model:"anthropic/claude-sonnet-5",reasoning:null};
    rememberedChatSettings(changed);
    expect(rememberedChatSettings({model:null,reasoning:null})).toEqual(changed);
  });
});
