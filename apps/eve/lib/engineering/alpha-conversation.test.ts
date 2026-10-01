import {generateText,streamText,tool,jsonSchema} from "ai";
import captured from "./fixtures/first-live-factory-proposal.json";
import {describe,it,expect,vi,afterEach} from "vitest";
import {alphaConversationOptions,validAlphaConversationResponse,normalizeAlphaConversationResponse,engineeringConversationModel} from "./conversation-model.ts";
import {alphaConversationQualificationSchema} from "./alpha-conversation-policy.ts";
const q=()=>alphaConversationQualificationSchema.parse({mode:"FACTORY_CONVERSATION_V1",modelId:"openai/gpt-5.4-mini",expiresAt:new Date(Date.now()+60000).toISOString(),evidenceRef:"synthetic tests only",ceilingMicrousd:300000,perCallMicrousd:150000,maxCalls:2,maxOutputTokens:1024,factoryCeilingMicrousd:1050000});
const work={id:"01000000-0000-4000-8000-000000000001",version:2,generation:1};
const options={prompt:[],tools:[{type:"function",name:"engineering_factory",inputSchema:{}},{type:"function",name:"engineering_direct",inputSchema:{}},{type:"function",name:"send_email",inputSchema:{}}]} as never;
function setup(generation=1){
 const selectedWork={...work,generation};
 vi.stubEnv("MYEVE_FACTORY_REAL_EXECUTION_APPROVED","true");vi.stubEnv("MYEVE_FACTORY_APPROVED_WORK_ID",work.id);vi.stubEnv("MYEVE_FACTORY_APPROVED_WORK_VERSION","2");vi.stubEnv("MYEVE_FACTORY_APPROVED_WORK_GENERATION",String(generation));
 const provider=vi.fn().mockResolvedValue({content:[{type:"tool-call",toolCallId:"a",toolName:"engineering_factory",input:JSON.stringify({operation:"start",expectedWorkVersion:2,expectedWorkGeneration:1})}],usage:{},finishReason:{unified:"tool-calls",raw:"tool-calls"},warnings:[],providerMetadata:{gateway:{cost:"0.002",generationId:"synthetic"}}});
 const budget={remainingMilliseconds:vi.fn().mockResolvedValue(600000),reserve:vi.fn().mockResolvedValue(null),assertDispatch:vi.fn(),settle:vi.fn(),assertOutput:vi.fn(),unknown:vi.fn()};
 const config={conversationQualification:q(),profile:{maxOutputTokens:9000,maxModelRequests:30}};
 const model=engineeringConversationModel({store:{get:async()=>selectedWork} as never,workId:work.id,sessionId:"s",stepKey:"s:0",modelId:q().modelId,productive:true},{authority:{readConfig:async()=>config} as never,budget:budget as never,phase:async()=>"admission",catalog:async()=>({models:[{id:q().modelId,pricing:{input:"0.00000075",output:"0.0000045"}}]}) as never,model:()=>({doGenerate:provider}) as never});
 return {provider,budget,model,config};
}
afterEach(()=>vi.unstubAllEnvs());
describe("private-alpha selected Work model",()=>{
 it("exposes only canonical start and no native, publication or unrelated tool",()=>{
  const scoped=alphaConversationOptions(options,1024,"admission");expect(scoped.tools?.map(t=>t.name)).toEqual(["engineering_factory"]);expect(scoped.maxOutputTokens).toBe(1024);
  expect(alphaConversationOptions(options,1024,"observation").tools).toEqual([]);expect(()=>alphaConversationOptions(options,1024,"execution")).toThrow(/native/);
 });
 it("accepts only one exact Factory proposal and text-only explanation",()=>{
  const call={type:"tool-call" as const,toolCallId:"a",toolName:"engineering_factory",input:JSON.stringify({operation:"start",expectedWorkVersion:2,expectedWorkGeneration:1})};
  expect(validAlphaConversationResponse([call],"admission")).toBe(true);expect(validAlphaConversationResponse([call,call],"admission")).toBe(false);expect(validAlphaConversationResponse([call],"observation")).toBe(false);
  for(const operation of ["stop","takeover","publish","admit"])expect(validAlphaConversationResponse([{...call,input:JSON.stringify({operation,expectedWorkVersion:2,expectedWorkGeneration:1})}],"admission")).toBe(false);
 });
 it("uses the common ledger, bounded output and OpenAI-only existing Gateway",async()=>{
  const f=setup();await f.model.doGenerate(options);expect(f.budget.reserve.mock.calls[0][0]).toMatchObject({maxCalls:2,bounds:{maxOutputTokens:1024,alphaFactory:{stage:"admission"}}});expect(f.provider.mock.calls[0][0].providerOptions).toEqual({gateway:{only:["openai"]}});expect(f.budget.settle.mock.calls[0][1]).toBe(2000);
 });
 it.each(["MYEVE_FACTORY_REAL_EXECUTION_APPROVED","MYEVE_FACTORY_APPROVED_WORK_ID","MYEVE_FACTORY_APPROVED_WORK_VERSION","MYEVE_FACTORY_APPROVED_WORK_GENERATION"])("denies missing exact first-operation approval %s",async key=>{
  const f=setup();vi.stubEnv(key,"");await expect(f.model.doGenerate(options)).rejects.toThrow(/approval/);expect(f.provider).not.toHaveBeenCalled();expect(f.budget.reserve).not.toHaveBeenCalled();
 });
 it("denies expired qualification without fallback",async()=>{const f=setup();f.config.conversationQualification.expiresAt="2000-01-01T00:00:00.000Z";await expect(f.model.doGenerate(options)).rejects.toThrow(/expired/);expect(f.provider).not.toHaveBeenCalled();});
 it("retains UNKNOWN on provider loss without retry",async()=>{const f=setup();f.provider.mockRejectedValue(Error("lost"));await expect(f.model.doGenerate(options)).rejects.toThrow("lost");expect(f.provider).toHaveBeenCalledTimes(1);expect(f.budget.unknown).toHaveBeenCalledTimes(1);});
 it("denies a common-ledger rejection before the provider",async()=>{const f=setup();f.budget.reserve.mockRejectedValue(Error("UNKNOWN fenced"));await expect(f.model.doGenerate(options)).rejects.toThrow("UNKNOWN");expect(f.provider).not.toHaveBeenCalled();});
});

it("normalizes the captured live JSON-text start through the canonical tool boundary",async()=>{
 const f=setup(2);f.provider.mockResolvedValue({...captured,usage:{},warnings:[],providerMetadata:{gateway:{cost:"0.000717"}}} as never);
 const result=await f.model.doGenerate(options);
 expect(result.content).toEqual([expect.objectContaining({type:"tool-call",toolName:"engineering_factory",input:JSON.stringify({operation:"start",expectedWorkVersion:2,expectedWorkGeneration:2})})]);
 expect(result.finishReason.unified).toBe("tool-calls");
 expect(f.provider).toHaveBeenCalledTimes(1);
});

describe("strict proposal normalization is not admission authority",()=>{
 const context={productive:true,version:2,generation:2,stepKey:"synthetic:0"};
 const content=captured.content as Parameters<typeof normalizeAlphaConversationResponse>[0];
 it("is deterministic under replay and retains the original provider structure",()=>{
  const first=normalizeAlphaConversationResponse(content,"admission",context);
  expect(first).toEqual(normalizeAlphaConversationResponse(content,"admission",context));
  expect(first.normalized).toBe(true);expect(content[0].type).toBe("text");
 });
 it.each([{version:3},{generation:3},{productive:false}])("denies stale or nonproductive context %j",patch=>{
  expect(normalizeAlphaConversationResponse(content,"admission",{...context,...patch})).toMatchObject({valid:false,content:[]});
 });
 it("does not turn observation into a tool call",()=>{
  expect(normalizeAlphaConversationResponse(content,"observation",context).content).toEqual(content);
 });
 it.each(['{bad json}', '[]', '```json\n{}\n```',JSON.stringify({operation:"publish",expectedWorkVersion:2,expectedWorkGeneration:2}),JSON.stringify({operation:"start",expectedWorkVersion:2,expectedWorkGeneration:2,authority:"ALLOW"}),JSON.stringify({operation:"start",expectedWorkVersion:2})])("rejects malformed or unsupported proposals %s",text=>{
  expect(normalizeAlphaConversationResponse([{type:"text",text}],"admission",context)).toMatchObject({valid:false,content:[]});
 });
 it("rejects duplicate, foreign and provider-executed tool calls",()=>{
  const call={type:"tool-call" as const,toolName:"engineering_factory",toolCallId:"test",input:content[0].type==="text"?content[0].text:""};
  for(const items of [[call,call],[{...call,providerExecuted:true}],[{...call,toolName:"send_email"}],[call,...content]])expect(normalizeAlphaConversationResponse(items,"admission",context).valid).toBe(false);
 });
 it.each(["generate","stream"])("executes the normalized call through the installed SDK %s tool boundary",async mode=>{
  const f=setup(2),execute=vi.fn().mockResolvedValue({state:"QUEUED",executionGranted:false});
  f.provider.mockResolvedValue({...captured,usage:{inputTokens:{total:10,noCache:10,cacheRead:0,cacheWrite:0},outputTokens:{total:10,text:10,reasoning:0}},warnings:[],providerMetadata:{gateway:{cost:"0.000717"}}} as never);
  const request={model:f.model,prompt:"Continue selected Work",tools:{engineering_factory:tool({inputSchema:jsonSchema({type:"object",properties:{operation:{const:"start"},expectedWorkVersion:{type:"integer"},expectedWorkGeneration:{type:"integer"}},required:["operation","expectedWorkVersion","expectedWorkGeneration"],additionalProperties:false}),execute})}};
  if(mode==="stream")await streamText(request).consumeStream();else await generateText(request);
  expect(execute).toHaveBeenCalledTimes(1);expect(execute.mock.calls[0][0]).toEqual({operation:"start",expectedWorkVersion:2,expectedWorkGeneration:2});
  expect(f.provider).toHaveBeenCalledTimes(1);
  expect(f.budget.settle.mock.calls[0][2]).toMatchObject({proposalNormalization:{originalContent:captured.content,format:"STRICT_FACTORY_START_JSON"}});
 });
});
