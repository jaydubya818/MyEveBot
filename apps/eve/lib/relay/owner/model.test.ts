import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
const f=vi.hoisted(()=>({reserve:vi.fn(),settle:vi.fn(),unknown:vi.fn(),generate:vi.fn(),resolve:vi.fn(),capability:vi.fn(),pricing:vi.fn(),query:vi.fn(),qualification:vi.fn()}));
vi.mock('../../../agent/lib/receipts-db.ts',()=>({db:()=>({query:f.query})}));
vi.mock('../../agents.ts',()=>({getAgent:async()=>({preferredModel:'openai/fixture'}),effectiveCapability:f.capability}));
vi.mock('./runtime.ts',()=>({resolveOwnerRuntime:f.resolve}));
vi.mock('./config.ts',()=>({localOwnerQualification:f.qualification,ownerChannelConfiguration:()=>({enabled:true,trust:{mappings:[{enabled:true,ownerId:'owner',agentId:'agent',sourceIdentity:'source',allowedCapabilities:['web.read']}]}})}));
vi.mock('./model-budget.ts',()=>({OwnerModelBudget:class{reserve=f.reserve;settle=f.settle;unknown=f.unknown;}}));
vi.mock('ai',()=>({gateway:Object.assign(()=>({doGenerate:f.generate}),{getAvailableModels:f.pricing})}));
import {ownerBudgetedModel,ownerModelStepKey,scopedOwnerPrompt} from './model.ts';
const claim={ownerId:'owner',agentId:'agent',runId:'run',dispatchId:'00000000-0000-4000-8000-000000000000',expiresAt:Date.now()+60000,purpose:'execute' as const};
const options={prompt:[{role:'system' as const,content:'PRIVATE_CANARY_DO_NOT_DISCLOSE'},{role:'user' as const,content:[{type:'text' as const,text:'Public research only'}]}],tools:[{type:'function' as const,name:'web_fetch',description:'Public fetch',inputSchema:{}},{type:'function' as const,name:'recall_memory',description:'PRIVATE_TOOL_CANARY',inputSchema:{}}]};
const result={content:[{type:'text',text:'Public answer'}],finishReason:{unified:'stop',raw:'stop'},usage:{inputTokens:{total:100},outputTokens:{total:100}},warnings:[],providerMetadata:{gateway:{cost:'0.001'}}};
afterEach(()=>vi.unstubAllEnvs());
beforeEach(()=>{vi.clearAllMocks();f.qualification.mockReturnValue(false);f.reserve.mockResolvedValue(null);f.settle.mockResolvedValue(undefined);f.unknown.mockResolvedValue(undefined);f.generate.mockResolvedValue(result);f.resolve.mockResolvedValue({channelCapabilities:['web.read'],status:'running',source_identity:'source',request:{message:'Public research only'}});f.capability.mockReturnValue({allowed:true});f.pricing.mockResolvedValue({models:[{id:'openai/fixture',pricing:{input:'0.000001',output:'0.000002'}}]});f.query.mockResolvedValue([{run_id:'run'}]);});
describe('owner provider execution boundary',()=>{
 it('accounts reasoning tokens without exposing or replaying reasoning content',async()=>{
  f.generate.mockResolvedValue({...result,content:[{type:'reasoning',text:'PRIVATE_REASONING'},...result.content]});
  const response=await ownerBudgetedModel(claim,'turn:0').doGenerate(options);
  expect(response.content).toEqual(result.content);
  expect(JSON.stringify(f.settle.mock.calls[0])).not.toContain('PRIVATE_REASONING');
  expect(f.settle.mock.calls[0][1]).toEqual({microUsd:1000,tokens:200});
 });
 it('strips private context and tools before the actual provider boundary',async()=>{
  await ownerBudgetedModel(claim,'turn:0').doGenerate({...options,tools:[...options.tools,...['connection_search','workflow','ask_question'].map(name=>({type:'function' as const,name,inputSchema:{}}))]});
  const passed=f.generate.mock.calls[0][0];expect(JSON.stringify(passed)).not.toContain('PRIVATE_');expect(passed.tools.map((t:{name:string})=>t.name)).toEqual(['web_fetch']);
  expect(f.reserve).toHaveBeenCalledOnce();expect(f.settle).toHaveBeenCalledOnce();expect(f.reserve.mock.invocationCallOrder[0]).toBeLessThan(f.generate.mock.invocationCallOrder[0]);
 });
 it('denies exhausted budget before model work',async()=>{f.reserve.mockRejectedValue(new Error('exhausted'));await expect(ownerBudgetedModel(claim,'turn:0').doGenerate(options)).rejects.toThrow();expect(f.generate).not.toHaveBeenCalled();});
 it('denies MyEve authority before model work',async()=>{f.resolve.mockRejectedValue(new Error('revoked'));await expect(ownerBudgetedModel(claim,'turn:0').doGenerate(options)).rejects.toThrow();expect(f.generate).not.toHaveBeenCalled();});
 it('denies unknown pricing before reservation or model work',async()=>{f.pricing.mockResolvedValue({models:[]});await expect(ownerBudgetedModel(claim,'turn:0').doGenerate(options)).rejects.toThrow();expect(f.reserve).not.toHaveBeenCalled();expect(f.generate).not.toHaveBeenCalled();});
 it('rechecks authority after pricing lookup',async()=>{f.resolve.mockResolvedValueOnce({channelCapabilities:['web.read'],status:'running',source_identity:'source',request:{message:'Public research only'}}).mockRejectedValueOnce(new Error('revoked'));await expect(ownerBudgetedModel(claim,'turn:0').doGenerate(options)).rejects.toThrow();expect(f.generate).not.toHaveBeenCalled();});
 it('completed retry replays without a provider call',async()=>{f.reserve.mockResolvedValue({result});expect(await ownerBudgetedModel(claim,'turn:0').doGenerate(options)).toEqual(result);expect(f.generate).not.toHaveBeenCalled();});
 it.each([null,'',false])('rejects unknown provider cost %s without exposing output',async cost=>{f.generate.mockResolvedValue({...result,providerMetadata:{gateway:{cost}}});await expect(ownerBudgetedModel(claim,'turn:0').doGenerate(options)).rejects.toThrow('usage unavailable');expect(f.unknown).toHaveBeenCalledOnce();expect(f.settle).not.toHaveBeenCalled();});
 it('retains reservation on provider failure',async()=>{f.generate.mockRejectedValue(new Error('lost response'));await expect(ownerBudgetedModel(claim,'turn:0').doGenerate(options)).rejects.toThrow();expect(f.unknown).toHaveBeenCalledOnce();});
 it.each(['recall_memory','connection_search','workflow','ask_question'])('accounts forbidden %s but never exposes it for execution',async(toolName)=>{f.generate.mockResolvedValue({...result,content:[{type:'tool-call',toolCallId:'bad',toolName,input:'{}'}]});await expect(ownerBudgetedModel(claim,'turn:0').doGenerate(options)).rejects.toThrow('out-of-scope');expect(f.settle).toHaveBeenCalledOnce();expect(f.settle.mock.calls[0][2].content).toEqual([]);});
 it('enforces local capability denial even when the transport permits research',async()=>{f.capability.mockReturnValue({allowed:false});await expect(ownerBudgetedModel(claim,'turn:0').doGenerate(options)).rejects.toThrow('MyEve denies');expect(f.generate).not.toHaveBeenCalled();});
 it('buffers provider output until durable accounting completes',async()=>{f.settle.mockRejectedValue(new Error('database unavailable'));await expect(ownerBudgetedModel(claim,'turn:0').doStream(options)).rejects.toThrow();expect(f.unknown).toHaveBeenCalledOnce();});
 it('rejects context mutation, attachment and additional user turns',()=>{
  expect(()=>scopedOwnerPrompt(options,'changed',[])).toThrow();
  expect(()=>scopedOwnerPrompt({...options,prompt:[...options.prompt,options.prompt[1]]},'Public research only',[])).toThrow();
 });
 it('denies cancellation-purpose claims before any provider invocation',async()=>{await expect(ownerBudgetedModel({...claim,purpose:'cancel'},'turn:0').doGenerate(options)).rejects.toThrow();expect(f.generate).not.toHaveBeenCalled();});
 it('fails closed inside the model for invalid dynamic step identity',async()=>{expect(ownerModelStepKey({data:{turnId:'turn',stepIndex:2}})).toBe('turn:2');await expect(ownerBudgetedModel(claim,ownerModelStepKey(null)).doGenerate(options)).rejects.toThrow();expect(f.generate).not.toHaveBeenCalled();});
});

describe('Telegram email proposal routing',()=>{
 const message='Exact email request';
 const mail={type:'function' as const,name:'send_email',description:'get a yes from owner first',inputSchema:{type:'object'}};
 const input={prompt:[{role:'user' as const,content:[{type:'text' as const,text:message}]}],tools:[mail,...options.tools]};
 it('replaces chat confirmation instructions without changing the tool schema or input',()=>{
  const scoped=scopedOwnerPrompt(input,message,['send_email'],true);
  expect(scoped.toolChoice).toEqual({type:'tool',toolName:'send_email'});
  expect(scoped.tools).toHaveLength(1);
  expect(scoped.tools?.[0]).toMatchObject({name:'send_email',inputSchema:mail.inputSchema});
  const selected=scoped.tools?.[0];
  expect(selected?.type==='function' ? selected.description : '').toContain('Calling this tool is not approval');
  expect(scoped.prompt[1]).toEqual(input.prompt[0]);
  expect(mail.description).toBe('get a yes from owner first');
 });
 it('does not force ordinary requests or tools denied by capability policy',()=>{
  expect(scopedOwnerPrompt(input,message,['send_email']).toolChoice).toEqual({type:'auto'});
  const denied=scopedOwnerPrompt(input,message,['web_fetch'],true);
  expect(denied.toolChoice).toEqual({type:'auto'});
  expect(denied.tools?.map(t=>t.type==='function'?t.name:'')).toEqual(['web_fetch']);
 });
 it('does not force a second email proposal after an assistant or tool response',()=>{
  const prompt=[...input.prompt,{role:'assistant' as const,content:[{type:'tool-call' as const,toolCallId:'call',toolName:'send_email',input:'{}'}]}];
  expect(scopedOwnerPrompt({...input,prompt},message,['send_email'],true).toolChoice).toEqual({type:'auto'});
 });
 it('keeps the admitted-message guard even when proposal selection is requested',()=>{
  expect(()=>scopedOwnerPrompt(input,'changed',['send_email'],true)).toThrow('context changed');
 });
});

describe('qualification provider selection',()=>{
 it('passes explicit tool selection through the budgeted provider, without changing the draft',async()=>{
  f.qualification.mockReturnValue(true);
  for(const [key,value] of Object.entries({MYEVE_OWNER_LOCAL_EMAIL_RECIPIENT:'owner@example.test',MYEVE_OWNER_LOCAL_EMAIL_SUBJECT:'Fixture',MYEVE_OWNER_LOCAL_EMAIL_TEXT:'Exact body.',MYEVE_OWNER_LOCAL_EMAIL_MAX_SENDS:'1',MYEVE_OWNER_LOCAL_EMAIL_PIN_ID:'email-pin-2'}))vi.stubEnv(key,value);
  const message='Please send an email to owner@example.test.\n\nSubject: Fixture\n\nBody:\nExact body.';
  f.resolve.mockResolvedValue({channelCapabilities:['web.read','tool.send_email'],status:'running',request:{message}});
  const toolCall={type:'tool-call',toolCallId:'proposal',toolName:'send_email',input:JSON.stringify({to:['owner@example.test'],subject:'Fixture',text:'Exact body.'})};
  f.generate.mockResolvedValue({...result,content:[toolCall]});
  const response=await ownerBudgetedModel({...claim,ownerId:'qualification-owner',agentId:'qualification-agent'},'turn:0').doGenerate({prompt:[{role:'user',content:[{type:'text',text:message}]}],tools:[{type:'function',name:'send_email',inputSchema:{}}]});
  expect(f.generate.mock.calls[0][0].toolChoice).toEqual({type:'tool',toolName:'send_email'});
  expect(response.content).toEqual([toolCall]);
  expect(f.reserve).toHaveBeenCalledOnce();
  expect(f.settle).toHaveBeenCalledOnce();
 });
});
