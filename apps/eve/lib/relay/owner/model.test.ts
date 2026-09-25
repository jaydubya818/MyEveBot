import {beforeEach,describe,it,expect,vi} from 'vitest';
const f=vi.hoisted(()=>({reserve:vi.fn(),settle:vi.fn(),unknown:vi.fn(),generate:vi.fn(),resolve:vi.fn(),capability:vi.fn(),pricing:vi.fn(),query:vi.fn()}));
vi.mock('../../../agent/lib/receipts-db.ts',()=>({db:()=>({query:f.query})}));
vi.mock('../../agents.ts',()=>({getAgent:async()=>({preferredModel:'openai/fixture'}),effectiveCapability:f.capability}));
vi.mock('./runtime.ts',()=>({resolveOwnerRuntime:f.resolve}));
vi.mock('./config.ts',()=>({ownerChannelConfiguration:()=>({enabled:true,trust:{mappings:[{enabled:true,ownerId:'owner',agentId:'agent',sourceIdentity:'source',allowedCapabilities:['web.read']}]}})}));
vi.mock('./model-budget.ts',()=>({OwnerModelBudget:class{reserve=f.reserve;settle=f.settle;unknown=f.unknown;}}));
vi.mock('ai',()=>({gateway:Object.assign(()=>({doGenerate:f.generate}),{getAvailableModels:f.pricing})}));
import {ownerBudgetedModel,ownerModelStepKey,scopedOwnerPrompt} from './model.ts';
const claim={ownerId:'owner',agentId:'agent',runId:'run',dispatchId:'00000000-0000-4000-8000-000000000000',expiresAt:Date.now()+60000,purpose:'execute' as const};
const options={prompt:[{role:'system' as const,content:'PRIVATE_CANARY_DO_NOT_DISCLOSE'},{role:'user' as const,content:[{type:'text' as const,text:'Public research only'}]}],tools:[{type:'function' as const,name:'web_fetch',description:'Public fetch',inputSchema:{}},{type:'function' as const,name:'recall_memory',description:'PRIVATE_TOOL_CANARY',inputSchema:{}}]};
const result={content:[{type:'text',text:'Public answer'}],finishReason:{unified:'stop',raw:'stop'},usage:{inputTokens:{total:100},outputTokens:{total:100}},warnings:[],providerMetadata:{gateway:{cost:'0.001'}}};
beforeEach(()=>{vi.clearAllMocks();f.reserve.mockResolvedValue(null);f.settle.mockResolvedValue(undefined);f.unknown.mockResolvedValue(undefined);f.generate.mockResolvedValue(result);f.resolve.mockResolvedValue({channelCapabilities:['web.read'],status:'running',source_identity:'source',request:{message:'Public research only'}});f.capability.mockReturnValue({allowed:true});f.pricing.mockResolvedValue({models:[{id:'openai/fixture',pricing:{input:'0.000001',output:'0.000002'}}]});f.query.mockResolvedValue([{run_id:'run'}]);});
describe('owner provider execution boundary',()=>{
 it('accounts reasoning tokens without exposing or replaying reasoning content',async()=>{
  f.generate.mockResolvedValue({...result,content:[{type:'reasoning',text:'PRIVATE_REASONING'},...result.content]});
  const response=await ownerBudgetedModel(claim,'turn:0').doGenerate(options);
  expect(response.content).toEqual(result.content);
  expect(JSON.stringify(f.settle.mock.calls[0])).not.toContain('PRIVATE_REASONING');
  expect(f.settle.mock.calls[0][1]).toEqual({microUsd:1000,tokens:200});
 });
 it('strips private context and tools before the actual provider boundary',async()=>{
  await ownerBudgetedModel(claim,'turn:0').doGenerate(options);
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
 it('accounts a forbidden tool response but never exposes it for execution',async()=>{f.generate.mockResolvedValue({...result,content:[{type:'tool-call',toolCallId:'bad',toolName:'recall_memory',input:'{}'}]});await expect(ownerBudgetedModel(claim,'turn:0').doGenerate(options)).rejects.toThrow('out-of-scope');expect(f.settle).toHaveBeenCalledOnce();expect(f.settle.mock.calls[0][2].content).toEqual([]);});
 it('enforces local capability denial even when the transport permits research',async()=>{f.capability.mockReturnValue({allowed:false});await expect(ownerBudgetedModel(claim,'turn:0').doGenerate(options)).rejects.toThrow('MyEve denies');expect(f.generate).not.toHaveBeenCalled();});
 it('buffers provider output until durable accounting completes',async()=>{f.settle.mockRejectedValue(new Error('database unavailable'));await expect(ownerBudgetedModel(claim,'turn:0').doStream(options)).rejects.toThrow();expect(f.unknown).toHaveBeenCalledOnce();});
 it('rejects context mutation, attachment and additional user turns',()=>{
  expect(()=>scopedOwnerPrompt(options,'changed',[])).toThrow();
  expect(()=>scopedOwnerPrompt({...options,prompt:[...options.prompt,options.prompt[1]]},'Public research only',[])).toThrow();
 });
 it('denies cancellation-purpose claims before any provider invocation',async()=>{await expect(ownerBudgetedModel({...claim,purpose:'cancel'},'turn:0').doGenerate(options)).rejects.toThrow();expect(f.generate).not.toHaveBeenCalled();});
 it('fails closed inside the model for invalid dynamic step identity',async()=>{expect(ownerModelStepKey({data:{turnId:'turn',stepIndex:2}})).toBe('turn:2');await expect(ownerBudgetedModel(claim,ownerModelStepKey(null)).doGenerate(options)).rejects.toThrow();expect(f.generate).not.toHaveBeenCalled();});
});
